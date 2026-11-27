import { Router } from "express";
import { z } from "zod";
import { School } from "../models/School.js";
import { AcademicSession } from "../models/AcademicSession.js";
import { AcademicTerm } from "../models/AcademicTerm.js";
import { SchoolClass } from "../models/SchoolClass.js";
import { Subject } from "../models/Subject.js";
import { Student } from "../models/Student.js";
import { Attendance } from "../models/Attendance.js";
import { Examination } from "../models/Examination.js";
import { Result } from "../models/Result.js";
import {
  objectId,
  profileInput,
  sessionInput,
  termInput,
  classInput,
  subjectInput,
  activationInput,
  statusInput,
} from "../validation/academic.js";
import { mutateConfiguration, fail } from "../services/schoolConfiguration.js";
import { SchoolLogo } from "../models/SchoolLogo.js";
import {
  decodeLogo,
  logoInput,
  validateLogoOwner,
} from "../services/branding.js";
import { rateLimit } from "express-rate-limit";

const collation = { locale: "en", strength: 2 };
const scope = (req) => ({ schoolId: req.user.schoolId });
async function owned(Model, id, schoolId, session) {
  const record = await Model.findOne({ _id: id, schoolId }).session(
    session || null,
  );
  if (!record) fail(404, "Record not found.");
  return record;
}
const schoolProfile = (school) =>
  Object.fromEntries(
    [
      "name",
      "address",
      "city",
      "country",
      "phone",
      "email",
      "schoolType",
      "logoUrl",
    ].map((key) => [key, school[key] || ""]),
  );
async function uniqueName(Model, filter, id, session) {
  if (
    await Model.exists({ ...filter, ...(id ? { _id: { $ne: id } } : {}) })
      .collation(collation)
      .session(session)
  )
    fail(409, "A record with this name already exists here.");
}
const overlap = (input, id) => ({
  ...(id ? { _id: { $ne: id } } : {}),
  startDate: { $lte: new Date(input.endDate) },
  endDate: { $gte: new Date(input.startDate) },
});

