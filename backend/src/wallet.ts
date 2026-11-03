import { db, type Tx } from "./db.js";
import { requireValue } from "./security.js";
const MAX_BALANCE = 2_000_000_000;
export async function lockWallets(tx: Tx, userIds: string[]) {
  // Stable lock order prevents transfer deadlocks; all billing paths use these rows.
  for (const userId of [...new Set(userIds)].sort())
    await tx.$queryRaw`SELECT "userId" FROM "Wallet" WHERE "userId"=${userId} FOR UPDATE`;
}
export async function credit(tx: Tx, userId: string, amountKobo: number) {
  const result = await tx.wallet.updateMany({
    where: { userId, balanceKobo: { lte: MAX_BALANCE - amountKobo } },
    data: { balanceKobo: { increment: amountKobo } },
  });
  requireValue(
    result.count === 1,
    "Wallet credit would exceed the supported balance limit.",
    409,
  );
}
export async function verifyProduct(
  userId: string,
  code: string,
  idempotencyKey: string,
  location?: { latitude: number; longitude: number },
) {
  return db.$transaction(
    async (tx) => {
      await lockWallets(tx, [userId]);
      const existing = await tx.verification.findUnique({
        where: { userId_idempotencyKey: { userId, idempotencyKey } },
      });
      if (existing) {
        requireValue(
          existing.code === code,
          "This request key was already used for another scan.",
          409,
        );
        return existing;
      }
      const wallet = await tx.wallet.findUniqueOrThrow({ where: { userId } });
      const charge = wallet.freeUsed < 10 ? 0 : 1000;
      const debit = await tx.wallet.updateMany({
        where: { userId, balanceKobo: { gte: charge } },
        data: {
          balanceKobo: { decrement: charge },
          ...(charge === 0 ? { freeUsed: { increment: 1 } } : {}),
        },
      });
      requireValue(
        debit.count === 1,
        "Your wallet balance is low. Top up to continue verifying.",
        402,
      );
      const record = await tx.productCode.findUnique({
        where: { value: code },
        include: {
          batch: { include: { product: { include: { manufacturer: true } } } },
        },
      });
      let verdict: "GENUINE" | "FAKE" | "UNKNOWN" = "UNKNOWN";
      let reason =
        "This code is not registered. Authenticity cannot be confirmed.";
      if (record) {
        reason = record.blocked
          ? "This product code has been blocked."
          : record.batch.status === "recalled"
            ? "This production batch has been recalled."
            : record.batch.product.manufacturer.status !== "approved"
              ? "The manufacturer is not approved."
              : "";
        verdict = reason ? "FAKE" : "GENUINE";
        if (!reason)
          reason =
            "This code matches a registered product from an approved manufacturer.";
      }
      const verification = await tx.verification.create({
        data: {
          userId,
          code,
          idempotencyKey,
          verdict,
          reason,
          chargedKobo: charge,
          productId: record?.batch.productId,
          batchId: record?.batchId,
          latitude: location?.latitude,
          longitude: location?.longitude,
        },
      });
      if (charge)
        await tx.walletTransaction.create({
          data: {
            userId,
            type: "charge",
            amountKobo: -charge,
            note: "Product verification",
            reference: verification.id,
          },
        });
      return verification;
    },
    { timeout: 15000 },
  );
}
export async function sendMoney(
  userId: string,
  recipientId: string,
  amountKobo: number,
  idempotencyKey: string,
) {
  requireValue(
    userId !== recipientId,
    "Choose another user to receive this transfer.",
  );
  return db.$transaction(
    async (tx) => {
      await lockWallets(tx, [userId, recipientId]);
      const existing = await tx.transfer.findUnique({
        where: { userId_idempotencyKey: { userId, idempotencyKey } },
      });
      if (existing) {
        requireValue(
          existing.recipientId === recipientId &&
            existing.amountKobo === amountKobo,
          "This request key was already used for a different transfer.",
          409,
        );
        return existing;
      }
      const recipient = await tx.user.findUnique({
        where: { id: recipientId },
      });
      requireValue(
        recipient?.status === "active",
        "No active user has that Verysure ID.",
        404,
      );
      const debit = await tx.wallet.updateMany({
        where: { userId, balanceKobo: { gte: amountKobo } },
        data: { balanceKobo: { decrement: amountKobo } },
      });
      requireValue(debit.count === 1, "Insufficient wallet balance.", 402);
      await credit(tx, recipientId, amountKobo);
      const transfer = await tx.transfer.create({
        data: { userId, recipientId, amountKobo, idempotencyKey },
      });
      await tx.walletTransaction.createMany({
        data: [
          {
            userId,
            type: "transfer_out",
            amountKobo: -amountKobo,
            note: `Transfer to ${recipientId}`,
            reference: transfer.id,
          },
          {
            userId: recipientId,
            type: "transfer_in",
            amountKobo,
            note: `Transfer from ${userId}`,
            reference: transfer.id,
          },
        ],
      });
      await tx.notification.create({
        data: {
          userId: recipientId,
          title: "Transfer received",
          body: `₦${(amountKobo / 100).toFixed(2)} received from ${userId}.`,
        },
      });
      return transfer;
    },
    { timeout: 15000 },
  );
}
export async function settlePayment(
  paymentId: string,
  expected?: { amountKobo: number; externalRef?: string },
) {
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Payment" WHERE id=${paymentId} FOR UPDATE`;
      const payment = await tx.payment.findUnique({ where: { id: paymentId } });
      requireValue(payment, "Payment not found.", 404);
      if (expected)
        requireValue(
          payment.amountKobo === expected.amountKobo &&
            (!payment.externalRef ||
              payment.externalRef === expected.externalRef),
          "Payment settlement does not match the expected amount/reference.",
          409,
        );
      if (payment.status === "settled") return { alreadySettled: true };
      requireValue(
        payment.status === "pending",
        "Cancelled payments cannot be settled.",
        409,
      );
      await lockWallets(tx, [payment.userId]);
      await credit(tx, payment.userId, payment.amountKobo);
      await tx.payment.update({
        where: { id: paymentId },
        data: { status: "settled", settledAt: new Date() },
      });
      await tx.walletTransaction.create({
        data: {
          userId: payment.userId,
          type: "topup",
          amountKobo: payment.amountKobo,
          reference: payment.id,
          note:
            payment.provider === "demo"
              ? "Demo payment top-up"
              : "Wallet top-up",
        },
      });
      await tx.notification.create({
        data: {
          userId: payment.userId,
          title: "Wallet credited",
          body: `₦${(payment.amountKobo / 100).toFixed(2)} added to your wallet.`,
        },
      });
      return { alreadySettled: false };
    },
    { timeout: 15000 },
  );
}
