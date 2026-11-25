import {
  assignmentStudentScope,
  attendancePermitted,
} from "../services/teacherAccess.js";
import {
  explicitTeacherContext,
  explicitTeacherDashboard,
} from "../services/teacherWorkspace.js";
import { reportRange } from "../services/attendance.js";
import { reportInput } from "../validation/attendance.js";
import { Router } from "express";
import { z } from "zod";
import {
  authenticate,
  requireRole,
  requirePasswordChanged,
} from "../middleware/auth.js";
import { SchoolClass } from "../models/SchoolClass.js";
import { Subject } from "../models/Subject.js";
import { Student } from "../models/Student.js";
import { Staff } from "../models/Staff.js";
import { User } from "../models/User.js";
import { TeacherAudit } from "../models/TeacherAudit.js";
import { AcademicSession } from "../models/AcademicSession.js";
import { AcademicTerm } from "../models/AcademicTerm.js";
import { Attendance } from "../models/Attendance.js";
import { Examination } from "../models/Examination.js";
import { Result } from "../models/Result.js";
import { attendanceRoutes } from "./attendance.js";
import { fail, mutateConfiguration } from "../services/schoolConfiguration.js";
import { objectId } from "../validation/academic.js";
const studentFields =
  "firstName middleName lastName admissionNumber classId arm sessionId status";
