import { test, mock } from "node:test";
import assert from "node:assert/strict";
import nodemailer from "nodemailer";
import type { SendMailOptions } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport/index.js";
import { config } from "../src/config.js";
import { deliverOtp } from "../src/providers.js";

test("SMTP OTP delivery requires TLS and never returns codes or provider errors", async () => {
  const original = { ...config };
  Object.assign(config, {
    OTP_PROVIDER: "smtp",
    SMTP_HOST: "smtp.example.test",
    SMTP_PORT: 465,
    SMTP_USER: "sender@example.test",
    SMTP_PASS: "test-only-password",
    MAIL_FROM: "Verysure <sender@example.test>",
  });
  let options: SMTPTransport.Options | undefined;
  let message: SendMailOptions | undefined;
  let failure = false;
  let rejected = false;
  let closed = 0;
  const transport = mock.method(
    nodemailer,
    "createTransport",
    (input: SMTPTransport.Options) => {
      options = input;
      return {
        async sendMail(mail: SendMailOptions) {
          message = mail;
          if (failure)
            throw new Error(
              "Sensitive SMTP response test-only-password 123456",
            );
          return { accepted: rejected ? [] : ["recipient@example.test"] };
        },
        close() {
          closed++;
        },
      } as unknown as ReturnType<typeof nodemailer.createTransport>;
    },
  );
  try {
    assert.deepEqual(await deliverOtp("recipient@example.test", "123456"), {});
    assert.equal(options?.secure, true);
    assert.equal(options?.requireTLS, true);
    assert.equal(options?.logger, false);
    assert.equal(message?.to, "recipient@example.test");
    assert.match(String(message?.text), /123456/);
    assert.equal(closed, 1);

    config.SMTP_PORT = 587;
    await deliverOtp("recipient@example.test", "654321");
    assert.equal(options?.secure, false);
    assert.equal(options?.requireTLS, true);

    for (const mode of ["error", "rejected"]) {
      failure = mode === "error";
      rejected = mode === "rejected";
      await assert.rejects(
        deliverOtp("recipient@example.test", "123456"),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.equal(
            error.message,
            "The verification code could not be delivered. Please try again.",
          );
          return true;
        },
      );
    }
    assert.equal(closed, 4);
  } finally {
    transport.mock.restore();
    Object.assign(config, original);
  }
});
