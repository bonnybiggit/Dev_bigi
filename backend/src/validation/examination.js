import { z } from "zod";
import { objectId } from "./academic.js";
export const examId = objectId.transform((value) => value.toLowerCase());
export const examInput = z
  .object({
    name: z.string().trim().min(2).max(120),
    sessionId: examId,
    termId: examId,
    classId: examId,
    subjectIds: z
      .array(examId)
      .min(1)
      .max(40)
      .refine(
        (values) => new Set(values).size === values.length,
        "Subjects must be unique",
      ),
    totalMarks: z.number().int().min(1).max(1000),
    components: z
      .array(
        z
          .object({
            key: z.string().regex(/^[a-z][a-z0-9_]{0,29}$/),
            name: z.string().trim().min(1).max(60),
            maxMarks: z.number().int().min(1).max(1000),
            weight: z.number().int().min(1).max(100),
          })
          .strict(),
      )
      .min(1)
      .max(10),
    gradingScale: z
      .array(
        z
          .object({
            minPercent: z.number().int().min(0).max(100),
            grade: z.string().trim().min(1).max(10),
            remark: z.string().trim().min(1).max(100),
          })
          .strict(),
      )
      .min(1)
      .max(15),
    positionsEnabled: z.boolean().default(false),
    revision: z.number().int().min(1).optional(),
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.components.reduce((sum, item) => sum + item.weight, 0) !== 100)
      ctx.addIssue({
        code: "custom",
        path: ["components"],
        message:
          "Component weights must add up to 100%; totalMarks sets the final score total",
      });
    if (
      new Set(input.components.map((item) => item.key)).size !==
      input.components.length
    )
      ctx.addIssue({
        code: "custom",
        path: ["components"],
        message: "Component keys must be unique",
      });
    const minima = input.gradingScale.map((item) => item.minPercent);
    if (
      !minima.includes(0) ||
      new Set(minima).size !== minima.length ||
      new Set(input.gradingScale.map((item) => item.grade.toLowerCase()))
        .size !== input.gradingScale.length
    )
      ctx.addIssue({
        code: "custom",
        path: ["gradingScale"],
        message:
          "Grade thresholds and grade labels must be unique and include a 0% threshold",
      });
  });
const score = z
  .number()
  .finite()
  .min(0)
  .max(1000)
  .refine(
    (value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-7,
    "Use at most two decimal places",
  );
export const scoreInput = z
  .object({
    subjectId: examId,
    arm: z
      .string()
      .trim()
      .max(20)
      .transform((value) => value.toUpperCase())
      .default(""),
    reason: z.string().trim().max(300).default(""),
    entries: z
      .array(
        z
          .object({
            studentId: examId,
            revision: z.number().int().min(0).default(0),
            scores: z.record(z.string().regex(/^[a-z][a-z0-9_]{0,29}$/), score),
            teacherComment: z.string().trim().max(500).default(""),
          })
          .strict(),
      )
      .min(1)
      .max(50)
      .refine(
        (values) =>
          new Set(values.map((item) => item.studentId)).size === values.length,
        "Students must be unique in the batch",
      ),
  })
  .strict();
export const examFilters = z
  .object({
    search: z.string().trim().max(100).default(""),
    sessionId: z.union([examId, z.literal("")]).default(""),
    termId: z.union([examId, z.literal("")]).default(""),
    classId: z.union([examId, z.literal("")]).default(""),
    status: z
      .enum(["", "draft", "submitted", "approved", "published"])
      .default(""),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(25),
  })
  .strict();
export const scoreFilters = z
  .object({
    subjectId: examId,
    arm: z
      .string()
      .trim()
      .max(20)
      .transform((value) => value.toUpperCase())
      .default(""),
    search: z.string().trim().max(100).default(""),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(25),
  })
  .strict();
