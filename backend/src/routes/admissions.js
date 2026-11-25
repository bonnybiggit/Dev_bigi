import { Router } from "express";
import { z } from "zod";
import { School } from "../models/School.js";
import { Student } from "../models/Student.js";
import { Guardian } from "../models/Guardian.js";
import { StudentGuardian } from "../models/StudentGuardian.js";
import { AcademicSession } from "../models/AcademicSession.js";
import { SchoolClass } from "../models/SchoolClass.js";
import {
  AdmissionApplication,
  AdmissionAudit,
  IssuedDocument,
  applicationStatuses,
} from "../models/Admissions.js";
import {
  applicationCreateInput,
  applicationDraftInput,
  applicationTransitionInput,
  enrolmentInput,
  applicationFilters,
  medicalInput,
  documentIssueInput,
  documentSettingsInput,
} from "../validation/admissions.js";
import { objectId } from "../validation/academic.js";
import {
  createApplication,
  updateApplication,
  transitionApplication,
  enrolApplication,
  ownedApplication,
  applicationView,
  transitions,
  getMedical,
  saveMedical,
} from "../services/admissions.js";
import {
  issueDocument,
  ownedDocument,
  preparePrint,
  blankDocument,
  documentSettings,
} from "../services/documents.js";
import { admissionsAudit } from "../services/admissionCommon.js";
import { documentTypes } from "../services/documentTypes.js";
import { mutateConfiguration, fail } from "../services/schoolConfiguration.js";
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const paging = z
  .object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(25),
  })
  .strict();
