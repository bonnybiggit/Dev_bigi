import { z } from "zod";
import { day, objectId } from "./academic.js";
const id = objectId.transform((value) => value.toLowerCase());
export const studentStatus = z.enum(["active", "inactive", "archived"]);
export const studentInput = z
  .object({
    admissionNumber: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .regex(
        /^[A-Za-z0-9][A-Za-z0-9._/-]*$/,
        "Use letters, numbers, dots, underscores, slashes or hyphens",
      )
      .transform((value) => value.toUpperCase()),
    firstName: z.string().trim().min(1).max(60),
    middleName: z.string().trim().max(60).default(""),
    lastName: z.string().trim().min(1).max(60),
    dateOfBirth: day,
    gender: z.enum(["female", "male", "other", "not_specified"]),
    address: z.string().trim().min(2).max(300),
    admissionDate: day,
    previousSchool: z.string().trim().max(160).default(""),
    sessionId: id,
    classId: id,
    arm: z
      .string()
      .trim()
      .max(20)
      .transform((value) => value.toUpperCase())
      .default(""),
    admissionStatus: z.enum(["pending", "admitted", "waitlisted", "rejected"]),
  })
  .strict()
  .refine(
    (value) =>
      new Date(value.dateOfBirth) < new Date() &&
      value.dateOfBirth < value.admissionDate,
    {
      path: ["dateOfBirth"],
      message: "Date of birth must be in the past and before admission date",
    },
  );
export const studentListInput = z
  .object({
    search: z.string().trim().max(100).default(""),
    applicationStatus: z
      .enum([
        "",
        "awaiting_form",
        "form_received",
        "under_review",
        "approved",
        "rejected",
        "withdrawn",
        "cancelled",
        "enrolled",
      ])
      .default(""),
    sessionId: z.union([id, z.literal("")]).default(""),
    classId: z.union([id, z.literal("")]).default(""),
    arm: z
      .string()
      .trim()
      .max(20)
      .transform((value) => value.toUpperCase())
      .default(""),
    status: z.union([studentStatus, z.literal("")]).default(""),
    admissionStatus: z
      .enum(["", "pending", "admitted", "waitlisted", "rejected"])
      .default(""),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(10),
  })
  .strict();
