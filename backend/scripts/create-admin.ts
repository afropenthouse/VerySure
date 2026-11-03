import { randomInt } from "node:crypto";
import { z } from "zod";
import { db } from "../src/db.js";
import { hashPassword } from "../src/security.js";
const input = z
  .object({
    ADMIN_EMAIL: z.email().transform((s) => s.toLowerCase()),
    ADMIN_PASSWORD: z.string().min(16).max(128),
    ADMIN_NAME: z.string().min(2),
    ADMIN_PHONE: z.string().min(10).max(20),
    ADMIN_ADDRESS: z.string().min(3),
  })
  .parse(process.env);
try {
  const existing = await db.user.findUnique({
    where: { email: input.ADMIN_EMAIL },
  });
  if (existing)
    throw new Error(
      "That account already exists. This command will not modify its role or password.",
    );
  let id = String(randomInt(100000, 1000000));
  while (await db.user.findUnique({ where: { id } }))
    id = String(randomInt(100000, 1000000));
  await db.user.create({
    data: {
      id,
      email: input.ADMIN_EMAIL,
      passwordHash: await hashPassword(input.ADMIN_PASSWORD),
      name: input.ADMIN_NAME,
      phone: input.ADMIN_PHONE,
      address: input.ADMIN_ADDRESS,
      role: "admin",
      wallet: { create: {} },
    },
  });
  console.log(`Created administrator ${id}. Password was not logged.`);
} finally {
  await db.$disconnect();
}
