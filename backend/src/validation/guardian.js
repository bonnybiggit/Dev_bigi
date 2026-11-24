import { z } from "zod";
const phone = z
  .string()
  .trim()
  .min(7)
  .max(30)
  .regex(/^\+?[\d ()-]+$/)
  .refine(
    (value) => value.replace(/\D/g, "").length >= 7,
    "Enter a valid phone number",
  );
export const guardianInput = z
  .object({
    fullName: z.string().trim().min(2).max(120),
    email: z
      .string()
      .trim()
      .pipe(z.union([z.literal(""), z.email().max(254)]))
      .transform((value) => value.toLowerCase())
      .default(""),
    primaryPhone: phone,
    alternativePhone: z.union([phone, z.literal("")]).default(""),
    address: z.string().trim().min(2).max(300),
    occupation: z.string().trim().max(100).default(""),
    gender: z
      .enum(["female", "male", "other", "not_specified"])
      .default("not_specified"),
    emergencyContactName: z.string().trim().max(120).default(""),
    emergencyContactPhone: z.union([phone, z.literal("")]).default(""),
    emergencyContactRelationship: z.string().trim().max(60).default(""),
  })
  .strict()
  .refine(
    (value) =>
      ![
        value.emergencyContactName,
        value.emergencyContactPhone,
        value.emergencyContactRelationship,
      ].some(Boolean) ||
      !!(value.emergencyContactName && value.emergencyContactPhone),
    {
      path: ["emergencyContactPhone"],
      message: "Provide both a name and phone number for an emergency contact",
    },
  );
export const guardianListInput = z
  .object({
    search: z.string().trim().max(100).default(""),
    status: z.enum(["", "active", "inactive"]).default(""),
    linkage: z.enum(["", "linked", "unlinked"]).default(""),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(10),
  })
  .strict();
export const relationshipInput = z
  .object({ relationship: z.enum(["father", "mother", "guardian", "other"]) })
  .strict();
