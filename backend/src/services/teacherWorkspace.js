import { Student } from "../models/Student.js";
import { Attendance } from "../models/Attendance.js";
import { Examination } from "../models/Examination.js";
import { Result } from "../models/Result.js";
import {
  assignmentStudentScope,
  examAssignmentFilter,
  examAssignmentRows,
  currentAttendanceGrants,
  availableAttendanceGrants,
  attendanceAssignmentClauses,
} from "./teacherAccess.js";
export async function explicitTeacherContext(req) {
  const access = req.teacherAccess,
    schoolId = req.user.schoolId;
  const students = await Student.find({
    schoolId,
    status: "active",
    ...assignmentStudentScope(access),
  })
    .select("classId arm sessionId")
    .lean();
  const groupMap = new Map();
  const grants = currentAttendanceGrants(req.teacher, access);
  for (const row of access.current) {
    const key = `${row.sessionId}:${row.classId}:${row.arm}`;
    if (!groupMap.has(key))
      groupMap.set(key, {
        _id: key,
        classId: row.classId,
        sessionId: row.sessionId,
        name: access.classes.find((c) => String(c._id) === String(row.classId))
          .name,
        arm: row.arm,
        arms: [row.arm].filter(Boolean),
        subjectIds: [],
        classTeacher: false,
        studentCount: students.filter(
          (s) =>
            String(s.classId) === String(row.classId) &&
            String(s.sessionId) === String(row.sessionId) &&
            s.arm === row.arm,
        ).length,
        attendancePermission: grants.some(
          (g) =>
            String(g.classId) === String(row.classId) &&
            g.arm === row.arm &&
            String(g.sessionId) === String(row.sessionId),
        ),
      });
    const group = groupMap.get(key);
    if (row.kind === "class_teacher") group.classTeacher = true;
    else if (
      !group.subjectIds.some((id) => String(id) === String(row.subjectId))
    )
      group.subjectIds.push(row.subjectId);
  }
  const groups = [...groupMap.values()];
  const classes = access.classes
    .filter((c) => groups.some((g) => String(g.classId) === String(c._id)))
    .map((c) => ({
      _id: c._id,
      name: c.name,
      arms: [
        ...new Set(
          groups
            .filter((g) => String(g.classId) === String(c._id))
            .map((g) => g.arm),
        ),
      ].filter(Boolean),
      inactiveArms: [],
      status: c.status,
      studentCount: groups
        .filter((g) => String(g.classId) === String(c._id))
        .reduce((n, g) => n + g.studentCount, 0),
    }));
  const subjects = access.subjects
    .filter((s) =>
      groups.some((g) =>
        g.subjectIds.some((id) => String(id) === String(s._id)),
      ),
    )
    .map((s) => ({
      _id: s._id,
      name: s.name,
      classId: s.classId,
      status: s.status,
      groups: groups
        .filter((g) => g.subjectIds.some((id) => String(id) === String(s._id)))
        .map((g) => ({
          classId: g.classId,
          className: g.name,
          arm: g.arm,
          sessionId: g.sessionId,
        })),
    }));
  return {
    school: { name: req.school.name, logo: req.school.logoUrl || "" },
    assignmentMode: "explicit",
    classes,
    groups,
    subjects,
    sessions: access.sessions.map((s) => ({
      _id: s._id,
      name: s.name,
      status: s.status,
      startDate: s.startDate,
      endDate: s.endDate,
    })),
    terms: access.terms.map((t) => ({
      _id: t._id,
      name: t.name,
      sessionId: t.sessionId,
      status: t.status,
    })),
    attendanceGrants: availableAttendanceGrants(req.teacher, access),
    attendanceClasses: access.classes
      .filter((c) =>
        availableAttendanceGrants(req.teacher, access).some(
          (g) => String(g.classId) === String(c._id),
        ),
      )
      .map((c) => ({ _id: c._id, name: c.name, arms: c.arms })),
    responsibilities: groups.filter((g) => g.classTeacher),
  };
}
export async function explicitTeacherDashboard(req) {
  const access = req.teacherAccess,
    schoolId = req.user.schoolId;
  const context = await explicitTeacherContext(req);
  const exams = await Examination.find({
    schoolId,
    ...examAssignmentFilter(access),
  })
    .select("name className status updatedAt sessionId termId classId subjects")
    .sort({ updatedAt: -1 });
  const resultClauses = exams.flatMap((exam) =>
    examAssignmentRows(access, exam).map((r) => ({
      examinationId: exam._id,
      subjectId: r.subjectId,
      arm: r.arm,
    })),
  );
  const [students, attendance, results] = await Promise.all([
    Student.countDocuments({
      schoolId,
      status: "active",
      ...assignmentStudentScope(access),
    }),
    Attendance.aggregate([
      {
        $match: {
          schoolId,
          kind: "student",
          $or: attendanceAssignmentClauses(req.teacher, access).concat([
            { _id: null },
          ]),
        },
      },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    Result.countDocuments({
      schoolId,
      $or: resultClauses.concat([{ _id: null }]),
    }),
  ]);
  return {
    stats: {
      classes: context.classes.length,
      classArmGroups: context.groups.length,
      subjects: context.subjects.length,
      students,
      teachingAssignments: access.current.filter((r) => r.kind === "teaching")
        .length,
      classTeacherResponsibilities: context.responsibilities.length,
      attendancePermissions: currentAttendanceGrants(req.teacher, access)
        .length,
      examinations: exams.length,
      results,
    },
    attendance,
    recent: exams.slice(0, 8).map((e) => ({
      _id: e._id,
      name: e.name,
      className: e.className,
      status: e.status,
      updatedAt: e.updatedAt,
    })),
  };
}
