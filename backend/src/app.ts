import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import rawBody from "fastify-raw-body";
import { ZodError } from "zod";
import { config, origins } from "./config.js";
import { ApiError } from "./security.js";
import { db } from "./db.js";
import { authRoutes } from "./auth.js";
import { stateRoutes } from "./state.js";
import { routes } from "./routes.js";
import { paystackRoutes } from "./paystack-routes.js";
export async function buildApp({ logger = config.NODE_ENV !== "test" } = {}) {
  const app = Fastify({
    logger: logger
      ? {
          level: "info",
          redact: [
            "req.headers.authorization",
            "req.headers.cookie",
            "res.headers.set-cookie",
          ],
        }
      : false,
    bodyLimit: 1024 * 1024,
    trustProxy: (_address, hop) => hop < config.TRUST_PROXY_HOPS,
  });
  await app.register(cookie);
  await app.register(cors, {
    origin: origins,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  });
  await app.register(helmet, {
    crossOriginResourcePolicy: { policy: "cross-origin" },
  });
  await app.register(rateLimit, { max: 300, timeWindow: "1 minute" });
  await app.register(multipart, {
    limits: { files: 1, fields: 0, fileSize: 5 * 1024 * 1024 },
  });
  await app.register(rawBody, {
    field: "rawBody",
    global: false,
    encoding: "utf8",
    runFirst: true,
  });
  app.addHook("onSend", async (req, reply, payload) => {
    if (req.url.startsWith("/api/")) reply.header("Cache-Control", "no-store");
    return payload;
  });
  app.setErrorHandler((error, req, reply) => {
    if (error instanceof ZodError)
      return reply.code(400).send({
        error: error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
        code: "VALIDATION_ERROR",
      });
    if (error instanceof ApiError)
      return reply
        .code(error.statusCode)
        .send({ error: error.message, code: error.code });
    const e = error as { code?: string; statusCode?: number; message?: string };
    if (e.code === "P2002")
      return reply.code(409).send({
        error: "That email, phone, identifier or code is already registered.",
        code: "CONFLICT",
      });
    if (e.code === "P2025")
      return reply
        .code(404)
        .send({ error: "Record not found.", code: "NOT_FOUND" });
    if (e.statusCode && e.statusCode >= 400 && e.statusCode < 500)
      return reply
        .code(e.statusCode)
        .send({ error: e.message || "Invalid request." });
    req.log.error({ err: error }, "Request failed");
    return reply.code(500).send({
      error: "The request could not be completed. Please try again.",
      code: "INTERNAL_ERROR",
    });
  });
  app.get("/health", async () => {
    await db.user.count();
    return { status: "ok", database: "postgresql" };
  });
  await authRoutes(app);
  await stateRoutes(app);
  await routes(app);
  await paystackRoutes(app);
  return app;
}
