import { randomBytes, randomUUID, createHmac } from "node:crypto";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { z } from "zod";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { db } from "./db.js";
import { authenticate, allow } from "./auth.js";
import { config, uploadDir } from "./config.js";
import {
  ApiError,
  hashPassword,
  requireValue,
  safeEqual,
  signPhoto,
} from "./security.js";
import {
  amount,
  date,
  id,
  key,
  location,
  publicId,
  text,
} from "./validation.js";
import {
  credit,
  lockWallets,
  sendMoney,
  settlePayment,
  verifyProduct,
} from "./wallet.js";
import { initiateCheckout } from "./providers.js";
import { verificationDto, publicUserSelect } from "./state.js";
import { issueNumber } from "./identifiers.js";
const params = (req: FastifyRequest) => z.object({ id }).parse(req.params);
async function approved(req: FastifyRequest) {
  allow(req, ["manufacturer"]);
  const m = await db.manufacturer.findUnique({ where: { id: req.actor.id } });
  requireValue(
    m?.status === "approved",
    "Your manufacturer account must be approved first.",
    403,
  );
  return m;
}
function ean13(base: string) {
  return (
    base +
    ((10 -
      ([...base].reduce((sum, d, i) => sum + Number(d) * (i % 2 ? 3 : 1), 0) %
        10)) %
      10)
  );
}
export async function routes(app: FastifyInstance) {
  app.patch("/api/profile", { preHandler: authenticate }, async (req) => {
    const input = z
      .object({
        name: text(),
        phone: z
          .string()
          .regex(/^\+?[\d\s-]{10,15}$/)
          .transform((s) => s.replace(/[\s-]/g, "")),
        address: text(500),
        company: text().optional(),
        locationEnabled: z.boolean().optional(),
      })
      .strict()
      .parse(req.body);
    await db.user.update({ where: { id: req.actor.id }, data: input });
    return { ok: true };
  });
  app.post("/api/verify", { preHandler: authenticate }, async (req) => {
    const input = z
      .object({
        code: text(150).transform((s) => s.toUpperCase()),
        idempotencyKey: key,
        location,
      })
      .strict()
      .parse(req.body);
    const result = await verifyProduct(
      req.actor.id,
      input.code,
      input.idempotencyKey,
      req.actor.locationEnabled ? input.location : undefined,
    );
    const record = await db.verification.findUniqueOrThrow({
      where: { id: result.id },
      include: { product: { include: { manufacturer: true } }, batch: true },
    });
    const { product, batch, ...verification } = record;
    return {
      ...verificationDto(verification),
      details:
        product && batch
          ? {
              product: {
                id: product.id,
                manufacturerId: product.manufacturerId,
                name: product.name,
                category: product.category,
                description: product.description,
                unit: product.unit,
                regulatory: product.regulatory,
              },
              batch: {
                ...batch,
                manufactured: batch.manufactured.toISOString().slice(0, 10),
                expires: batch.expires.toISOString().slice(0, 10),
              },
              manufacturer: {
                id: product.manufacturer.id,
                name: product.manufacturer.name,
                category: product.manufacturer.category,
                rc: product.manufacturer.rc,
                status: product.manufacturer.status,
                approval: product.manufacturer.approval,
              },
            }
          : undefined,
    };
  });
  app.get(
    "/api/wallet/recipient/:id",
    {
      preHandler: authenticate,
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
    },
    async (req) => {
      const input = z.object({ id: publicId }).parse(req.params);
      const user = await db.user.findFirst({
        where: { id: input.id, status: "active" },
        select: { id: true, name: true },
      });
      requireValue(user, "No active user has that Verysure ID.", 404);
      return user;
    },
  );
  app.post(
    "/api/wallet/transfer",
    { preHandler: authenticate },
    async (req) => {
      const input = z
        .object({
          recipientId: publicId,
          amountKobo: amount,
          idempotencyKey: key,
        })
        .strict()
        .parse(req.body);
      return sendMoney(
        req.actor.id,
        input.recipientId,
        input.amountKobo,
        input.idempotencyKey,
      );
    },
  );
  app.post("/api/payments", { preHandler: authenticate }, async (req) => {
    const input = z
      .object({
        amountKobo: amount.min(10000),
        method: z.enum([
          "Moniepoint transfer",
          "International card",
          "Paystack checkout",
        ]),
        idempotencyKey: key,
      })
      .strict()
      .parse(req.body);
    let payment = await db.payment.findUnique({
      where: {
        userId_idempotencyKey: {
          userId: req.actor.id,
          idempotencyKey: input.idempotencyKey,
        },
      },
    });
    if (!payment) {
      try {
        payment = await db.payment.create({
          data: {
            id: `VS-PAY-${randomUUID()}`,
            userId: req.actor.id,
            ...input,
            provider: config.PAYMENT_PROVIDER,
          },
        });
      } catch (error) {
        if ((error as { code?: string }).code !== "P2002") throw error;
        // A concurrent retry may have created the same request in the meantime.
        payment = await db.payment.findUnique({
          where: {
            userId_idempotencyKey: {
              userId: req.actor.id,
              idempotencyKey: input.idempotencyKey,
            },
          },
        });
        if (!payment) throw error;
      }
    }
    requireValue(
      payment.amountKobo === input.amountKobo &&
        payment.method === input.method,
      "This request key was already used for another payment.",
      409,
    );
    if (
      payment.provider !== "demo" &&
      !payment.checkoutUrl &&
      payment.status === "pending"
    ) {
      requireValue(
        payment.provider === config.PAYMENT_PROVIDER,
        "This payment uses a previous provider. Create a new payment.",
        409,
      );
      payment = await db.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM "Payment" WHERE id=${payment!.id} FOR UPDATE`;
          const current = await tx.payment.findUniqueOrThrow({
            where: { id: payment!.id },
          });
          if (current.checkoutUrl || current.status !== "pending")
            return current;
          const checkout = await initiateCheckout({
            ...current,
            email: req.actor.email,
          });
          return tx.payment.update({
            where: { id: current.id },
            data: checkout,
          });
        },
        { timeout: 25000 },
      );
    }
    return payment;
  });
  app.post(
    "/api/payments/:id/confirm-demo",
    { preHandler: authenticate },
    async (req) => {
      requireValue(
        config.NODE_ENV !== "production" &&
          config.PAYMENT_PROVIDER === "demo" &&
          config.ALLOW_DEMO_PAYMENTS,
        "Demo settlement is disabled.",
        403,
      );
      const payment = await db.payment.findFirst({
        where: { id: params(req).id, userId: req.actor.id, provider: "demo" },
      });
      requireValue(payment, "Payment not found.", 404);
      return settlePayment(payment.id);
    },
  );
  app.post(
    "/api/payments/:id/cancel",
    { preHandler: authenticate },
    async (req) => {
      const result = await db.payment.updateMany({
        where: {
          id: params(req).id,
          userId: req.actor.id,
          status: "pending",
          provider: { not: "paystack" },
        },
        data: { status: "cancelled" },
      });
      requireValue(
        result.count === 1,
        "Only your pending payments can be cancelled.",
        409,
      );
      return { ok: true };
    },
  );
  app.post(
    "/api/payments/webhook",
    {
      config: {
        rawBody: true,
        rateLimit: { max: 120, timeWindow: "1 minute" },
      },
    },
    async (req) => {
      requireValue(
        config.PAYMENT_WEBHOOK_SECRET,
        "Payment webhook is not configured.",
        503,
      );
      const raw = req.rawBody;
      requireValue(typeof raw === "string", "Missing raw payment payload.");
      const signature = req.headers["x-verysure-signature"];
      requireValue(
        typeof signature === "string" && /^[a-f0-9]{128}$/i.test(signature),
        "Missing or invalid payment signature.",
        401,
      );
      const expected = createHmac("sha512", config.PAYMENT_WEBHOOK_SECRET)
        .update(raw)
        .digest("hex");
      requireValue(
        safeEqual(expected, signature.toLowerCase()),
        "Invalid payment signature.",
        401,
      );
      const input = z
        .object({
          reference: text(150),
          amountKobo: amount.min(10000),
          currency: z.literal("NGN"),
          status: z.literal("success"),
          externalRef: text(200),
        })
        .strict()
        .parse(req.body);
      const payment = await db.payment.findUnique({
        where: { id: input.reference },
      });
      requireValue(payment?.provider === "gateway", "Payment not found.", 404);
      return settlePayment(input.reference, input);
    },
  );
  app.post(
    "/api/photos",
    {
      preHandler: authenticate,
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
    },
    async (req) => {
      const file = await req.file({
        limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0 },
      });
      requireValue(file, "Attach one image.");
      requireValue(
        ["image/jpeg", "image/png", "image/webp"].includes(file.mimetype),
        "Use a JPEG, PNG or WebP image.",
      );
      const bytes = await file.toBuffer();
      const isPng = bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      const isJpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
      const isWebp =
        bytes.toString("ascii", 0, 4) === "RIFF" &&
        bytes.toString("ascii", 8, 12) === "WEBP";
      requireValue(
        isPng || isJpeg || isWebp,
        "The uploaded bytes must be a JPEG, PNG or WebP image.",
      );
      let buffer: Buffer;
      try {
        buffer = await sharp(bytes, { limitInputPixels: 20_000_000 })
          .rotate()
          .resize({
            width: 1600,
            height: 1600,
            fit: "inside",
            withoutEnlargement: true,
          })
          .jpeg({ quality: 80 })
          .toBuffer();
      } catch {
        throw new ApiError(400, "The image cannot be processed.");
      }
      const storageKey = `${randomUUID()}.jpg`;
      if (config.PHOTO_STORAGE === "database") {
        const photo = await db.photo.create({
          data: {
            userId: req.actor.id,
            storageKey,
            data: new Uint8Array(buffer),
          },
        });
        return { photoId: photo.id };
      }
      await mkdir(uploadDir, { recursive: true });
      const target = path.join(uploadDir, storageKey);
      await writeFile(target, buffer, { flag: "wx" });
      try {
        const photo = await db.photo.create({
          data: { userId: req.actor.id, storageKey },
        });
        return { photoId: photo.id };
      } catch (error) {
        await unlink(target).catch(() => {});
        throw error;
      }
    },
  );
  app.get("/api/photos/:id", async (req, reply) => {
    const { id: photoId } = params(req);
    const input = z
      .object({
        expires: z.coerce.number().int(),
        signature: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .parse(req.query);
    const now = Math.floor(Date.now() / 1000);
    requireValue(
      input.expires >= now &&
        input.expires <= now + 601 &&
        safeEqual(signPhoto(photoId, input.expires), input.signature),
      "Photo link has expired or is invalid.",
      403,
    );
    const photo = await db.photo.findUnique({ where: { id: photoId } });
    requireValue(photo, "Photo not found.", 404);
    reply.header("Cache-Control", "private, no-store").type("image/jpeg");
    if (photo.data) return Buffer.from(photo.data);
    return readFile(path.join(uploadDir, photo.storageKey));
  });
  app.post("/api/reports", { preHandler: authenticate }, async (req) => {
    const input = z
      .object({
        product: text(),
        code: z.string().trim().max(150).default(""),
        description: text(5000).min(10),
        photoId: z.uuid().optional(),
        location,
      })
      .strict()
      .parse(req.body);
    if (input.photoId)
      requireValue(
        await db.photo.findFirst({
          where: { id: input.photoId, userId: req.actor.id },
        }),
        "Attach a photo from your account.",
        403,
      );
    return db.report.create({
      data: {
        userId: req.actor.id,
        product: input.product,
        code: input.code,
        description: input.description,
        photoId: input.photoId,
        latitude: req.actor.locationEnabled
          ? input.location?.latitude
          : undefined,
        longitude: req.actor.locationEnabled
          ? input.location?.longitude
          : undefined,
      },
    });
  });
  app.post("/api/messages", { preHandler: authenticate }, async (req) => {
    allow(req, ["consumer", "retailer"]);
    const input = z
      .object({
        manufacturerId: publicId,
        subject: text(200),
        body: text(5000),
      })
      .strict()
      .parse(req.body);
    requireValue(
      await db.manufacturer.findFirst({
        where: { id: input.manufacturerId, status: "approved" },
      }),
      "Choose an approved manufacturer.",
    );
    return db.message.create({ data: { userId: req.actor.id, ...input } });
  });
  app.post(
    "/api/messages/:id/reply",
    { preHandler: authenticate },
    async (req) => {
      allow(req, ["manufacturer"]);
      const input = z
        .object({ reply: text(5000) })
        .strict()
        .parse(req.body);
      return db.$transaction(async (tx) => {
        const message = await tx.message.findFirst({
          where: { id: params(req).id, manufacturerId: req.actor.id },
        });
        requireValue(message, "Message not found.", 404);
        await tx.message.update({ where: { id: message.id }, data: input });
        await tx.notification.create({
          data: {
            userId: message.userId,
            title: "A manufacturer replied",
            body: message.subject,
          },
        });
        return { ok: true };
      });
    },
  );
  app.post(
    "/api/notifications/read",
    { preHandler: authenticate },
    async (req) => {
      const input = z
        .object({ id: id.optional(), all: z.boolean().optional() })
        .strict()
        .parse(req.body);
      requireValue(input.id || input.all, "Choose a notification.");
      await db.notification.updateMany({
        where: { userId: req.actor.id, ...(input.all ? {} : { id: input.id }) },
        data: { read: true },
      });
      return { ok: true };
    },
  );
  app.post("/api/products", { preHandler: authenticate }, async (req) => {
    await approved(req);
    const input = z
      .object({
        name: text(),
        category: text(),
        description: z.string().trim().max(5000).default(""),
        unit: text(),
        regulatory: text(),
      })
      .strict()
      .parse(req.body);
    return db.product.create({
      data: { manufacturerId: req.actor.id, ...input },
    });
  });
  app.get(
    "/api/manufacturer/codes",
    { preHandler: authenticate },
    async (req) => {
      await approved(req);
      const query = z
        .object({
          cursor: z.string().max(150).optional(),
          batchId: id.optional(),
        })
        .strict()
        .parse(req.query);
      const rows = await db.productCode.findMany({
        where: {
          batch: { product: { manufacturerId: req.actor.id } },
          ...(query.batchId ? { batchId: query.batchId } : {}),
        },
        orderBy: { value: "asc" },
        take: 101,
        ...(query.cursor ? { cursor: { value: query.cursor }, skip: 1 } : {}),
      });
      return {
        items: rows.slice(0, 100),
        nextCursor: rows.length > 100 ? rows[99].value : null,
      };
    },
  );
  app.post("/api/batches", { preHandler: authenticate }, async (req) => {
    await approved(req);
    const input = z
      .object({
        productId: id,
        number: text(),
        quantity: z.number().int().min(1).max(5000),
        manufactured: date,
        expires: date,
        type: z.enum(["serial", "barcode", "seal", "shape"]),
        codes: z
          .array(text(150).transform((s) => s.toUpperCase()))
          .max(5000)
          .optional(),
      })
      .strict()
      .parse(req.body);
    requireValue(
      input.expires > input.manufactured,
      "Expiry must be after manufacture.",
    );
    requireValue(
      await db.product.findFirst({
        where: { id: input.productId, manufacturerId: req.actor.id },
      }),
      "Product not found.",
      404,
    );
    const assigned = await db.issuedBatch.findUnique({
      where: { number: input.number },
    });
    requireValue(
      !assigned || assigned.manufacturerId === req.actor.id,
      "That official batch number belongs to another manufacturer.",
      403,
    );
    if (/^(NAFDAC|SON)-/.test(input.number))
      requireValue(
        assigned?.manufacturerId === req.actor.id,
        "Use an official batch number issued to your company.",
      );
    const generatedPrefix = randomBytes(5).toString("hex").toUpperCase();
    const values =
      input.codes ??
      Array.from({ length: input.quantity }, (_, i) =>
        input.type === "barcode"
          ? ean13(
              `615${String(
                (BigInt("0x" + generatedPrefix) % 1000000000n) + BigInt(i),
              )
                .padStart(9, "0")
                .slice(-9)}`,
            )
          : `${input.type === "seal" ? "SEAL" : input.type === "shape" ? "SHAPE" : "VS"}-${generatedPrefix.slice(0, 4)}-${generatedPrefix.slice(4, 8)}-${String(i + 1).padStart(4, "0")}`,
      );
    requireValue(
      values.length === input.quantity &&
        new Set(values).size === values.length,
      "Provide exactly one unique code per unit.",
    );
    return db.$transaction(
      async (tx) => {
        const profile = await tx.manufacturer.findUniqueOrThrow({
          where: { id: req.actor.id },
        });
        requireValue(
          profile.status === "approved",
          "Manufacturer approval is required.",
          403,
        );
        const batch = await tx.batch.create({
          data: {
            productId: input.productId,
            number: input.number,
            quantity: input.quantity,
            manufactured: new Date(input.manufactured),
            expires: new Date(input.expires),
          },
        });
        for (let i = 0; i < values.length; i += 500)
          await tx.productCode.createMany({
            data: values
              .slice(i, i + 500)
              .map((value) => ({ value, batchId: batch.id, type: input.type })),
          });
        return batch;
      },
      { timeout: 30000 },
    );
  });
  app.patch("/api/batches/:id", { preHandler: authenticate }, async (req) => {
    await approved(req);
    const input = z
      .object({ status: z.enum(["active", "recalled"]) })
      .strict()
      .parse(req.body);
    const result = await db.batch.updateMany({
      where: { id: params(req).id, product: { manufacturerId: req.actor.id } },
      data: input,
    });
    requireValue(result.count === 1, "Batch not found.", 404);
    return { ok: true };
  });
  app.patch("/api/codes/:id", { preHandler: authenticate }, async (req) => {
    await approved(req);
    const input = z.object({ blocked: z.boolean() }).strict().parse(req.body);
    const result = await db.productCode.updateMany({
      where: {
        value: params(req).id,
        batch: { product: { manufacturerId: req.actor.id } },
      },
      data: input,
    });
    requireValue(result.count === 1, "Code not found.", 404);
    return { ok: true };
  });
  app.post(
    "/api/monitor/manufacturers/:id/review",
    { preHandler: authenticate },
    async (req) => {
      allow(req, ["monitor", "admin"]);
      const input = z
        .object({
          status: z.enum(["approved", "rejected"]),
          reason: text(2000).optional(),
        })
        .strict()
        .parse(req.body);
      requireValue(
        input.status !== "rejected" || input.reason,
        "Enter a rejection reason.",
      );
      const manufacturerId = params(req).id;
      return db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Manufacturer" WHERE id=${manufacturerId} FOR UPDATE`;
        const manufacturer = await tx.manufacturer.findUnique({
          where: { id: manufacturerId },
        });
        requireValue(manufacturer, "Manufacturer not found.", 404);
        requireValue(
          manufacturer.status === "pending",
          "This application has already been reviewed.",
          409,
        );
        const approval =
          input.status === "approved"
            ? await issueNumber(
                tx,
                `${req.actor.organization || "ADMIN"}-APP-${new Date().getFullYear()}`,
              )
            : null;
        await tx.manufacturer.update({
          where: { id: manufacturerId },
          data: {
            status: input.status,
            reason: input.reason,
            approval,
            approvedBy: req.actor.id,
            approvedAt: input.status === "approved" ? new Date() : null,
          },
        });
        await tx.notification.create({
          data: {
            userId: manufacturerId,
            title: `Manufacturer application ${input.status}`,
            body: approval || input.reason!,
          },
        });
        await tx.auditLog.create({
          data: {
            actorId: req.actor.id,
            action: "manufacturer.review",
            targetId: manufacturerId,
            details: input,
          },
        });
        return { approval };
      });
    },
  );
  app.post(
    "/api/monitor/issue-batch",
    { preHandler: authenticate },
    async (req) => {
      allow(req, ["monitor", "admin"]);
      const input = z
        .object({ manufacturerId: publicId })
        .strict()
        .parse(req.body);
      requireValue(
        await db.manufacturer.findFirst({
          where: { id: input.manufacturerId, status: "approved" },
        }),
        "Choose an approved manufacturer.",
      );
      const d = new Date();
      return db.$transaction(async (tx) => {
        const number = await issueNumber(
          tx,
          `${req.actor.organization || "ADMIN"}-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`,
        );
        const issued = await tx.issuedBatch.create({
          data: { ...input, number, issuedBy: req.actor.id },
        });
        await tx.notification.create({
          data: {
            userId: input.manufacturerId,
            title: "Batch number issued",
            body: number,
          },
        });
        return issued;
      });
    },
  );
  app.patch(
    "/api/admin/users/:id",
    { preHandler: authenticate },
    async (req) => {
      allow(req, ["admin"]);
      const input = z
        .object({ status: z.enum(["active", "suspended"]) })
        .strict()
        .parse(req.body);
      requireValue(
        params(req).id !== req.actor.id,
        "You cannot suspend your own account.",
      );
      return db.$transaction(async (tx) => {
        await tx.user.update({ where: { id: params(req).id }, data: input });
        if (input.status === "suspended")
          await tx.session.deleteMany({ where: { userId: params(req).id } });
        await tx.auditLog.create({
          data: {
            actorId: req.actor.id,
            action: "user.status",
            targetId: params(req).id,
            details: input,
          },
        });
        return { ok: true };
      });
    },
  );
  app.patch(
    "/api/admin/manufacturers/:id",
    { preHandler: authenticate },
    async (req) => {
      allow(req, ["admin"]);
      const input = z
        .object({ status: z.enum(["pending", "approved", "rejected"]) })
        .strict()
        .parse(req.body);
      return db.$transaction(async (tx) => {
        const current = await tx.manufacturer.findUniqueOrThrow({
          where: { id: params(req).id },
        });
        await tx.manufacturer.update({
          where: { id: params(req).id },
          data: {
            status: input.status,
            approval:
              input.status === "approved"
                ? current.approval ||
                  (await issueNumber(
                    tx,
                    `ADMIN-APP-${new Date().getFullYear()}`,
                  ))
                : null,
          },
        });
        await tx.auditLog.create({
          data: {
            actorId: req.actor.id,
            action: "manufacturer.status",
            targetId: params(req).id,
            details: input,
          },
        });
        await tx.notification.create({
          data: {
            userId: current.id,
            title: "Manufacturer status updated",
            body: `Your manufacturer account is ${input.status}.`,
          },
        });
        return { ok: true };
      });
    },
  );
  app.patch(
    "/api/admin/reports/:id",
    { preHandler: authenticate },
    async (req) => {
      allow(req, ["admin"]);
      const input = z
        .object({ status: z.enum(["open", "investigating", "resolved"]) })
        .strict()
        .parse(req.body);
      return db.$transaction(async (tx) => {
        const report = await tx.report.update({
          where: { id: params(req).id },
          data: input,
        });
        await tx.notification.create({
          data: {
            userId: report.userId,
            title: "Report status updated",
            body: `${report.product}: ${input.status}`,
          },
        });
        await tx.auditLog.create({
          data: {
            actorId: req.actor.id,
            action: "report.status",
            targetId: report.id,
            details: input,
          },
        });
        return { ok: true };
      });
    },
  );
  app.post("/api/admin/credits", { preHandler: authenticate }, async (req) => {
    allow(req, ["admin"]);
    const input = z
      .object({
        userId: publicId,
        amountKobo: amount,
        note: text(500),
        idempotencyKey: key,
      })
      .strict()
      .parse(req.body);
    return db.$transaction(async (tx) => {
      await lockWallets(tx, [input.userId]);
      const ref = `credit:${req.actor.id}:${input.idempotencyKey}`;
      const existing = await tx.walletTransaction.findUnique({
        where: {
          reference_userId_type: {
            reference: ref,
            userId: input.userId,
            type: "admin_credit",
          },
        },
      });
      if (existing) {
        requireValue(
          existing.amountKobo === input.amountKobo,
          "Request key already used.",
          409,
        );
        return { ok: true };
      }
      await credit(tx, input.userId, input.amountKobo);
      await tx.walletTransaction.create({
        data: {
          userId: input.userId,
          type: "admin_credit",
          amountKobo: input.amountKobo,
          note: input.note,
          reference: ref,
        },
      });
      await tx.notification.create({
        data: {
          userId: input.userId,
          title: "Wallet credited",
          body: input.note,
        },
      });
      await tx.auditLog.create({
        data: {
          actorId: req.actor.id,
          action: "wallet.credit",
          targetId: input.userId,
          details: { amountKobo: input.amountKobo, note: input.note },
        },
      });
      return { ok: true };
    });
  });
  app.post("/api/admin/adverts", { preHandler: authenticate }, async (req) => {
    allow(req, ["admin"]);
    const input = z
      .object({ title: text(), body: text(5000) })
      .strict()
      .parse(req.body);
    return db.advert.create({ data: input });
  });
  app.patch(
    "/api/admin/adverts/:id",
    { preHandler: authenticate },
    async (req) => {
      allow(req, ["admin"]);
      const input = z.object({ active: z.boolean() }).strict().parse(req.body);
      return db.advert.update({ where: { id: params(req).id }, data: input });
    },
  );
  app.post(
    "/api/admin/monitor-users",
    { preHandler: authenticate },
    async (req) => {
      allow(req, ["admin"]);
      const input = z
        .object({
          id: publicId,
          name: text(),
          email: z.email().transform((s) => s.toLowerCase()),
          phone: text(20),
          password: z.string().min(12).max(128),
          address: text(500),
          organization: z.enum(["NAFDAC", "SON"]),
        })
        .strict()
        .parse(req.body);
      const { password, ...fields } = input;
      return db.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            ...fields,
            role: "monitor",
            passwordHash: await hashPassword(password),
            wallet: { create: {} },
          },
          select: publicUserSelect,
        });
        await tx.auditLog.create({
          data: {
            actorId: req.actor.id,
            action: "monitor.create",
            targetId: user.id,
          },
        });
        return user;
      });
    },
  );
}