export function teacherRoutes(config) {
  const router = Router();
  router.use(
    authenticate(config),
    requireRole("teacher"),
    requirePasswordChanged,
  );
  router.get("/context", async (req, res) => {
    if (req.teacherAccess) return res.json(await explicitTeacherContext(req));
    const schoolId = req.user.schoolId;
    const [classes, subjects, sessions, terms] = await Promise.all([
      SchoolClass.find({ schoolId, _id: { $in: req.teacher.classIds } }).select(
        "name arms inactiveArms status",
      ),
      Subject.find({
        schoolId,
        _id: { $in: req.teacher.subjectIds },
        classId: { $in: req.teacher.classIds },
      }).select("name classId status"),
      AcademicSession.find({ schoolId }).select(
        "name status startDate endDate",
      ),
      AcademicTerm.find({ schoolId }).select("name sessionId status"),
    ]);
    const counts = await Student.aggregate([
      {
        $match: {
          schoolId,
          classId: { $in: classes.map((c) => c._id) },
          status: "active",
        },
      },
      { $group: { _id: "$classId", count: { $sum: 1 } } },
    ]);
    res.json({
      school: { name: req.school.name, logo: req.school.logoUrl || "" },
      assignmentMode: "legacy",
      classes: classes.map((c) => ({
        ...c.toObject(),
        studentCount: counts.find((v) => String(v._id) === c.id)?.count || 0,
      })),
      subjects,
      sessions,
      terms,
      attendanceGrants: req.teacher.attendanceGrants.filter((g) =>
        classes.some((c) => c.id === String(g.classId)),
      ),
    });
  });
  router.get("/dashboard", async (req, res) => {
    if (req.teacherAccess) return res.json(await explicitTeacherDashboard(req));
    const schoolId = req.user.schoolId;
    const subjects = await Subject.find({
      schoolId,
      _id: { $in: req.teacher.subjectIds },
      classId: { $in: req.teacher.classIds },
    });
    const exams = await Examination.find({
      schoolId,
      $or: subjects
        .map((s) => ({ classId: s.classId, "subjects.subjectId": s._id }))
        .concat([{ _id: null }]),
    })
      .select("name className status updatedAt")
      .sort({ updatedAt: -1 });
    const attendanceScope = {
      schoolId,
      kind: "student",
      $or: req.teacher.attendanceGrants
        .filter((g) =>
          req.teacher.classIds.some((id) => String(id) === String(g.classId)),
        )
        .map((g) => ({ classId: g.classId, arm: g.arm }))
        .concat([{ _id: null }]),
    };
    const [students, attendance, results, classes] = await Promise.all([
      Student.countDocuments({
        schoolId,
        classId: { $in: req.teacher.classIds },
        status: "active",
      }),
      Attendance.aggregate([
        { $match: attendanceScope },
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      Result.countDocuments({
        schoolId,
        examinationId: { $in: exams.map((e) => e._id) },
        subjectId: { $in: subjects.map((s) => s._id) },
      }),
      SchoolClass.countDocuments({
        schoolId,
        _id: { $in: req.teacher.classIds },
      }),
    ]);
    res.json({
      stats: {
        classes,
        subjects: subjects.length,
        students,
        examinations: exams.length,
        results,
      },
      attendance,
      recent: exams.slice(0, 8),
    });
  });
  router.get("/students", async (req, res) => {
    const input = z
      .object({
        search: z.string().trim().max(100).default(""),
        classId: objectId.optional(),
        arm: z
          .string()
          .trim()
          .max(20)
          .transform((v) => v.toUpperCase())
          .optional(),
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(50).default(25),
      })
      .strict()
      .parse(req.query);
    if (
      input.classId &&
      !(
        req.teacherAccess
          ? req.teacherAccess.current.map((r) => r.classId)
          : req.teacher.classIds
      ).some((id) => String(id) === input.classId)
    )
      fail(403, "Class is not assigned to you.");
    const filter = {
      schoolId: req.user.schoolId,
      ...(req.teacherAccess
        ? { status: "active", ...assignmentStudentScope(req.teacherAccess) }
        : { classId: { $in: req.teacher.classIds } }),
      ...(input.classId ? { classId: input.classId } : {}),
      ...(input.arm !== undefined ? { arm: input.arm } : {}),
    };
    if (
      req.teacherAccess &&
      input.arm !== undefined &&
      !req.teacherAccess.current.some(
        (r) =>
          r.arm === input.arm &&
          (!input.classId || String(r.classId) === input.classId),
      )
    )
      fail(403, "This class arm is not assigned to you.");
    if (input.search) {
      filter.$and = [
        {
          $or: ["firstName", "middleName", "lastName", "admissionNumber"].map(
            (field) => ({
              [field]: {
                $regex: input.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
                $options: "i",
              },
            }),
          ),
        },
      ];
    }
    const [records, total] = await Promise.all([
      Student.find(filter)
        .select(studentFields)
        .sort({ lastName: 1, _id: 1 })
        .skip((input.page - 1) * input.limit)
        .limit(input.limit),
      Student.countDocuments(filter),
    ]);
    res.json({ records, total, page: input.page, limit: input.limit });
  });
  router.get("/students/:id", async (req, res) => {
    const record = await Student.findOne({
      _id: objectId.parse(req.params.id),
      schoolId: req.user.schoolId,
      ...(req.teacherAccess
        ? { status: "active", ...assignmentStudentScope(req.teacherAccess) }
        : { classId: { $in: req.teacher.classIds } }),
    }).select(studentFields);
    if (!record) fail(404, "Student not found.");
    res.json({ record });
  });
  router.get("/profile", (req, res) => {
    const {
      fullName,
      employeeId,
      email,
      phone,
      designation,
      department,
      status,
    } = req.teacher;
    res.json({
      record: {
        fullName,
        employeeId,
        email,
        phone,
        designation,
        department,
        status,
        accountStatus: req.user.isActive ? "active" : "inactive",
      },
    });
  });
  router.patch("/profile", async (req, res) => {
    const input = z
      .object({
        phone: z
          .string()
          .trim()
          .min(7)
          .max(30)
          .regex(/^\+?[\d ()-]+$/),
      })
      .strict()
      .parse(req.body);
    await mutateConfiguration(req.user.schoolId, async (session) => {
      const staff = await Staff.findOne({
        _id: req.teacher._id,
        schoolId: req.user.schoolId,
        status: "active",
      }).session(session);
      if (!staff) fail(403, "Teacher access changed.");
      await TeacherAudit.create(
        [
          {
            schoolId: req.user.schoolId,
            staffId: staff._id,
            actorId: req.user._id,
            action: "contact_updated",
            before: { phone: staff.phone },
            after: input,
          },
        ],
        { session },
      );
      staff.phone = input.phone;
      staff.updatedBy = req.user._id;
      await staff.save({ session });
      await User.updateOne(
        { _id: req.user._id },
        { $set: { phone: input.phone } },
        { session },
      );
    });
    res.json({ message: "Contact information updated." });
  });
  router.use(
    "/attendance",
    async (req, _res, next) => {
      // Every reused attendance endpoint must resolve one explicitly granted placement.
      let input = req.method === "PUT" ? req.body : req.query;
      if (req.path.startsWith("/records/")) {
        const record = await Attendance.findOne({
          _id: objectId.parse(req.path.split("/")[2]),
          schoolId: req.user.schoolId,
          kind: "student",
        });
        if (!record) fail(404, "Attendance record not found.");
        input = record;
      }
      let range = null;
      if (req.path === "/reports" || req.path.includes("/history/")) {
        const kind =
          req.path === "/reports" ? input.kind : req.path.split("/")[1];
        const personId = req.path.includes("/history/")
          ? req.path.split("/")[3]
          : input.personId;
        range = reportRange(
          reportInput.parse({
            ...input,
            kind,
            ...(personId ? { personId } : {}),
          }),
        );
      }
      if (
        req.path.startsWith("/staff") ||
        input.kind === "staff" ||
        !attendancePermitted(req.teacher, req.teacherAccess, input, range)
      )
        fail(
          403,
          "Attendance requires an explicit class, arm and academic period grant.",
        );
      next();
    },
    attendanceRoutes(),
  );
  return router;
}
