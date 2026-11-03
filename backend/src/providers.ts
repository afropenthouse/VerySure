import { config } from "./config.js";
import { ApiError } from "./security.js";
import nodemailer from "nodemailer";
import { initializePaystack } from "./paystack.js";
export async function deliverOtp(email: string, otp: string) {
  if (config.OTP_PROVIDER === "demo") return { demoCode: otp };
  if (config.OTP_PROVIDER === "smtp") {
    const transport = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_PORT === 465,
      requireTLS: true,
      auth: { user: config.SMTP_USER, pass: config.SMTP_PASS },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
      logger: false,
      debug: false,
    });
    try {
      const result = await transport.sendMail({
        from: config.MAIL_FROM,
        to: email,
        subject: "Your Verysure verification code",
        text: `Your Verysure verification code is ${otp}. It expires in five minutes. If you did not request this code, ignore this email.`,
      });
      if (!result.accepted?.length) throw new Error("Recipient not accepted");
    } catch {
      // Do not expose SMTP responses, credentials or OTPs in API errors/logs.
      throw new ApiError(
        502,
        "The verification code could not be delivered. Please try again.",
      );
    } finally {
      transport.close();
    }
    return {};
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: config.OTP_FROM,
      to: [email],
      subject: "Your Verysure verification code",
      text: `Your verification code is ${otp}. It expires in five minutes.`,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok)
    throw new ApiError(
      502,
      "The verification code could not be delivered. Please try again.",
    );
  return {};
}
export async function initiateCheckout(payment: {
  id: string;
  amountKobo: number;
  method: string;
  email: string;
}) {
  if (config.PAYMENT_PROVIDER === "demo") return {};
  if (config.PAYMENT_PROVIDER === "paystack")
    return initializePaystack(payment);
  // Configurable server-to-server bridge. A provider-specific integration must implement this documented contract.
  const response = await fetch(config.PAYMENT_INITIATE_URL!, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.PAYMENT_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": payment.id,
    },
    body: JSON.stringify({
      reference: payment.id,
      amountKobo: payment.amountKobo,
      currency: "NGN",
      method: payment.method,
      email: payment.email,
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new ApiError(502, "Payment checkout is temporarily unavailable.");
  const result = (await response.json()) as {
    externalRef?: string;
    checkoutUrl?: string;
  };
  if (!result.externalRef || !result.checkoutUrl?.startsWith("https://"))
    throw new ApiError(502, "Payment provider returned an invalid checkout.");
  return { externalRef: result.externalRef, checkoutUrl: result.checkoutUrl };
}
