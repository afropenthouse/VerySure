import { db } from "../src/db.js";
import { config } from "../src/config.js";
import { hashPassword } from "../src/security.js";
export async function seedDatabase() {
  if (config.NODE_ENV === "production")
    throw new Error("Sample data must not be seeded in production.");
  const password = process.env.SEED_PASSWORD;
  if (!password || password.length < 12)
    throw new Error(
      "Set a development SEED_PASSWORD with at least 12 characters.",
    );
  const passwordHash = await hashPassword(password);
  const users = [
    {
      id: "104286",
      name: "Ada Okafor",
      email: "consumer@verysure.ng",
      phone: "08012345000",
      role: "consumer" as const,
    },
    {
      id: "104287",
      name: "Chidi Stores",
      email: "retailer@verysure.ng",
      phone: "08012345001",
      role: "retailer" as const,
      company: "Chidi Stores",
    },
    {
      id: "104288",
      name: "Emzor Pharmaceuticals",
      email: "manufacturer@verysure.ng",
      phone: "08012345002",
      role: "manufacturer" as const,
      company: "Emzor Pharmaceuticals",
    },
    {
      id: "104289",
      name: "NAFDAC Officer",
      email: "monitor@verysure.ng",
      phone: "08012345003",
      role: "monitor" as const,
      organization: "NAFDAC",
    },
    {
      id: "104290",
      name: "Platform Admin",
      email: "admin@verysure.ng",
      phone: "08012345004",
      role: "admin" as const,
    },
    {
      id: "204291",
      name: "Greenfield Foods",
      email: "foods@verysure.ng",
      phone: "08012345005",
      role: "manufacturer" as const,
      company: "Greenfield Foods",
    },
    {
      id: "104292",
      name: "SON Officer",
      email: "son@verysure.ng",
      phone: "08012345006",
      role: "monitor" as const,
      organization: "SON",
    },
  ];
  for (const user of users)
    await db.user.upsert({
      where: { id: user.id },
      update: {},
      create: {
        ...user,
        passwordHash,
        address: "14 Adeola Odeku Street, Lagos",
        wallet: { create: { balanceKobo: 20000 } },
        notifications: {
          create: {
            title: "Welcome to Verysure",
            body: "Your first 10 product verifications are free.",
          },
        },
      },
    });
  await db.manufacturer.upsert({
    where: { id: "104288" },
    update: {},
    create: {
      id: "104288",
      name: "Emzor Pharmaceuticals",
      rc: "RC-123456",
      category: "Medicines",
      status: "approved",
      approval: "NAFDAC-APP-2026-00042",
    },
  });
  await db.manufacturer.upsert({
    where: { id: "204291" },
    update: {},
    create: {
      id: "204291",
      name: "Greenfield Foods",
      rc: "RC-789012",
      category: "Food & beverages",
    },
  });
  for (const p of [
    {
      id: "sample-p1",
      name: "Paracetamol 500mg",
      regulatory: "A4-0123",
      unit: "20 tablets",
    },
    {
      id: "sample-p2",
      name: "Vitamin C 100mg",
      regulatory: "A4-0456",
      unit: "30 tablets",
    },
  ])
    await db.product.upsert({
      where: { id: p.id },
      update: {},
      create: {
        ...p,
        manufacturerId: "104288",
        category: "Medicines",
        description: "Sample product for development testing.",
      },
    });
  for (const b of [
    {
      id: "sample-b1",
      productId: "sample-p1",
      number: "NAFDAC-202610-00042",
      status: "active" as const,
    },
    {
      id: "sample-b2",
      productId: "sample-p2",
      number: "NAFDAC-202610-00043",
      status: "recalled" as const,
    },
  ])
    await db.batch.upsert({
      where: { id: b.id },
      update: {},
      create: {
        ...b,
        quantity: 1000,
        manufactured: new Date("2026-09-01"),
        expires: new Date("2029-09-01"),
      },
    });
  for (const c of [
    {
      value: "VS-EMZR-2026-0001",
      batchId: "sample-b1",
      type: "serial" as const,
      blocked: false,
    },
    {
      value: "6151234567891",
      batchId: "sample-b1",
      type: "barcode" as const,
      blocked: false,
    },
    {
      value: "VS-RECALL-0001",
      batchId: "sample-b2",
      type: "serial" as const,
      blocked: false,
    },
    {
      value: "VS-BLOCKED-0001",
      batchId: "sample-b1",
      type: "seal" as const,
      blocked: true,
    },
  ])
    await db.productCode.upsert({
      where: { value: c.value },
      update: {},
      create: c,
    });
  await db.advert.upsert({
    where: { id: "sample-advert" },
    update: {},
    create: {
      id: "sample-advert",
      title: "Small check. Big peace of mind.",
      body: "Look for the code on your next purchase. A few seconds can make all the difference.",
    },
  });
}
if (process.argv[1]?.replace(/\\/g, "/").endsWith("/prisma/seed.ts")) {
  try {
    await seedDatabase();
    console.log(
      "Seeded seven development accounts. Their shared password is SEED_PASSWORD in backend/.env.",
    );
  } finally {
    await db.$disconnect();
  }
}
