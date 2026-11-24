import { z } from "zod";
import { objectId } from "./academic.js";
import { attendanceDay } from "./attendance.js";
import { parseMoney, MAX_MINOR } from "../services/money.js";
export const financeId = objectId.transform((value) => value.toLowerCase());
export const moneyInput = z
  .string()
  .regex(
    /^-?(0|[1-9]\d{0,10})(\.\d{1,2})?$/,
    "Use a decimal amount with at most two decimal places; no exponent or separators",
  )
  .transform(parseMoney)
  .refine(
    (value) => value <= MAX_MINOR && value >= -MAX_MINOR && value !== 0n,
    "Amount must be nonzero and within the supported limit",
  )
  .transform(Number);
export const positiveMoney = moneyInput.refine(
  (value) => value > 0,
  "Amount must be positive",
);
const requestKey = z
  .string()
  .min(16)
  .max(80)
  .regex(/^[A-Za-z0-9_-]+$/);
export const reasonInput = z.string().trim().min(3).max(300);
export const optionInput = z
  .object({
    name: z.string().trim().min(2).max(100),
    status: z.enum(["active", "inactive"]).default("active"),
  })
  .strict();
export const structureInput = z
  .object({
    sessionId: financeId,
    termId: financeId,
    classId: financeId,
    revision: z.number().int().min(1).optional(),
    lines: z
      .array(
        z
          .object({
            categoryId: financeId,
            amount: positiveMoney,
            compulsory: z.boolean(),
          })
          .strict(),
      )
      .min(1)
      .max(50)
      .refine(
        (lines) =>
          new Set(lines.map((line) => line.categoryId)).size === lines.length,
        "Fee categories must be unique",
      ),
  })
  .strict();
export const generateInput = z
  .object({
    studentId: financeId,
    structureId: financeId,
    optionalCategoryIds: z
      .array(financeId)
      .max(50)
      .refine(
        (ids) => new Set(ids).size === ids.length,
        "Optional categories must be unique",
      )
      .default([]),
  })
  .strict();
export const paymentInput = z
  .object({
    invoiceId: financeId,
    amount: positiveMoney,
    methodId: z.union([
      z.enum(["cash", "bank_transfer", "pos", "other"]),
      financeId,
    ]),
    paidOn: attendanceDay,
    externalReference: z
      .string()
      .trim()
      .max(100)
      .transform((value) => value.toUpperCase())
      .default(""),
    requestKey,
  })
  .strict();
export const entryInput = z
  .object({
    kind: z.enum(["discount", "scholarship", "adjustment"]),
    amount: moneyInput,
    reason: reasonInput,
    revision: z.number().int().min(1),
    requestKey,
  })
  .strict()
  .refine((input) => input.kind === "adjustment" || input.amount > 0, {
    path: ["amount"],
    message: "Discounts and scholarships must be positive",
  });
export const financeFilters = z
  .object({
    search: z.string().trim().max(100).default(""),
    sessionId: z.union([financeId, z.literal("")]).default(""),
    termId: z.union([financeId, z.literal("")]).default(""),
    classId: z.union([financeId, z.literal("")]).default(""),
    studentId: z.union([financeId, z.literal("")]).default(""),
    status: z
      .enum(["", "posted", "reversed", "paid", "outstanding"])
      .default(""),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(10),
  })
  .strict();