export function schoolConfigurationRoutes() {
  const router = Router();
  router.use((req, _res, next) => {
    z.object({}).strict().parse(req.query);
    next();
  });
  router.get("/profile", async (req, res) =>
    res.json({ profile: schoolProfile(req.school) }),
  );
  router.put("/profile", async (req, res) => {
    const input = profileInput.parse(req.body);
    const profile = await mutateConfiguration(
      req.user.schoolId,
      async (session) => {
        await validateLogoOwner(input.logoUrl, req.user.schoolId, session);
        return schoolProfile(
          await School.findOneAndUpdate(
            { _id: req.user.schoolId },
            { $set: input },
            { new: true, runValidators: true, session },
          ),
        );
      },
    );
    res.json({ profile });
  });
  router.post(
    "/profile/logo",
    rateLimit({ windowMs: 15 * 60 * 1000, limit: 20 }),
    async (req, res) => {
      const input = logoInput.parse(req.body),
        data = decodeLogo(input);
      const profile = await mutateConfiguration(
        req.user.schoolId,
        async (session) => {
          const [logo] = await SchoolLogo.create(
            [
              {
                schoolId: req.user.schoolId,
                contentType: input.contentType,
                data,
              },
            ],
            { session },
          );
          const school = await School.findOneAndUpdate(
            { _id: req.user.schoolId },
            {
              $set: {
                logoUrl: `/api/branding/schools/${req.user.schoolId}/logos/${logo.id}`,
              },
            },
            { new: true, runValidators: true, session },
          );
          return schoolProfile(school);
        },
      );
      res.status(201).json({ profile });
    },
  );

  router.get("/sessions", async (req, res) =>
    res.json({
      records: await AcademicSession.find(scope(req)).sort({ startDate: -1 }),
    }),
  );
  const saveSession = (editing) => async (req, res) => {
    const input = sessionInput.parse(req.body),
      id = editing ? objectId.parse(req.params.id) : null;
    const record = await mutateConfiguration(
      req.user.schoolId,
      async (session) => {
        const existing = id
          ? await owned(AcademicSession, id, req.user.schoolId, session)
          : null;
        await uniqueName(
          AcademicSession,
          { ...scope(req), name: input.name },
          id,
          session,
        );
        if (
          await AcademicSession.exists({
            ...scope(req),
            ...overlap(input, id),
          }).session(session)
        )
          fail(409, "Academic session dates overlap an existing session.");
        if (
          id &&
          (await AcademicTerm.exists({
            ...scope(req),
            sessionId: id,
            $or: [
              { startDate: { $lt: new Date(input.startDate) } },
              { endDate: { $gt: new Date(input.endDate) } },
            ],
          }).session(session))
        )
          fail(409, "Session dates must contain every existing term.");
        if (existing) {
          Object.assign(existing, input);
          return existing.save({ session });
        }
        return (
          await AcademicSession.create([{ ...input, ...scope(req) }], {
            session,
          })
        )[0];
      },
    );
    res.status(editing ? 200 : 201).json({ record });
  };
  router.post("/sessions", saveSession(false));
  router.put("/sessions/:id", saveSession(true));

  router.get("/terms", async (req, res) =>
    res.json({
      records: await AcademicTerm.find(scope(req)).sort({ startDate: -1 }),
    }),
  );
  const saveTerm = (editing) => async (req, res) => {
    const input = termInput.parse(req.body),
      id = editing ? objectId.parse(req.params.id) : null;
    const record = await mutateConfiguration(
      req.user.schoolId,
      async (session) => {
        const existing = id
          ? await owned(AcademicTerm, id, req.user.schoolId, session)
          : null;
        if (existing && String(existing.sessionId) !== input.sessionId)
          fail(400, "A term cannot be moved to another session.");
        const parent = await owned(
          AcademicSession,
          input.sessionId,
          req.user.schoolId,
          session,
        );
        if (
          new Date(input.startDate) < parent.startDate ||
          new Date(input.endDate) > parent.endDate
        )
          fail(400, "Term dates must fall within the academic session.");
        await uniqueName(
          AcademicTerm,
          { ...scope(req), sessionId: input.sessionId, name: input.name },
          id,
          session,
        );
        if (
          await AcademicTerm.exists({
            ...scope(req),
            sessionId: input.sessionId,
            ...overlap(input, id),
          }).session(session)
        )
          fail(409, "Term dates overlap another term in this session.");
        if (existing) {
          Object.assign(existing, input);
          return existing.save({ session });
        }
        return (
          await AcademicTerm.create([{ ...input, ...scope(req) }], { session })
        )[0];
      },
    );
    res.status(editing ? 200 : 201).json({ record });
  };
  router.post("/terms", saveTerm(false));
  router.put("/terms/:id", saveTerm(true));

  for (const [path, Model] of [
    ["sessions", AcademicSession],
    ["terms", AcademicTerm],
  ]) {
    router.patch(`/${path}/:id/status`, async (req, res) => {
      const id = objectId.parse(req.params.id),
        input = activationInput.parse(req.body);
      const record = await mutateConfiguration(
        req.user.schoolId,
        async (session) => {
          const record = await owned(Model, id, req.user.schoolId, session);
          const group = {
            ...scope(req),
            ...(path === "terms" ? { sessionId: record.sessionId } : {}),
          };
          if (path === "terms")
            await owned(
              AcademicSession,
              record.sessionId,
              req.user.schoolId,
              session,
            );
          if (input.status === "active") {
            const other = await Model.findOne({
              ...group,
              _id: { $ne: id },
              status: "active",
            }).session(session);
            if (other && !input.confirmSwitch)
              fail(
                409,
                `Another ${path === "terms" ? "term" : "session"} is active. Confirm replacement before continuing.`,
                "ACTIVE_REPLACEMENT_REQUIRED",
              );
            if (other) {
              other.status = "inactive";
              await other.save({ session });
            }
          }
          record.status = input.status;
          return record.save({ session });
        },
      );
      res.json({ record });
    });
  }

  for (const [path, Model, schema] of [
    ["classes", SchoolClass, classInput],
    ["subjects", Subject, subjectInput],
  ]) {
    router.get(`/${path}`, async (req, res) =>
      res.json({ records: await Model.find(scope(req)).sort({ name: 1 }) }),
    );
    const save = (editing) => async (req, res) => {
      const input = schema.parse(req.body),
        id = editing ? objectId.parse(req.params.id) : null;
      const record = await mutateConfiguration(
        req.user.schoolId,
        async (session) => {
          const existing = id
            ? await owned(Model, id, req.user.schoolId, session)
            : null;
          if (path === "classes") {
            const usedExams = await Examination.find({
              ...scope(req),
              classId: id,
            })
              .select("_id")
              .session(session);
            input.inactiveArms ??= (existing?.inactiveArms || []).filter(
              (arm) => input.arms.includes(arm),
            );
            const removedArms = (existing?.arms || []).filter(
              (arm) => !input.arms.includes(arm),
            );
            if (
              removedArms.length &&
              ((await Student.exists({
                ...scope(req),
                classId: id,
                arm: { $in: removedArms },
              }).session(session)) ||
                (await Attendance.exists({
                  ...scope(req),
                  kind: "student",
                  classId: id,
                  arm: { $in: removedArms },
                }).session(session)) ||
                (await Result.exists({
                  ...scope(req),
                  examinationId: { $in: usedExams.map((exam) => exam._id) },
                  arm: { $in: removedArms },
                }).session(session)))
            )
              fail(
                409,
                "An arm has student records. Keep the arm and mark it inactive instead of removing it.",
              );
          }
          if (path === "subjects") {
            const parent = await owned(
              SchoolClass,
              input.classId,
              req.user.schoolId,
              session,
            );
            if (parent.status !== "active")
              fail(409, "Select an active class for this subject.");
          }
          await uniqueName(
            Model,
            {
              ...scope(req),
              name: input.name,
              ...(path === "subjects" ? { classId: input.classId } : {}),
            },
            id,
            session,
          );
          if (existing) {
            Object.assign(existing, input);
            return existing.save({ session });
          }
          return (
            await Model.create([{ ...input, ...scope(req) }], { session })
          )[0];
        },
      );
      res.status(editing ? 200 : 201).json({ record });
    };
    router.post(`/${path}`, save(false));
    router.put(`/${path}/:id`, save(true));
    router.patch(`/${path}/:id/status`, async (req, res) => {
      const id = objectId.parse(req.params.id),
        input = statusInput.parse(req.body);
      const record = await mutateConfiguration(
        req.user.schoolId,
        async (session) => {
          const record = await owned(Model, id, req.user.schoolId, session);
          if (path === "subjects" && input.status === "active") {
            const parent = await owned(
              SchoolClass,
              record.classId,
              req.user.schoolId,
              session,
            );
            if (parent.status !== "active")
              fail(409, "Reactivate the class before activating this subject.");
          }
          record.status = input.status;
          return record.save({ session });
        },
      );
      res.json({ record });
    });
    router.delete(`/${path}/:id`, async (req, res) => {
      await owned(Model, objectId.parse(req.params.id), req.user.schoolId);
      res.status(405).set("Allow", "GET, PUT, PATCH").json({
        message:
          "Deletion is disabled to preserve linked records. Deactivate this record instead.",
      });
    });
  }
  return router;
}
