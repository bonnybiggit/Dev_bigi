import { z } from "zod";
export const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid record ID");
const text = (max) => z.string().trim().min(2).max(max);
export const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    );
  }, "Enter a valid calendar date");
const dates = { startDate: day, endDate: day };
const ordered = (schema) =>
  schema.refine((value) => value.startDate < value.endDate, {
    path: ["endDate"],
    message: "End date must be after start date",
  });
export const sessionInput = ordered(
  z.object({ name: text(40), ...dates }).strict(),
);
export const termInput = ordered(
  z
    .object({
      sessionId: objectId,
      name: z.enum(["First Term", "Second Term", "Third Term"]),
      ...dates,
    })
    .strict(),
);
export const activationInput = z
  .object({
    status: z.enum(["active", "inactive"]),
    confirmSwitch: z.boolean().default(false),
  })
  .strict();
export const statusInput = z
  .object({ status: z.enum(["active", "inactive"]) })
  .strict();
export const classInput = z
  .object({
    name: text(80),
    capacity: z.number().int().min(1).max(10000),
    arms: z
      .array(
        z
          .string()
          .trim()
          .min(1)
          .max(20)
          .transform((value) => value.toUpperCase()),
      )
      .max(26)
      .refine(
        (value) => new Set(value).size === value.length,
        "Arm names must be unique",
      )
      .default([]),
    inactiveArms: z
      .array(
        z
          .string()
          .trim()
          .min(1)
          .max(20)
          .transform((value) => value.toUpperCase()),
      )
      .max(26)
      .refine(
        (value) => new Set(value).size === value.length,
        "Inactive arm names must be unique",
      )
      .optional(),
  })
  .strict()
  .refine(
    (value) =>
      (value.inactiveArms || []).every((arm) => value.arms.includes(arm)),
    {
      path: ["inactiveArms"],
      message: "Inactive arms must belong to this class",
    },
  );
export const subjectInput = z
  .object({
    name: text(100),
    classId: objectId,
    code: z.string().trim().max(30).default(""),
    description: z.string().trim().max(1000).default(""),
  })
  .strict();
const phone = z
  .string()
  .trim()
  .max(30)
  .refine(
    (value) =>
      !value ||
      (/^\+?[\d ()-]{7,30}$/.test(value) &&
        value.replace(/\D/g, "").length >= 7),
    "Enter a valid phone number",
  );
export const profileInput = z
  .object({
    name: text(160),
    city: text(80),
    country: text(80),
    schoolType: z.enum([
      "Nursery",
      "Primary",
      "Nursery and Primary",
      "Secondary",
      "Other",
    ]),
    address: z.string().trim().max(300),
    phone,
    email: z
      .union([z.literal(""), z.email().max(254)])
      .transform((value) => value.toLowerCase()),
    logoUrl: z
      .string()
      .trim()
      .max(2048)
      .refine((value) => {
        if (!value) return true;
        if (
          /^\/api\/branding\/schools\/[a-f\d]{24}\/logos\/[a-f\d]{24}$/i.test(
            value,
          )
        )
          return true;
        try {
          const url = new URL(value);
          return url.protocol === "https:" && !url.username && !url.password;
        } catch {
          return false;
        }
      }, "Choose an uploaded school logo or an HTTPS image URL without credentials"),
  })
  .strict();
