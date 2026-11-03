import { createHmac } from "node:crypto";
import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { config } from "./config.js";
import { db } from "./db.js";
import { authenticate } from "./auth.js";
import { requireValue, safeEqual } from "./security.js";
import { settlePayment } from "./wallet.js";
import { validatePaystackTransaction, verifyPaystack } from "./paystack.js";

const reference = z
  .string()
  .regex(/^VS-PAY-[a-zA-Z0-9-]+$/)
  .max(150);
async function checkPayment(id: string, userId?: string) {
  const payment = await db.payment.findFirst({
    where: { id, provider: "paystack", ...(userId ? { userId } : {}) },
  });
  requireValue(payment, "Payment not found.", 404);
  if (payment.status === "settled")
    return { status: "settled", alreadySettled: true };
  const checked = await verifyPaystack(id);
  requireValue(
    checked.amount === payment.amountKobo,
    "Payment amount does not match.",
    409,
  );
  if (checked.status !== "success")
    return { status: checked.status, alreadySettled: false };
  const result = await settlePayment(id, {
    amountKobo: checked.amount,
    externalRef: id,
  });
  return { status: "settled", ...result };
}

export async function paystackRoutes(app: FastifyInstance) {
  app.post(
    "/api/payments/:id/verify",
    {
      preHandler: authenticate,
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    },
    async (req) => {
      const { id } = z.object({ id: reference }).parse(req.params);
      return checkPayment(id, req.actor.id);
    },
  );

  app.get(
    "/api/payments/paystack/callback",
    {
      config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
    },
    async (req, reply) => {
      const input = z.object({ reference }).parse(req.query);
      const result = await checkPayment(input.reference);
      reply
        .header("Cache-Control", "no-store")
        .type("text/html; charset=utf-8");
      return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Verysure payment</title></head><body><h1>${result.status === "settled" ? "Payment confirmed" : "Payment not yet confirmed"}</h1><p>Return to Verysure and open your wallet. You can also select Check payment to refresh its status.</p><p><a href="verysure://wallet">Return to Verysure</a></p></body></html>`;
    },
  );

  app.post(
    "/api/payments/paystack/webhook",
    {
      config: {
        rawBody: true,
        rateLimit: { max: 120, timeWindow: "1 minute" },
      },
    },
    async (req) => {
      requireValue(
        config.PAYSTACK_SECRET_KEY,
        "Paystack is not configured.",
        503,
      );
      const raw = req.rawBody;
      const signature = req.headers["x-paystack-signature"];
      requireValue(
        typeof raw === "string" &&
          typeof signature === "string" &&
          /^[a-f0-9]{128}$/i.test(signature),
        "Missing or invalid Paystack signature.",
        401,
      );
      const expected = createHmac("sha512", config.PAYSTACK_SECRET_KEY)
        .update(raw)
        .digest("hex");
      requireValue(
        safeEqual(expected, signature.toLowerCase()),
        "Invalid Paystack signature.",
        401,
      );
      const event = z
        .object({ event: z.string(), data: z.unknown() })
        .parse(req.body);
      if (event.event !== "charge.success") return { received: true };
      const data = z
        .object({
          reference: z.string().min(1).max(150),
          status: z.literal("success"),
          amount: z.number().int().nonnegative(),
          currency: z.string(),
          domain: z.enum(["test", "live"]),
        })
        .parse(event.data);
      validatePaystackTransaction(data, data.reference);
      const payment = await db.payment.findUnique({
        where: { id: data.reference },
      });
      // Ignore other Paystack transactions from the same merchant account.
      if (!payment || payment.provider !== "paystack")
        return { received: true };
      return {
        received: true,
        ...(await settlePayment(payment.id, {
          amountKobo: data.amount,
          externalRef: data.reference,
        })),
      };
    },
  );
}
