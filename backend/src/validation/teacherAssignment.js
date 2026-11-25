import { z } from "zod";
import { objectId } from "./academic.js";
const id = objectId.transform((v) => v.toLowerCase());
export const optionalPeriod = z
  .union([id, z.literal(""), z.null()])
  .default(null)
  .transform((v) => v || null);
export const assignmentInput = z
  .object({
    staffId: id,
    sessionId: id,
    termId: optionalPeriod,
    classId: id,
    arm: z
      .string()
      .trim()
      .max(20)
      .transform((v) => v.toUpperCase())
      .default(""),
    kind: z.enum(["teaching", "class_teacher"]).default("teaching"),
    subjectIds: z
      .array(id)
      .max(40)
      .refine((v) => new Set(v).size === v.length, "Subjects must be unique")
      .default([]),
    status: z.enum(["active", "inactive"]).default("active"),
    adoptLegacy: z.boolean().default(false),
    reason: z.string().trim().min(3).max(500),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (
      (v.kind === "teaching" && !v.subjectIds.length) ||
      (v.kind === "class_teacher" && v.subjectIds.length)
    )
      ctx.addIssue({
        code: "custom",
        message:
          "Teaching requires subjects; a class teacher appointment does not grant subject access",
      });
  });
export const assignmentEditInput = assignmentInput.safeExtend({
  revision: z.number().int().min(1),
});
export const assignmentAction = z
  .object({
    revision: z.number().int().min(1),
    reason: z.string().trim().min(3).max(500),
  })
  .strict();
export const assignmentFilters = z
  .object({
    staffId: id.optional(),
    classId: id.optional(),
    subjectId: id.optional(),
    sessionId: id.optional(),
    termId: id.optional(),
    status: z.enum(["", "active", "inactive"]).default(""),
    search: z.string().trim().max(100).default(""),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(25),
  })
  .strict();
