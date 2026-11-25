import { Router } from "express";
import { AdmissionApplication } from "../models/Admissions.js";
import { Guardian } from "../models/Guardian.js";
import { StudentGuardian } from "../models/StudentGuardian.js";
import { User } from "../models/User.js";
import { z } from "zod";
import { Student } from "../models/Student.js";
import { AcademicSession } from "../models/AcademicSession.js";
import { SchoolClass } from "../models/SchoolClass.js";
import { objectId } from "../validation/academic.js";
import {
  studentInput,
  studentListInput,
  studentStatus,
} from "../validation/student.js";
import {
  ownedStudent,
  saveStudent,
  studentDetails,
  studentListFields,
  validatePlacement,
} from "../services/student.js";
import { mutateConfiguration, fail } from "../services/schoolConfiguration.js";
import { relatedRecords } from "../services/guardian.js";
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function studentRoutes() {
  const router = Router();
  router.get("/", async (req, res) => {
    const input = studentListInput.parse(req.query),
      schoolId = req.user.schoolId;
    if (
      input.sessionId &&
      !(await AcademicSession.exists({ _id: input.sessionId, schoolId }))
    )
      fail(400, "Session filter is unavailable in your school.");
    const selectedClass = input.classId
      ? await SchoolClass.findOne({ _id: input.classId, schoolId })
      : null;
    if (input.classId && !selectedClass)
      fail(400, "Class filter is unavailable in your school.");
    if (
      input.arm &&
      (!selectedClass || !selectedClass.arms.includes(input.arm))
    )
      fail(400, "Select a class and one of its arms to filter by arm.");
    const filter = { schoolId };
    for (const field of [
      "sessionId",
      "classId",
      "arm",
      "status",
      "admissionStatus",
    ])
      if (input[field]) filter[field] = input[field];
    if (input.search) {
      const pattern = escape(input.search);
      const guardians = await Guardian.find({
        schoolId,
        $or: ["fullName", "primaryPhone", "alternativePhone"].map((k) => ({
          [k]: { $regex: pattern, $options: "i" },
        })),
      }).select("_id");
      const links = await StudentGuardian.find({
        schoolId,
        guardianId: { $in: guardians.map((g) => g._id) },
        isActive: true,
      }).select("studentId");
      const applications = await AdmissionApplication.find({
        schoolId,
        $or: [
          { reference: { $regex: pattern, $options: "i" } },
          { "guardians.fullName": { $regex: pattern, $options: "i" } },
          { "guardians.primaryPhone": { $regex: pattern, $options: "i" } },
        ],
      }).select("studentId");
      filter.$or = [
        "firstName",
        "middleName",
        "lastName",
        "admissionNumber",
        "applicationReference",
      ].map((field) => ({ [field]: { $regex: pattern, $options: "i" } }));
      filter.$or.push({
        _id: {
          $in: [
            ...links.map((l) => l.studentId),
            ...applications.map((a) => a.studentId).filter(Boolean),
          ],
        },
      });
      filter.$or.push({
        $expr: {
          $regexMatch: {
            input: { $concat: ["$firstName", " ", "$lastName"] },
            regex: pattern,
            options: "i",
          },
        },
      });
      filter.$or.push({
        $expr: {
          $regexMatch: {
            input: {
              $concat: ["$firstName", " ", "$middleName", " ", "$lastName"],
            },
            regex: pattern,
            options: "i",
          },
        },
      });
    }
    if (input.applicationStatus) {
      const applications = await AdmissionApplication.find({
        schoolId,
        status: input.applicationStatus,
      }).select("_id");
      filter.applicationId = { $in: applications.map((a) => a._id) };
    }
    const [records, total] = await Promise.all([
      Student.find(filter)
        .select(studentListFields)
        .sort({ createdAt: -1, _id: -1 })
        .skip((input.page - 1) * input.limit)
        .limit(input.limit),
      Student.countDocuments(filter),
    ]);
    res.json({ records, total, page: input.page, limit: input.limit });
  });
  router.use((req, _res, next) => {
    z.object({}).strict().parse(req.query);
    next();
  });
  router.get("/stats", async (req, res) => {
    const schoolId = req.user.schoolId;
    const [
      totalStudents,
      activeStudents,
      inactiveStudents,
      archivedStudents,
      pendingAdmissions,
    ] = await Promise.all([
      Student.countDocuments({ schoolId }),
      ...["active", "inactive", "archived"].map((status) =>
        Student.countDocuments({ schoolId, status }),
      ),
      Student.countDocuments({
        schoolId,
        admissionStatus: "pending",
        status: { $ne: "archived" },
      }),
    ]);
    res.json({
      totalStudents,
      activeStudents,
      inactiveStudents,
      archivedStudents,
      pendingAdmissions,
    });
  });
  router.get("/:id/guardians", async (req, res) =>
    res.json({
      records: await relatedRecords({
        schoolId: req.user.schoolId,
        studentId: objectId.parse(req.params.id),
      }),
    }),
  );
  router.post("/", async (req, res) =>
    res.status(201).json({
      record: studentDetails(
        await saveStudent({
          schoolId: req.user.schoolId,
          userId: req.user._id,
          input: studentInput.parse(req.body),
        }),
      ),
    }),
  );
  router.get("/:id", async (req, res) =>
    res.json({
      record: studentDetails(
        await ownedStudent(req.user.schoolId, objectId.parse(req.params.id)),
      ),
    }),
  );
  router.put("/:id", async (req, res) =>
    res.json({
      record: studentDetails(
        await saveStudent({
          schoolId: req.user.schoolId,
          userId: req.user._id,
          id: objectId.parse(req.params.id),
          input: studentInput.parse(req.body),
        }),
      ),
    }),
  );
  router.patch("/:id/status", async (req, res) => {
    const id = objectId.parse(req.params.id),
      { status } = z.object({ status: studentStatus }).strict().parse(req.body);
    const record = await mutateConfiguration(
      req.user.schoolId,
      async (transaction) => {
        const record = await ownedStudent(req.user.schoolId, id, transaction);
        if (record.status === "archived" && status === "active")
          fail(
            409,
            "Restore the archived student to inactive first, then activate after reviewing placement.",
          );
        if (status === "active")
          await validatePlacement(record, req.user.schoolId, transaction);
        record.status = status;
        await User.updateMany(
          {
            schoolId: req.user.schoolId,
            studentId: record._id,
            role: "student",
          },
          { $inc: { sessionVersion: 1 } },
          { session: transaction },
        );
        record.updatedBy = req.user._id;
        return record.save({ session: transaction });
      },
    );
    res.json({ record: studentDetails(record) });
  });
  router.delete("/:id", async (req, res) => {
    await ownedStudent(req.user.schoolId, objectId.parse(req.params.id));
    res.status(405).set("Allow", "GET, PUT, PATCH").json({
      message:
        "Permanent deletion is disabled. Deactivate or archive the student to preserve references.",
    });
  });
  return router;
}