const documentView = (document) => {
  const value = document.toObject ? document.toObject() : { ...document };
  delete value.fingerprint;
  delete value.requestKey;
  delete value.__v;
  return value;
};
export function admissionsRoutes() {
  const router = Router();
  router.use((req, _res, next) => {
    if (req.method !== "GET") z.object({}).strict().parse(req.query);
    next();
  });
  router.get("/applications/options", async (req, res) => {
    z.object({}).strict().parse(req.query);
    const [sessions, classes] = await Promise.all([
      AcademicSession.find({ schoolId: req.user.schoolId }).select(
        "name status",
      ),
      SchoolClass.find({ schoolId: req.user.schoolId }).select(
        "name arms inactiveArms status",
      ),
    ]);
    res.json({ sessions, classes, statuses: applicationStatuses, transitions });
  });
  router.get("/applications/dashboard", async (req, res) => {
    z.object({}).strict().parse(req.query);
    const groups = await AdmissionApplication.aggregate([
      { $match: { schoolId: req.user.schoolId } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);
    const stats = Object.fromEntries(applicationStatuses.map((s) => [s, 0]));
    for (const g of groups) stats[g._id] = g.count;
    stats.total = groups.reduce((sum, g) => sum + g.count, 0);
    stats.withdrawnOrCancelled = stats.withdrawn + stats.cancelled;
    res.json({ stats });
  });
  router.get("/applications", async (req, res) => {
    const input = applicationFilters.parse(req.query),
      schoolId = req.user.schoolId,
      filter = { schoolId };
    for (const field of ["sessionId", "classId", "arm", "status"])
      if (input[field]) filter[field] = input[field];
    if (input.search) {
      const regex = { $regex: escape(input.search), $options: "i" };
      const [students, guardians] = await Promise.all([
        Student.find({
          schoolId,
          $or: [
            "admissionNumber",
            "applicationReference",
            "firstName",
            "middleName",
            "lastName",
          ].map((k) => ({ [k]: regex })),
        }).select("_id"),
        Guardian.find({
          schoolId,
          $or: ["fullName", "primaryPhone", "alternativePhone"].map((k) => ({
            [k]: regex,
          })),
        }).select("_id"),
      ]);
      const links = await StudentGuardian.find({
        schoolId,
        guardianId: { $in: guardians.map((g) => g._id) },
        isActive: true,
      }).select("studentId");
      filter.$or = [
        "reference",
        "student.firstName",
        "student.middleName",
        "student.lastName",
        "guardians.fullName",
        "guardians.primaryPhone",
        "guardians.alternativePhone",
      ].map((k) => ({ [k]: regex }));
      filter.$or.push({
        $expr: {
          $regexMatch: {
            input: {
              $concat: [
                { $ifNull: ["$student.firstName", ""] },
                " ",
                { $ifNull: ["$student.lastName", ""] },
              ],
            },
            regex: escape(input.search),
            options: "i",
          },
        },
      });
      filter.$or.push(
        { guardianIds: { $in: guardians.map((g) => g._id) } },
        {
          "guardians.guardianId": {
            $in: guardians.flatMap((g) => [g._id, g.id]),
          },
        },
        {
          studentId: {
            $in: [
              ...students.map((s) => s._id),
              ...links.map((l) => l.studentId),
            ],
          },
        },
      );
    }
    const [records, total] = await Promise.all([
      AdmissionApplication.find(filter)
        .select(
          "reference status student.firstName student.middleName student.lastName sessionId classId arm studentId documentId revision createdAt updatedAt",
        )
        .sort({ createdAt: -1, _id: -1 })
        .skip((input.page - 1) * input.limit)
        .limit(input.limit),
      AdmissionApplication.countDocuments(filter),
    ]);
    res.json({ records, total, page: input.page, limit: input.limit });
  });
  router.post("/applications", async (req, res) => {
    const result = await createApplication(
      req,
      applicationCreateInput.parse(req.body),
    );
    res.status(result.reused ? 200 : 201).json(result);
  });
  router.get("/applications/:id", async (req, res) => {
    z.object({}).strict().parse(req.query);
    const app = await ownedApplication(req, objectId.parse(req.params.id));
    const student = app.studentId
      ? await Student.findOne({
          _id: app.studentId,
          schoolId: req.user.schoolId,
        }).select("admissionNumber firstName lastName")
      : null;
    res.json({ application: applicationView(app), student });
  });
  router.put("/applications/:id", async (req, res) =>
    res.json({
      application: await updateApplication(
        req,
        objectId.parse(req.params.id),
        applicationDraftInput.parse(req.body),
      ),
    }),
  );
  router.post("/applications/:id/status", async (req, res) =>
    res.json({
      application: await transitionApplication(
        req,
        objectId.parse(req.params.id),
        applicationTransitionInput.parse(req.body),
      ),
    }),
  );
  router.post("/applications/:id/enrol", async (req, res) => {
    const result = await enrolApplication(
      req,
      objectId.parse(req.params.id),
      enrolmentInput.parse(req.body),
    );
    res.status(result.reused ? 200 : 201).json(result);
  });
  router.get("/applications/:id/history", async (req, res) => {
    const input = paging.parse(req.query);
    const app = await ownedApplication(req, objectId.parse(req.params.id));
    const filter = { schoolId: req.user.schoolId, applicationId: app._id };
    const [records, total] = await Promise.all([
      AdmissionAudit.find(filter)
        .select("-schoolId -__v")
        .populate({
          path: "actorId",
          select: "name",
          match: { schoolId: req.user.schoolId },
        })
        .sort({ createdAt: -1, _id: -1 })
        .skip((input.page - 1) * input.limit)
        .limit(input.limit),
      AdmissionAudit.countDocuments(filter),
    ]);
    res.json({ records, total, page: input.page, limit: input.limit });
  });
  router.delete("/applications/:id", async (req, res) => {
    await ownedApplication(req, objectId.parse(req.params.id));
    res.status(405).json({
      message:
        "Applications and references are retained. Use an audited cancellation or withdrawal.",
    });
  });
  for (const [path, kind] of [
    ["/applications/:id/medical", "application"],
    ["/forms/students/:id/medical", "student"],
  ]) {
    router.get(path, async (req, res) => {
      z.object({}).strict().parse(req.query);
      res.json({
        record: await getMedical(req, kind, objectId.parse(req.params.id)),
      });
    });
    router.put(path, async (req, res) =>
      res.json({
        record: await saveMedical(
          req,
          kind,
          objectId.parse(req.params.id),
          medicalInput.parse(req.body),
        ),
      }),
    );
  }
  router.get("/forms/catalog", (req, res) => {
    z.object({}).strict().parse(req.query);
    res.json({
      types: Object.entries(documentTypes).map(([type, data]) => ({
        type,
        ...data,
        templateVersion: 1,
      })),
      settings: documentSettings(req.school),
    });
  });
  router.put("/forms/settings", async (req, res) => {
    const input = documentSettingsInput.parse(req.body);
    await mutateConfiguration(req.user.schoolId, async (session) => {
      const school = await School.findOne({ _id: req.user.schoolId }).session(
          session,
        ),
        before = documentSettings(school);
      school.set({
        documentPrefix: input.prefix,
        admissionPrivacyNotice: input.privacyNotice,
        applicationChecklist: input.checklist,
      });
      await school.save({ session });
      await admissionsAudit(
        req,
        "document_settings_updated",
        {},
        { before, after: input },
        "School numbering and application form settings updated",
        session,
      );
    });
    res.json({ settings: input });
  });
  router.get("/forms/templates/:type", (req, res) => {
    z.object({}).strict().parse(req.query);
    const type = z.enum(Object.keys(documentTypes)).parse(req.params.type);
    res.json({
      document: {
        type,
        templateVersion: 1,
        generic: true,
        snapshot: blankDocument(req.school),
      },
    });
  });
  router.get("/documents", async (req, res) => {
    const input = paging
      .extend({
        search: z.string().trim().max(100).default(""),
        type: z
          .union([z.enum(Object.keys(documentTypes)), z.literal("")])
          .default(""),
      })
      .parse(req.query);
    const filter = {
      schoolId: req.user.schoolId,
      ...(input.type ? { type: input.type } : {}),
    };
    if (input.search)
      filter.reference = { $regex: escape(input.search), $options: "i" };
    const [records, total] = await Promise.all([
      IssuedDocument.find(filter)
        .select(
          "reference type templateVersion status printRequests revision applicationId studentId createdAt issuedBy",
        )
        .populate({
          path: "issuedBy",
          select: "name",
          match: { schoolId: req.user.schoolId },
        })
        .sort({ createdAt: -1, _id: -1 })
        .skip((input.page - 1) * input.limit)
        .limit(input.limit),
      IssuedDocument.countDocuments(filter),
    ]);
    res.json({ records, total, page: input.page, limit: input.limit });
  });
  router.post("/documents", async (req, res) => {
    const result = await issueDocument(req, documentIssueInput.parse(req.body));
    res
      .status(result.reused ? 200 : 201)
      .json({ ...result, document: documentView(result.document) });
  });
  router.get("/documents/:id", async (req, res) => {
    z.object({}).strict().parse(req.query);
    const document = await ownedDocument(req, objectId.parse(req.params.id));
    const application = document.applicationId
      ? await AdmissionApplication.findOne({
          _id: document.applicationId,
          schoolId: req.user.schoolId,
        }).select("status")
      : null;
    res.json({
      document: {
        ...documentView(document),
        applicationStatus: application?.status,
      },
    });
  });
  router.post("/documents/:id/prepare-print", async (req, res) => {
    const input = z
      .object({
        prefill: z.boolean().default(false),
        includeMedical: z.boolean().default(false),
      })
      .strict()
      .parse(req.body || {});
    const result = await preparePrint(
      req,
      objectId.parse(req.params.id),
      input,
    );
    res.json({ ...result, document: documentView(result.document) });
  });
  router.post("/documents/:id/cancel", async (req, res) => {
    const input = z
      .object({
        revision: z.number().int().min(1),
        reason: z.string().trim().min(3).max(500),
      })
      .strict()
      .parse(req.body);
    await mutateConfiguration(req.user.schoolId, async (session) => {
      const document = await ownedDocument(
        req,
        objectId.parse(req.params.id),
        session,
      );
      if (document.applicationId && document.type === "student_application")
        fail(409, "Cancel the linked application through its workflow.");
      if (
        document.revision !== input.revision ||
        document.status === "cancelled"
      )
        fail(409, "Document changed or is already cancelled.");
      document.status = "cancelled";
      document.revision++;
      await document.save({ session });
      await admissionsAudit(
        req,
        "document_cancelled",
        { documentId: document._id },
        { reference: document.reference },
        input.reason,
        session,
      );
    });
    res.json({
      message:
        "Document cancelled. Its reference remains permanently reserved.",
    });
  });
  router.get("/documents/:id/history", async (req, res) => {
    const input = paging.parse(req.query);
    const doc = await ownedDocument(req, objectId.parse(req.params.id));
    const filter = { schoolId: req.user.schoolId, documentId: doc._id };
    const [records, total] = await Promise.all([
      AdmissionAudit.find(filter)
        .select("-schoolId -__v")
        .populate({
          path: "actorId",
          select: "name",
          match: { schoolId: req.user.schoolId },
        })
        .sort({ createdAt: -1, _id: -1 })
        .skip((input.page - 1) * input.limit)
        .limit(input.limit),
      AdmissionAudit.countDocuments(filter),
    ]);
    res.json({ records, total, page: input.page, limit: input.limit });
  });
  return router;
}
