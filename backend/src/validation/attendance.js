import { z } from "zod";
import { day, objectId } from "./academic.js";
export function attendanceToday() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type) => parts.find((part) => part.type === type).value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}
export const attendanceDay = day.refine(
  (value) => value <= attendanceToday(),
  "Attendance dates cannot be in the future",
);
export const attendanceKind = z.enum(["student", "staff"]);
export const attendanceStatus = z.enum([
  "present",
  "absent",
  "late",
  "excused",
]);
const id = objectId.transform((value) => value.toLowerCase());
const optionalId = z.union([id, z.literal("")]).default("");
const paging = {
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(25),
};
export const attendancePaging = z.object(paging).strict();
const placement = {
  sessionId: id,
  classId: id,
  arm: z
    .string()
    .trim()
    .max(20)
    .transform((value) => value.toUpperCase())
    .default(""),
};
const entries = z
  .array(
    z
      .object({
        personId: id,
        status: attendanceStatus,
        revision: z.number().int().min(0).default(0),
      })
      .strict(),
  )
  .min(1)
  .max(100)
  .refine(
    (values) =>
      new Set(values.map((value) => value.personId)).size === values.length,
    "Duplicate people in attendance batch",
  );
export const markInput = (kind) =>
  z
    .object({
      date: attendanceDay,
      ...(kind === "student" ? placement : {}),
      entries,
      correctionReason: z.string().trim().max(300).default(""),
    })
    .strict();
export const rosterInput = (kind) =>
  z
    .object({
      date: attendanceDay,
      ...(kind === "student"
        ? placement
        : { category: z.enum(["", "teaching", "non_teaching"]).default("") }),
      search: z.string().trim().max(100).default(""),
      ...paging,
    })
    .strict();
export const reportInput = z
  .object({
    kind: attendanceKind,
    period: z.enum(["daily", "weekly", "monthly", "custom"]).default("daily"),
    date: attendanceDay.optional(),
    from: attendanceDay.optional(),
    to: attendanceDay.optional(),
    sessionId: optionalId,
    classId: optionalId,
    arm: z
      .string()
      .trim()
      .max(20)
      .transform((value) => value.toUpperCase())
      .default(""),
    personId: optionalId,
    category: z.enum(["", "teaching", "non_teaching"]).default(""),
    status: z.union([attendanceStatus, z.literal("")]).default(""),
    search: z.string().trim().max(100).default(""),
    ...paging,
  })
  .strict()
  .superRefine((input, ctx) => {
    if (input.period === "custom" ? !input.from || !input.to : !input.date)
      ctx.addIssue({
        code: "custom",
        message: "Choose a date, or both dates for a custom range",
      });
    if (
      input.kind === "staff" &&
      (input.sessionId || input.classId || input.arm)
    )
      ctx.addIssue({
        code: "custom",
        message: "Staff reports do not accept student placement filters",
      });
    if (input.kind === "student" && input.category)
      ctx.addIssue({
        code: "custom",
        message: "Student reports do not accept staff category filters",
      });
  });
