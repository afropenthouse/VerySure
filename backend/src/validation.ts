import { z } from "zod";
export const text = (max = 200) => z.string().trim().min(1).max(max);
export const id = z.string().min(1).max(150);
export const publicId = z.string().regex(/^\d{6}$/);
export const location = z
  .object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  })
  .strict()
  .optional();
export const amount = z.number().int().min(100).max(100_000_000);
export const key = z.string().min(12).max(100);
export const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (s) =>
      !Number.isNaN(Date.parse(s)) &&
      new Date(s).toISOString().slice(0, 10) === s,
    "Invalid calendar date",
  );
export const registration = z
  .object({
    name: text(),
    email: z
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
    phone: z
      .string()
      .regex(/^\+?[\d\s-]{10,15}$/)
      .transform((v) => v.replace(/[\s-]/g, "")),
    password: z.string().min(8).max(128),
    address: text(500),
    role: z.enum(["consumer", "retailer", "manufacturer"]),
    company: text().optional(),
    rc: text().optional(),
    category: text().optional(),
  })
  .strict()
  .superRefine((v, c) => {
    if ((v.role === "retailer" || v.role === "manufacturer") && !v.company)
      c.addIssue({
        code: "custom",
        path: ["company"],
        message: "Company name is required",
      });
    if (v.role === "manufacturer" && (!v.rc || !v.category))
      c.addIssue({
        code: "custom",
        path: ["rc"],
        message: "CAC / RC and category are required",
      });
  });
