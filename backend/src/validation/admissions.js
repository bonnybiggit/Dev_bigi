import { z } from "zod";
import { day, objectId } from "./academic.js";
import { applicationStatuses } from "../models/Admissions.js";
import { documentTypes } from "../services/documentTypes.js";
const id = objectId.transform((v) => v.toLowerCase());
const optionalId = z
  .union([id, z.literal(""), z.null()])
  .optional()
  .transform((v) => v || null);
const text = (max) => z.string().trim().max(max).default("");
export const requestKey = z
  .string()
  .trim()
  .min(16)
  .max(100)
  .regex(/^[a-zA-Z0-9._:-]+$/);
export const draftStudent = z
  .object({
    firstName: text(60),
    middleName: text(60),
    lastName: text(60),
    dateOfBirth: z.union([day, z.literal("")]).default(""),
    gender: z
      .enum(["female", "male", "other", "not_specified"])
      .default("not_specified"),
    address: text(300),
    nationality: text(80),
    previousSchool: text(160),
  })
  .strict();
export const draftGuardian = z
  .object({
    guardianId: optionalId,
    verified: z.boolean().default(false),
    createNewConfirmed: z.boolean().default(false),
    relationship: z
      .enum(["father", "mother", "guardian", "other"])
      .default("guardian"),
    fullName: text(120),
    primaryPhone: text(30),
    alternativePhone: text(30),
    email: text(254),
    address: text(300),
    occupation: text(100),
    gender: z
      .enum(["female", "male", "other", "not_specified"])
      .default("not_specified"),
    emergencyContactName: text(120),
    emergencyContactPhone: text(30),
    emergencyContactRelationship: text(60),
  })
  .strict();
export const applicationCreateInput = z
  .object({
    requestKey,
    sessionId: id,
    classId: optionalId,
    arm: text(20).transform((v) => v.toUpperCase()),
  })
  .strict();
export const applicationDraftInput = z
  .object({
    revision: z.number().int().min(1),
    sessionId: id,
    classId: optionalId,
    arm: text(20).transform((v) => v.toUpperCase()),
    student: draftStudent,
    guardians: z
      .array(draftGuardian)
      .max(6)
      .refine((v) => {
        const ids = v.map((g) => g.guardianId).filter(Boolean);
        return new Set(ids).size === ids.length;
      }, "Link each verified guardian only once"),
    receivedDocuments: z
      .array(z.string().trim().min(1).max(150))
      .max(20)
      .default([]),
  })
  .strict();
export const applicationTransitionInput = z
  .object({
    revision: z.number().int().min(1),
    status: z.enum(
      applicationStatuses.filter(
        (s) => s !== "enrolled" && s !== "awaiting_form",
      ),
    ),
    reason: z.string().trim().min(3).max(500),
  })
  .strict();
export const enrolmentInput = z
  .object({
    revision: z.number().int().min(1),
    admissionDate: day,
    classId: id,
    arm: text(20).transform((v) => v.toUpperCase()),
  })
  .strict();
export const medicalInput = z
  .object({
    revision: z.number().int().min(0),
    allergies: text(1000),
    conditions: text(1000),
    safetyInstructions: text(1000),
    emergencyName: text(120),
    emergencyPhone: text(30).refine(
      (v) =>
        !v ||
        (/^\+?[\d ()-]{7,30}$/.test(v) && v.replace(/\D/g, "").length >= 7),
      "Enter a valid emergency phone",
    ),
    emergencyRelationship: text(60),
    reason: z.string().trim().min(3).max(500),
  })
  .strict()
  .refine(
    (v) =>
      (!v.emergencyName && !v.emergencyPhone) ||
      Boolean(v.emergencyName && v.emergencyPhone),
    "Provide both emergency contact name and phone",
  );
export const applicationFilters = z
  .object({
    search: text(100),
    sessionId: optionalId,
    classId: optionalId,
    arm: text(20).transform((v) => v.toUpperCase()),
    status: z.union([z.enum(applicationStatuses), z.literal("")]).default(""),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(25),
  })
  .strict();
export const documentIssueInput = z
  .object({
    requestKey,
    type: z.enum(Object.keys(documentTypes)),
    applicationId: optionalId,
    studentId: optionalId,
    guardianId: optionalId,
    staffId: optionalId,
    administratorId: optionalId,
    sessionId: optionalId,
    prefill: z.boolean().default(false),
    includeMedical: z.boolean().default(false),
  })
  .strict();
export const documentSettingsInput = z
  .object({
    prefix: z
      .string()
      .trim()
      .toUpperCase()
      .min(2)
      .max(12)
      .regex(/^[A-Z][A-Z0-9]*$/),
    privacyNotice: z.string().trim().min(20).max(2000),
    checklist: z
      .array(z.string().trim().min(2).max(150))
      .min(1)
      .max(20)
      .refine(
        (v) => new Set(v.map((s) => s.toLowerCase())).size === v.length,
        "Checklist labels must be unique",
      ),
  })
  .strict();
