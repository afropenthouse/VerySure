import type { Tx } from "./db.js";
export async function issueNumber(tx: Tx, prefix: string) {
  // Atomic upsert serializes issuance without depending on list counts or timestamps.
  for (let attempt = 0; attempt < 10; attempt++) {
    const counter = await tx.counter.upsert({
      where: { name: prefix },
      create: { name: prefix, value: 1 },
      update: { value: { increment: 1 } },
    });
    const value = `${prefix}-${String(counter.value).padStart(5, "0")}`;
    if (
      !(await tx.manufacturer.findUnique({ where: { approval: value } })) &&
      !(await tx.issuedBatch.findUnique({ where: { number: value } }))
    )
      return value;
  }
  throw new Error("Could not allocate an unused official number.");
}
