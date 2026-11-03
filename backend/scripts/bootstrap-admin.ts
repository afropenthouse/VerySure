import { z } from "zod";
import { db } from "../src/db.js";

// Explicit operator-only bootstrap for an already registered owner. Public
// routes never expose this capability. Ordinary provisioning uses admin:create.
export async function bootstrapAdmin(
  address: string,
  promoteExisting: boolean,
) {
  const email = z.email().parse(address).toLowerCase();
  if (!promoteExisting)
    throw new Error(
      "Explicit --promote-existing is required. This assigns the first administrator role to an existing account.",
    );
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`LOCK TABLE "User" IN SHARE ROW EXCLUSIVE MODE`;
    const user = await tx.user.findUnique({ where: { email } });
    if (!user || user.status !== "active")
      throw new Error(
        "An active registered owner with that email is required. Use admin:create for a new account.",
      );
    if (user.role === "admin") return;
    if (await tx.user.count({ where: { role: "admin" } }))
      throw new Error(
        "An administrator already exists; bootstrap will not grant additional administrators.",
      );
    if (user.role !== "consumer" && user.role !== "retailer")
      throw new Error(
        "Bootstrap refuses to replace a manufacturer or regulator role.",
      );
    await tx.user.update({ where: { id: user.id }, data: { role: "admin" } });
    await tx.session.deleteMany({ where: { userId: user.id } });
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: "bootstrap.first-admin",
        targetId: user.id,
        details: {
          previousRole: user.role,
          provisioning: "explicit-operator-command",
        },
      },
    });
  });
}
if (
  process.argv[1]?.replace(/\\/g, "/").endsWith("/scripts/bootstrap-admin.ts")
) {
  try {
    await bootstrapAdmin(
      z.email().parse(process.env.ADMIN_EMAIL),
      process.argv.includes("--promote-existing"),
    );
    console.log(
      "Administrator access is ready. Sign in again with the account's existing password. Password and wallet were preserved.",
    );
  } finally {
    await db.$disconnect();
  }
}
