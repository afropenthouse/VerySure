import { db } from "./db.js";
import type { FastifyInstance } from "fastify";
import { authenticate } from "./auth.js";
import { config } from "./config.js";
import { signPhoto } from "./security.js";
export const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  address: true,
  role: true,
  status: true,
  company: true,
  organization: true,
  locationEnabled: true,
} as const;
export function verificationDto(v: {
  createdAt: Date;
  latitude: number | null;
  longitude: number | null;
  [key: string]: unknown;
}) {
  const { createdAt, latitude, longitude, ...rest } = v;
  return {
    ...rest,
    date: createdAt.toISOString(),
    location:
      latitude !== null && longitude !== null
        ? { latitude, longitude }
        : undefined,
  };
}
function photoUrl(photoId: string) {
  const expires = Math.floor(Date.now() / 1000) + 600;
  return `${config.PUBLIC_API_URL}/api/photos/${photoId}?expires=${expires}&signature=${signPhoto(photoId, expires)}`;
}
export async function stateRoutes(app: FastifyInstance) {
  app.get("/api/state", { preHandler: authenticate }, async (req) => {
    const actor = req.actor;
    const admin = actor.role === "admin";
    const monitor = actor.role === "monitor";
    const oversight = admin || monitor;
    const manufacturer = actor.role === "manufacturer";
    const recent = { orderBy: { createdAt: "desc" as const }, take: 100 };
    const verifications = await db.verification.findMany({
      where: oversight
        ? admin
          ? {}
          : { verdict: { in: ["FAKE", "UNKNOWN"] } }
        : { userId: actor.id },
      ...recent,
    });
    const productIds = verifications
      .map((v) => v.productId)
      .filter((v): v is string => !!v);
    const products = await db.product.findMany({
      where: oversight
        ? {}
        : {
            OR: [
              { id: { in: productIds } },
              ...(manufacturer ? [{ manufacturerId: actor.id }] : []),
            ],
          },
      take: 500,
    });
    const batches = await db.batch.findMany({
      where: { productId: { in: products.map((p) => p.id) } },
      ...recent,
    });
    const [
      users,
      manufacturers,
      codes,
      wallet,
      transactions,
      reports,
      messages,
      notifications,
      payments,
      adverts,
      issuedBatches,
    ] = await Promise.all([
      db.user.findMany({
        where: admin
          ? {}
          : monitor
            ? {
                OR: [
                  { id: actor.id },
                  { id: { in: verifications.map((v) => v.userId) } },
                  { role: "manufacturer" },
                ],
              }
            : { id: actor.id },
        select: publicUserSelect,
        take: 500,
      }),
      db.manufacturer.findMany({
        where: oversight
          ? {}
          : {
              OR: [
                { status: "approved" },
                { id: actor.id },
                { products: { some: { id: { in: productIds } } } },
              ],
            },
        take: 500,
      }),
      manufacturer
        ? db.productCode.findMany({
            where: { batch: { product: { manufacturerId: actor.id } } },
            take: 100,
            orderBy: { batch: { createdAt: "desc" } },
          })
        : Promise.resolve([]),
      db.wallet.findUniqueOrThrow({ where: { userId: actor.id } }),
      db.walletTransaction.findMany({ where: { userId: actor.id }, ...recent }),
      db.report.findMany({
        where: oversight ? {} : { userId: actor.id },
        ...recent,
      }),
      db.message.findMany({
        where: manufacturer
          ? { manufacturerId: actor.id }
          : { userId: actor.id },
        ...recent,
      }),
      db.notification.findMany({ where: { userId: actor.id }, ...recent }),
      db.payment.findMany({ where: { userId: actor.id }, ...recent }),
      db.advert.findMany({ where: admin ? {} : { active: true }, ...recent }),
      db.issuedBatch.findMany({
        where: oversight ? {} : { manufacturerId: actor.id },
        ...recent,
      }),
    ]);
    const stats = admin
      ? {
          users: await db.user.count(),
          manufacturers: await db.manufacturer.count(),
          products: await db.product.count(),
          verifications: await db.verification.count(),
          reports: await db.report.count(),
          openReports: await db.report.count({ where: { status: "open" } }),
        }
      : undefined;
    return {
      actorId: actor.id,
      demoOtp: config.OTP_PROVIDER === "demo",
      demoPayments:
        config.PAYMENT_PROVIDER === "demo" && config.ALLOW_DEMO_PAYMENTS,
      stats,
      users,
      manufacturers: manufacturers.map((m) => ({
        id: m.id,
        name: m.name,
        rc: m.rc,
        category: m.category,
        status: m.status,
        approval: m.approval,
        reason: oversight || m.id === actor.id ? m.reason : undefined,
      })),
      products,
      batches: batches.map((b) => ({
        ...b,
        manufactured: b.manufactured.toISOString().slice(0, 10),
        expires: b.expires.toISOString().slice(0, 10),
      })),
      codes,
      wallets: { [actor.id]: wallet },
      verifications: verifications.map(verificationDto),
      transactions: transactions.map(({ createdAt, ...t }) => ({
        ...t,
        date: createdAt.toISOString(),
      })),
      reports: reports.map(
        ({ createdAt, latitude, longitude, photoId, ...r }) => ({
          ...r,
          date: createdAt.toISOString(),
          photo: photoId ? photoUrl(photoId) : undefined,
          location:
            latitude !== null && longitude !== null
              ? { latitude, longitude }
              : undefined,
        }),
      ),
      messages: messages.map(({ createdAt, ...m }) => ({
        ...m,
        date: createdAt.toISOString(),
      })),
      notifications: notifications.map(({ createdAt, ...n }) => ({
        ...n,
        date: createdAt.toISOString(),
      })),
      payments: payments.map(({ createdAt, ...p }) => ({
        ...p,
        date: createdAt.toISOString(),
      })),
      adverts,
      issuedBatches,
    };
  });
  app.get("/api/history", { preHandler: authenticate }, async (req) => {
    const query = req.query as { cursor?: string };
    const rows = await db.verification.findMany({
      where: { userId: req.actor.id },
      orderBy: { createdAt: "desc" },
      take: 51,
      include: { product: { include: { manufacturer: true } }, batch: true },
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    return {
      items: rows.slice(0, 50).map(({ product, batch, ...record }) => ({
        ...verificationDto(record),
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
      })),
      nextCursor: rows.length > 50 ? rows[49].id : null,
    };
  });
}
