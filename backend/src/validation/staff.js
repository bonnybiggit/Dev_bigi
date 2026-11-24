import { z } from "zod";
import { day, objectId } from "./academic.js";
const text = (max) => z.string().trim().min(2).max(max);
const references = z
  .array(objectId.transform((value) => value.toLowerCase()))
  .max(100)
  .refine(
    (values) => new Set(values).size === values.length,
    "Assignments must be unique",
  )
  .default([]);
export const staffInput = z
  .object({
    employeeId: z
      .string()
      .trim()
      .min(1)
      .max(40)
      .regex(
        /^[A-Za-z0-9][A-Za-z0-9._/-]*$/,
        "Use letters, numbers, dots, underscores, slashes or hyphens",
      )
      .transform((value) => value.toUpperCase()),
    fullName: text(120),
    email: z
      .string()
      .trim()
      .pipe(z.email().max(254))
      .transform((value) => value.toLowerCase()),
    phone: z
      .string()
      .trim()
      .min(7)
      .max(30)
      .regex(/^\+?[\d ()-]+$/)
      .refine(
        (value) => value.replace(/\D/g, "").length >= 7,
        "Enter a valid phone number",
      ),
    gender: z.enum(["female", "male", "other", "not_specified"]),
    address: z.string().trim().max(300).default(""),
    dateOfBirth: z
      .union([day, z.literal(""), z.null()])
      .default(null)
      .transform((value) => value || null),
    employmentDate: day,
    department: text(80),
    designation: text(100),
    employmentType: z.enum([
      "full_time",
      "part_time",
      "contract",
      "temporary",
      "intern",
    ]),
    category: z.enum(["teaching", "non_teaching"]),
    classIds: references,
    subjectIds: references,
  })
  .strict()
  .superRefine((input, ctx) => {
    if (
      input.dateOfBirth &&
      (new Date(input.dateOfBirth) > new Date() ||
        input.dateOfBirth >= input.employmentDate)
    )
      ctx.addIssue({
        code: "custom",
        path: ["dateOfBirth"],
        message: "Date of birth must be in the past and before employment date",
      });
    if (
      input.category === "non_teaching" &&
      (input.classIds.length || input.subjectIds.length)
    )
      ctx.addIssue({
        code: "custom",
        path: ["category"],
        message: "Non-teaching staff cannot have teaching assignments",
      });
  });
export const staffListInput = z
  .object({
    search: z.string().trim().max(100).default(""),
    category: z.enum(["", "teaching", "non_teaching"]).default(""),
    status: z.enum(["", "active", "inactive"]).default(""),
    employmentType: z
      .enum(["", "full_time", "part_time", "contract", "temporary", "intern"])
      .default(""),
    department: z.string().trim().max(80).default(""),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(10),
  })
  .strict();
