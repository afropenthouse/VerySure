import { z } from "zod";
import { config } from "./config.js";
import { ApiError, requireValue } from "./security.js";

const transaction = z.object({
  reference: z.string(),
  status: z.string(),
  amount: z.number().int().nonnegative(),
  currency: z.string(),
  domain: z.enum(["test", "live"]),
});
export type PaystackTransaction = z.infer<typeof transaction>;

async function paystackRequest(path: string, body?: unknown): Promise<unknown> {
  requireValue(config.PAYSTACK_SECRET_KEY, "Paystack is not configured.", 503);
  try {
    const response = await fetch(`https://api.paystack.co${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${config.PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
    const result = (await response.json()) as {
      status?: boolean;
      data?: unknown;
    };
    if (!response.ok || result.status !== true)
      throw new Error("Provider rejected request");
    return result.data;
  } catch {
    throw new ApiError(
      502,
      "Paystack is temporarily unavailable. Your wallet has not been credited. Try checking the payment again.",
    );
  }
}

export async function initializePaystack(payment: {
  id: string;
  amountKobo: number;
  email: string;
}) {
  const result = z
    .object({ authorization_url: z.url(), reference: z.string() })
    .safeParse(
      await paystackRequest("/transaction/initialize", {
        email: payment.email,
        amount: String(payment.amountKobo),
        reference: payment.id,
        currency: "NGN",
        callback_url: `${config.PUBLIC_API_URL}/api/payments/paystack/callback`,
      }),
    );
  requireValue(result.success, "Paystack returned an invalid checkout.", 502);
  const url = new URL(result.data.authorization_url);
  requireValue(
    url.protocol === "https:" &&
      url.hostname === "checkout.paystack.com" &&
      result.data.reference === payment.id,
    "Paystack returned an invalid checkout.",
    502,
  );
  return { checkoutUrl: url.href, externalRef: result.data.reference };
}

export async function verifyPaystack(reference: string) {
  const parsed = transaction.safeParse(
    await paystackRequest(
      `/transaction/verify/${encodeURIComponent(reference)}`,
    ),
  );
  requireValue(
    parsed.success,
    "Paystack returned an invalid verification response.",
    502,
  );
  validatePaystackTransaction(parsed.data, reference);
  return parsed.data;
}

export function validatePaystackTransaction(
  value: PaystackTransaction,
  reference: string,
) {
  requireValue(
    value.reference === reference &&
      value.currency === "NGN" &&
      value.domain ===
        (config.PAYSTACK_SECRET_KEY?.startsWith("sk_live_") ? "live" : "test"),
    "Payment currency, reference or test/live mode does not match.",
    409,
  );
}
