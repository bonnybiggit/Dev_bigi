import { Router } from "express";
import { z } from "zod";
import { Staff } from "../models/Staff.js";
import { TeacherAssignment } from "../models/TeacherAssignment.js";
import { TeacherAudit } from "../models/TeacherAudit.js";
import { AcademicSession } from "../models/AcademicSession.js";
import { AcademicTerm } from "../models/AcademicTerm.js";
import { SchoolClass } from "../models/SchoolClass.js";
import { Subject } from "../models/Subject.js";
import { objectId } from "../validation/academic.js";
import {
  assignmentInput,
  assignmentEditInput,
  assignmentAction,
  assignmentFilters,
  optionalPeriod,
} from "../validation/teacherAssignment.js";
import {
  createAssignments,
  editAssignment,
  deactivateAssignment,
  transferAssignment,
  copyAssignments,
  ownedAssignment,
  assignmentTeacher,
  assignmentAudit,
  revokeTeacherSessions,
} from "../services/teacherAssignments.js";
import { mutateConfiguration, fail } from "../services/schoolConfiguration.js";
const id = objectId.transform((v) => v.toLowerCase());
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function teacherAssignmentRoutes() {
  const router = Router();
  // Mounted only after school administrator authentication and password checks.
  router.use((req, _res, next) => {
    if (req.method !== "GET") z.object({}).strict().parse(req.query);
    next();
  });
  router.get("/context", async (req, res) => {
    z.object({}).strict().parse(req.query);
    const schoolId = req.user.schoolId;
    const [sessions, terms, classes, subjects] = await Promise.all([
      AcademicSession.find({ schoolId }).select("name status"),
      AcademicTerm.find({ schoolId }).select(
        "name sessionId status startDate endDate",
      ),
      SchoolClass.find({ schoolId }).select("name arms inactiveArms status"),
      Subject.find({ schoolId }).select("name classId status"),
    ]);
    res.json({ sessions, terms, classes, subjects });
  });
  router.get("/legacy-review", async (req, res) => {
    const input = z
      .object({
        search: z.string().trim().max(100).default(""),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(50).default(25),
      })
      .strict()
      .parse(req.query);
    const filter = {
      schoolId: req.user.schoolId,
      category: "teaching",
      assignmentMode: { $ne: "explicit" },
    };
    if (input.search)
      filter.$or = ["fullName", "employeeId"].map((k) => ({
        [k]: { $regex: escape(input.search), $options: "i" },
      }));
    const [staff, total, subjects] = await Promise.all([
      Staff.find(filter)
        .select(
          "fullName employeeId status classIds subjectIds attendanceGrants",
        )
        .sort({ fullName: 1, _id: 1 })
        .skip((input.page - 1) * input.limit)
        .limit(input.limit)
        .lean(),
      Staff.countDocuments(filter),
      Subject.find({ schoolId: req.user.schoolId }).select("classId").lean(),
    ]);
    res.json({
      records: staff.map((s) => ({
        ...s,
        reviewRequired: Boolean(
          s.classIds.length || s.subjectIds.length || s.attendanceGrants.length,
        ),
        issues: [
          "Legacy arrays have no confirmed academic period or arm scope. They remain in use until explicit adoption.",
          ...(s.subjectIds.some(
            (id) =>
              !subjects.some(
                (sub) =>
                  String(sub._id) === String(id) &&
                  s.classIds.some((c) => String(c) === String(sub.classId)),
              ),
          )
            ? [
                "One or more subject/class relationships are unavailable or ambiguous; review individually.",
              ]
            : []),
        ],
      })),
      total,
      page: input.page,
      limit: input.limit,
    });
  });
  router.get("/", async (req, res) => {
    const input = assignmentFilters.parse(req.query);
    const filter = { schoolId: req.user.schoolId };
    for (const field of [
      "staffId",
      "classId",
      "subjectId",
      "sessionId",
      "status",
    ])
      if (input[field]) filter[field] = input[field];
    if (input.termId) {
      const term = await AcademicTerm.findOne({
        _id: input.termId,
        schoolId: req.user.schoolId,
      });
      if (!term) fail(404, "Academic term not found.");
      if (input.sessionId && String(term.sessionId) !== input.sessionId)
        fail(400, "Term does not belong to the selected session.");
      filter.sessionId = term.sessionId;
      filter.$or = [{ termId: null }, { termId: input.termId }];
    }
    if (input.search) {
      const people = await Staff.find({
        schoolId: req.user.schoolId,
        $or: ["fullName", "employeeId"].map((k) => ({
          [k]: { $regex: escape(input.search), $options: "i" },
        })),
      }).select("_id");
      filter.$and = [{ staffId: { $in: people.map((p) => p._id) } }];
    }
    const [records, total] = await Promise.all([
      TeacherAssignment.find(filter)
        .sort({ updatedAt: -1, _id: -1 })
        .skip((input.page - 1) * input.limit)
        .limit(input.limit)
        .lean(),
      TeacherAssignment.countDocuments(filter),
    ]);
    const staff = await Staff.find({
      schoolId: req.user.schoolId,
      _id: { $in: records.map((r) => r.staffId) },
    })
      .select("fullName employeeId status attendanceGrants")
      .lean();
    res.json({
      records: records.map((r) => {
        const teacher = staff.find((s) => String(s._id) === String(r.staffId));
        return {
          ...r,
          teacherName: teacher?.fullName || "Unavailable teacher",
          employeeId: teacher?.employeeId || "",
          teacherStatus: teacher?.status,
          attendanceGrants: (teacher?.attendanceGrants || []).filter(
            (g) =>
              String(g.classId) === String(r.classId) &&
              g.arm === r.arm &&
              String(g.sessionId) === String(r.sessionId) &&
              (!g.termId || !r.termId || String(g.termId) === String(r.termId)),
          ),
          attendancePermission:
            r.status === "active" &&
            teacher?.status === "active" &&
            teacher.attendanceGrants.some(
              (g) =>
                String(g.classId) === String(r.classId) &&
                g.arm === r.arm &&
                String(g.sessionId) === String(r.sessionId) &&
                (!g.termId ||
                  !r.termId ||
                  String(g.termId) === String(r.termId)),
            ),
        };
      }),
      total,
      page: input.page,
      limit: input.limit,
    });
  });
  router.post("/", async (req, res) =>
    res.status(201).json({
      records: await createAssignments(req, assignmentInput.parse(req.body)),
    }),
  );
  router.put("/:id", async (req, res) =>
    res.json({
      record: await editAssignment(
        req,
        id.parse(req.params.id),
        assignmentEditInput.parse(req.body),
      ),
    }),
  );
  router.post("/:id/deactivate", async (req, res) =>
    res.json({
      record: await deactivateAssignment(
        req,
        id.parse(req.params.id),
        assignmentAction.parse(req.body),
      ),
    }),
  );
  router.post("/:id/transfer", async (req, res) =>
    res.json(
      await transferAssignment(
        req,
        id.parse(req.params.id),
        assignmentAction
          .extend({ staffId: id, adoptLegacy: z.boolean().default(false) })
          .parse(req.body),
      ),
    ),
  );
  router.post("/copy-period", async (req, res) => {
    const input = z
      .object({
        ids: z
          .array(id)
          .min(1)
          .max(100)
          .refine(
            (v) => new Set(v).size === v.length,
            "Select each assignment once",
          ),
        sessionId: id,
        termId: optionalPeriod,
        reason: z.string().trim().min(3).max(500),
      })
      .strict()
      .parse(req.body);
    res.status(201).json({ records: await copyAssignments(req, input) });
  });
  router.post("/attendance", async (req, res) => {
    const input = z
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
        enabled: z.boolean(),
        reason: z.string().trim().min(3).max(500),
      })
      .strict()
      .parse(req.body);
    await mutateConfiguration(req.user.schoolId, async (transaction) => {
      const staff = await assignmentTeacher(
        req,
        input.staffId,
        transaction,
        false,
        input.reason,
      );
      const matching = (g) =>
        String(g.classId) === input.classId &&
        g.arm === input.arm &&
        String(g.sessionId) === input.sessionId &&
        String(g.termId || "") === (input.termId || "");
      const before = staff.attendanceGrants.toObject();
      if (input.enabled) {
        const [c, session, term, assignment] = await Promise.all([
          SchoolClass.findOne({
            schoolId: req.user.schoolId,
            _id: input.classId,
            status: "active",
          }).session(transaction),
          AcademicSession.exists({
            schoolId: req.user.schoolId,
            _id: input.sessionId,
          }).session(transaction),
          input.termId
            ? AcademicTerm.exists({
                schoolId: req.user.schoolId,
                _id: input.termId,
                sessionId: input.sessionId,
              }).session(transaction)
            : Promise.resolve(true),
          TeacherAssignment.exists({
            schoolId: req.user.schoolId,
            staffId: staff._id,
            classId: input.classId,
            arm: input.arm,
            sessionId: input.sessionId,
            status: "active",
            ...(input.termId
              ? { $or: [{ termId: null }, { termId: input.termId }] }
              : { termId: null }),
          }).session(transaction),
        ]);
        if (
          !c ||
          !session ||
          !term ||
          !assignment ||
          (c.arms.length ? !c.arms.includes(input.arm) : !!input.arm) ||
          c.inactiveArms.includes(input.arm)
        )
          fail(
            400,
            "Attendance grants require a valid assigned class, arm and matching academic period.",
          );
        if (staff.attendanceGrants.some(matching))
          fail(409, "Attendance permission already exists.");
        staff.attendanceGrants.push({
          classId: input.classId,
          arm: input.arm,
          sessionId: input.sessionId,
          termId: input.termId,
        });
      } else
        staff.attendanceGrants = staff.attendanceGrants.filter(
          (g) => !matching(g),
        );
      staff.updatedBy = req.user._id;
      await staff.save({ session: transaction });
      await assignmentAudit(
        req,
        staff._id,
        undefined,
        "attendance_grants_updated",
        before,
        staff.attendanceGrants.toObject(),
        input.reason,
        transaction,
      );
      await revokeTeacherSessions(req.user.schoolId, [staff._id], transaction);
    });
    res.json({
      message: "Attendance permission updated. Teacher must sign in again.",
    });
  });
  router.get("/:id/history", async (req, res) => {
    const input = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(50).default(25),
      })
      .strict()
      .parse(req.query);
    const record = await ownedAssignment(req, id.parse(req.params.id));
    const filter = { schoolId: req.user.schoolId, assignmentId: record._id };
    const [records, total] = await Promise.all([
      TeacherAudit.find(filter)
        .select("-schoolId -__v")
        .populate({
          path: "actorId",
          model: "User",
          select: "name",
          match: { schoolId: req.user.schoolId },
        })
        .sort({ createdAt: -1, _id: -1 })
        .skip((input.page - 1) * input.limit)
        .limit(input.limit),
      TeacherAudit.countDocuments(filter),
    ]);
    res.json({ records, total, page: input.page, limit: input.limit });
  });
  router.delete("/:id", async (req, res) => {
    await ownedAssignment(req, id.parse(req.params.id));
    res.status(405).json({
      message:
        "Assignments are retained. Use the audited deactivate or transfer action.",
    });
  });
  return router;
}
