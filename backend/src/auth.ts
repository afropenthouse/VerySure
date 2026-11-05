import { randomBytes, randomInt, randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { User, Role } from "./generated/prisma/client.js";
import { db } from "./db.js";
import { config, origins } from "./config.js";
import {
  ApiError,
  checkPassword,
  hashPassword,
  otpHash,
  requireValue,
  safeEqual,
  tokenHash,
} from "./security.js";
import { registration, text, location } from "./validation.js";
import { deliverOtp } from "./providers.js";
declare module "fastify" {
  interface FastifyRequest {
    actor: User;
  }
}
export async function authenticate(req: FastifyRequest) {
  const bearer = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7)
    : undefined;
  const token = bearer || req.cookies.vs_session;
  if (!token)
    throw new ApiError(401, "Sign in to continue.", "UNAUTHENTICATED");
  const session = await db.session.findUnique({
    where: { tokenHash: tokenHash(token) },
    include: { user: true },
  });
  if (
    !session ||
    session.expiresAt < new Date() ||
    session.user.status !== "active"
  )
    throw new ApiError(
      401,
      "Your session has expired. Sign in again.",
      "UNAUTHENTICATED",
    );
  if (
    !bearer &&
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    (!req.headers.origin || !origins.includes(req.headers.origin))
  )
    throw new ApiError(403, "Request origin is not allowed.");
  req.actor = session.user;
}
export function allow(req: FastifyRequest, roles: Role[]) {
  if (!roles.includes(req.actor.role))
    throw new ApiError(
      403,
      "This action is not available for your role.",
      "FORBIDDEN",
    );
}
async function sessionFor(
  userId: string,
  req: FastifyRequest,
  reply: FastifyReply,
) {
  const token = randomBytes(32).toString("hex");
  await db.session.create({
    data: {
      tokenHash: tokenHash(token),
      userId,
      expiresAt: new Date(Date.now() + 30 * 86400000),
    },
  });
  reply.setCookie("vs_session", token, {
    httpOnly: true,
    secure: config.PUBLIC_API_URL.startsWith("https://"),
    sameSite: "strict",
    path: "/",
    maxAge: 30 * 86400,
  });
  return req.headers["x-client-type"] === "native" ? { token } : {};
}
export async function authRoutes(app: FastifyInstance) {
  const loginIpLimit = app.createRateLimit({
    max: 60,
    timeWindow: "15 minutes",
    keyGenerator: (req) => `login-ip:${req.ip}`,
  });
  app.post(
    "/api/auth/request-code",
    { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } },
    async (req) => {
      const data = registration.parse(req.body);
      const existing = await db.user.findFirst({
        where: { OR: [{ email: data.email }, { phone: data.phone }] },
      });
      requireValue(
        !existing,
        "An account already uses that email or phone.",
        409,
      );
      const challengeId = randomUUID();
      const code = String(randomInt(100000, 1000000));
      const passwordHash = await hashPassword(data.password);
      const { password: _password, ...fields } = data;
      await db.$transaction(async (tx) => {
        await tx.otpChallenge.updateMany({
          where: { email: data.email, consumed: false },
          data: { consumed: true },
        });
        await tx.otpChallenge.create({
          data: {
            id: challengeId,
            email: data.email,
            codeHash: otpHash(challengeId, code),
            payload: { ...fields, passwordHash },
            expiresAt: new Date(Date.now() + 300000),
          },
        });
      });
      try {
        const delivery = await deliverOtp(data.email, code);
        return { challengeId, expiresIn: 300, ...delivery };
      } catch (error) {
        await db.otpChallenge.update({
          where: { id: challengeId },
          data: { consumed: true },
        });
        throw error;
      }
    },
  );
  app.post(
    "/api/auth/register",
    { config: { rateLimit: { max: 15, timeWindow: "15 minutes" } } },
    async (req, reply) => {
      const input = z
        .object({ challengeId: z.uuid(), code: z.string().regex(/^\d{6}$/) })
        .strict()
        .parse(req.body);
      const userId = await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "OtpChallenge" WHERE id=${input.challengeId} FOR UPDATE`;
        const challenge = await tx.otpChallenge.findUnique({
          where: { id: input.challengeId },
        });
        if (
          !challenge ||
          challenge.consumed ||
          challenge.expiresAt < new Date() ||
          challenge.attempts >= 5
        )
          return {
            error: "Your code expired or was already used. Request a new one.",
          };
        if (!safeEqual(challenge.codeHash, otpHash(challenge.id, input.code))) {
          await tx.otpChallenge.update({
            where: { id: challenge.id },
            data: { attempts: { increment: 1 } },
          });
          return { error: "Incorrect code. Please try again." };
        }
        const data = challenge.payload as {
          name: string;
          email: string;
          phone: string;
          passwordHash: string;
          address: string;
          role: "consumer" | "retailer" | "manufacturer";
          company?: string;
          rc?: string;
          category?: string;
        };
        let id = String(randomInt(100000, 1000000));
        while (await tx.user.findUnique({ where: { id } }))
          id = String(randomInt(100000, 1000000));
        await tx.user.create({
          data: {
            id,
            name: data.name,
            email: data.email,
            phone: data.phone,
            passwordHash: data.passwordHash,
            address: data.address,
            role: data.role,
            company: data.company,
            wallet: { create: {} },
            manufacturer:
              data.role === "manufacturer"
                ? {
                    create: {
                      name: data.company!,
                      rc: data.rc!,
                      category: data.category!,
                    },
                  }
                : undefined,
            notifications: {
              create: {
                title: "Welcome to Verysure",
                body: "Your first 10 product verifications are free.",
              },
            },
          },
        });
        await tx.otpChallenge.update({
          where: { id: challenge.id },
          data: { consumed: true, payload: {} },
        });
        return { id };
      });
      if (userId.error || !userId.id) throw new ApiError(400, userId.error!);
      return {
        userId: userId.id,
        ...(await sessionFor(userId.id, req, reply)),
      };
    },
  );
  app.post(
    "/api/auth/login",
    {
      preValidation: async (req, reply) => {
        const limit = await loginIpLimit(req);
        if (!limit.isAllowed && limit.isExceeded) {
          reply.header("Retry-After", limit.ttlInSeconds);
          throw new ApiError(
            429,
            "Too many login attempts from this network. Please wait before trying again.",
            "RATE_LIMITED",
          );
        }
      },
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "15 minutes",
          hook: "preHandler",
          keyGenerator: (req) => {
            const value = (req.body as { identifier?: unknown } | undefined)
              ?.identifier;
            const identifier =
              typeof value === "string"
                ? value.trim().toLowerCase().slice(0, 254)
                : "invalid";
            return `login-account:${req.ip}:${identifier.includes("@") ? identifier : identifier.replace(/[\s-]/g, "")}`;
          },
        },
      },
    },
    async (req, reply) => {
      const input = z
        .object({
          identifier: text(254),
          password: z.string().max(128),
          location,
        })
        .strict()
        .parse(req.body);
      const user = await db.user.findFirst({
        where: {
          OR: [
            { email: input.identifier.toLowerCase() },
            { phone: input.identifier.replace(/[\s-]/g, "") },
          ],
        },
      });
      if (
        !user ||
        !(await checkPassword(input.password, user.passwordHash)) ||
        user.status !== "active"
      )
        throw new ApiError(401, "Email, phone or password is incorrect.");
      await db.user.update({
        where: { id: user.id },
        data: {
          lastSeenAt: new Date(),
          ...(input.location && user.locationEnabled
            ? {
                lastLat: input.location.latitude,
                lastLng: input.location.longitude,
              }
            : {}),
        },
      });
      return { userId: user.id, ...(await sessionFor(user.id, req, reply)) };
    },
  );
  app.post(
    "/api/auth/logout",
    { preHandler: authenticate },
    async (req, reply) => {
      const token =
        req.headers.authorization?.slice(7) || req.cookies.vs_session!;
      await db.session.deleteMany({ where: { tokenHash: tokenHash(token) } });
      reply.clearCookie("vs_session", { path: "/" });
      return { ok: true };
    },
  );
  app.get("/api/auth/config", async () => ({
    paymentProvider: config.PAYMENT_PROVIDER,
    paymentTestMode:
      config.PAYMENT_PROVIDER === "paystack" &&
      config.PAYSTACK_SECRET_KEY?.startsWith("sk_test_"),
    demoOtp: config.OTP_PROVIDER === "demo",
    demoPayments:
      config.PAYMENT_PROVIDER === "demo" && config.ALLOW_DEMO_PAYMENTS,
  }));
}
