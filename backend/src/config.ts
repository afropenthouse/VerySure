import "dotenv/config";
import path from "node:path";
import { z } from "zod";
const schema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  HOST: z.string().default("0.0.0.0"),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  DATABASE_URL: z.string().startsWith("postgresql://"),
  TEST_DATABASE_URL: z.string().optional(),
  SESSION_SECRET: z.string().min(32),
  OTP_SECRET: z.string().min(32),
  PHOTO_SIGNING_SECRET: z.string().min(32),
  OTP_PROVIDER: z.enum(["demo", "resend", "smtp"]).default("demo"),
  PAYMENT_PROVIDER: z.enum(["demo", "gateway", "paystack"]).default("demo"),
  PAYSTACK_SECRET_KEY: z.string().optional(),
  ALLOW_DEMO_PAYMENTS: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:8081,http://localhost:8082"),
  PUBLIC_API_URL: z.url().default("http://localhost:4000"),
  UPLOAD_DIR: z.string().default("./uploads"),
  PHOTO_STORAGE: z.enum(["database", "local"]).default("database"),
  RESEND_API_KEY: z.string().optional(),
  OTP_FROM: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(465),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().optional(),
  PAYMENT_API_KEY: z.string().optional(),
  PAYMENT_INITIATE_URL: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.url().optional(),
  ),
  PAYMENT_WEBHOOK_SECRET: z.string().optional(),
});
export const config = schema.parse(process.env);
if (
  config.PAYMENT_PROVIDER === "paystack" &&
  !/^sk_(test|live)_[a-zA-Z0-9]+$/.test(config.PAYSTACK_SECRET_KEY || "")
)
  throw new Error("Paystack requires a valid PAYSTACK_SECRET_KEY.");
if (
  config.NODE_ENV === "production" &&
  config.PAYMENT_PROVIDER === "paystack" &&
  !config.PAYSTACK_SECRET_KEY?.startsWith("sk_live_")
)
  throw new Error(
    "Production requires a live Paystack secret key. Use development for Paystack test-mode acceptance testing.",
  );
if (
  config.OTP_PROVIDER === "smtp" &&
  (!config.SMTP_HOST ||
    !config.SMTP_USER ||
    !config.SMTP_PASS ||
    !config.MAIL_FROM)
)
  throw new Error("SMTP configuration is incomplete.");
if (
  config.NODE_ENV === "production" &&
  (config.OTP_PROVIDER === "demo" ||
    config.PAYMENT_PROVIDER === "demo" ||
    config.ALLOW_DEMO_PAYMENTS)
)
  throw new Error(
    "Production requires live OTP/payment providers and disabled demo settlement.",
  );
if (
  config.NODE_ENV === "production" &&
  (!config.PUBLIC_API_URL.startsWith("https://") ||
    [
      config.SESSION_SECRET,
      config.OTP_SECRET,
      config.PHOTO_SIGNING_SECRET,
    ].some((s) => /replace|example/i.test(s)))
)
  throw new Error(
    "Production requires HTTPS and independently generated secrets.",
  );
if (
  config.OTP_PROVIDER === "resend" &&
  (!config.RESEND_API_KEY || !config.OTP_FROM)
)
  throw new Error("Resend configuration is incomplete.");
if (
  config.PAYMENT_PROVIDER === "gateway" &&
  (!config.PAYMENT_API_KEY ||
    !config.PAYMENT_INITIATE_URL?.startsWith("https://") ||
    !config.PAYMENT_WEBHOOK_SECRET)
)
  throw new Error("Live payment gateway configuration is incomplete.");
export const uploadDir = path.resolve(config.UPLOAD_DIR);
export const origins = config.CORS_ORIGINS.split(",")
  .map((s) => s.trim())
  .filter(Boolean);
