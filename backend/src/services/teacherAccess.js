import { TeacherAssignment } from "../models/TeacherAssignment.js";
import { AcademicSession } from "../models/AcademicSession.js";
import { AcademicTerm } from "../models/AcademicTerm.js";
import { SchoolClass } from "../models/SchoolClass.js";
import { Subject } from "../models/Subject.js";
const same = (a, b) => String(a) === String(b);
export const explicitAssignments = (staff) =>
  staff.assignmentMode === "explicit";
// Legacy staff retain their pre-existing permissions until deliberate administrator adoption.
export async function teacherAccess(staff, schoolId, transaction = null) {
  if (!explicitAssignments(staff)) return null;
  const [records, sessions, terms, classes, subjects] = await Promise.all([
    TeacherAssignment.find({ schoolId, staffId: staff._id, status: "active" })
      .session(transaction)
      .lean(),
    AcademicSession.find({ schoolId }).session(transaction).lean(),
    AcademicTerm.find({ schoolId }).session(transaction).lean(),
    SchoolClass.find({ schoolId }).session(transaction).lean(),
    Subject.find({ schoolId }).session(transaction).lean(),
  ]);
  const rows = records.filter((r) => {
    const c = classes.find((c) => same(c._id, r.classId));
    return (
      c &&
      sessions.some((s) => same(s._id, r.sessionId)) &&
      (!r.termId ||
        terms.some(
          (t) => same(t._id, r.termId) && same(t.sessionId, r.sessionId),
        )) &&
      (c.arms.length ? c.arms.includes(r.arm) : !r.arm) &&
      (r.kind === "class_teacher" ||
        subjects.some(
          (s) => same(s._id, r.subjectId) && same(s.classId, r.classId),
        ))
    );
  });
  const current = rows.filter((r) => {
    const c = classes.find((c) => same(c._id, r.classId));
    return (
      sessions.some((s) => same(s._id, r.sessionId) && s.status === "active") &&
      (!r.termId ||
        terms.some((t) => same(t._id, r.termId) && t.status === "active")) &&
      c.status === "active" &&
      !c.inactiveArms.includes(r.arm) &&
      (r.kind === "class_teacher" ||
        subjects.some((s) => same(s._id, r.subjectId) && s.status === "active"))
    );
  });
  return { rows, current, sessions, terms, classes, subjects };
}
export function assignmentStudentScope(access) {
  return {
    $or: access.current
      .map((r) => ({ sessionId: r.sessionId, classId: r.classId, arm: r.arm }))
      .concat([{ _id: null }]),
  };
}
export function examAssignmentRows(access, exam, subjectId, arm) {
  return access.rows.filter(
    (r) =>
      r.kind === "teaching" &&
      same(r.sessionId, exam.sessionId) &&
      (!r.termId || same(r.termId, exam.termId)) &&
      same(r.classId, exam.classId) &&
      (!subjectId || same(r.subjectId, subjectId)) &&
      (arm === undefined || r.arm === arm),
  );
}
export function examAssignmentFilter(access) {
  return {
    $or: access.rows
      .filter((r) => r.kind === "teaching")
      .map((r) => ({
        sessionId: r.sessionId,
        ...(r.termId ? { termId: r.termId } : {}),
        classId: r.classId,
        "subjects.subjectId": r.subjectId,
      }))
      .concat([{ _id: null }]),
  };
}
const iso = (value) =>
  value instanceof Date ? value.toISOString().slice(0, 10) : value;
function periodContains(access, scope, from, to) {
  const session = access.sessions.find((s) => same(s._id, scope.sessionId));
  const term = scope.termId
    ? access.terms.find(
        (t) => same(t._id, scope.termId) && same(t.sessionId, scope.sessionId),
      )
    : null;
  if (!session || (scope.termId && !term)) return false;
  return (
    iso(session.startDate) <= from &&
    iso(session.endDate) >= to &&
    (!term || (iso(term.startDate) <= from && iso(term.endDate) >= to))
  );
}
export function attendancePermitted(staff, access, input, range = null) {
  const place = (r) =>
    same(r.classId, input.classId) && r.arm === (input.arm || "");
  if (!access)
    return (
      staff.classIds.some((id) => same(id, input.classId)) &&
      staff.attendanceGrants.some((g) => place(g) && !g.sessionId)
    );
  const from = iso(range?.from || input.date),
    to = iso(range?.to || input.date);
  if (!from || !to) return false;
  return (
    access.rows.some(
      (r) =>
        place(r) &&
        same(r.sessionId, input.sessionId) &&
        periodContains(access, r, from, to),
    ) &&
    staff.attendanceGrants.some(
      (g) =>
        place(g) &&
        g.sessionId &&
        same(g.sessionId, input.sessionId) &&
        periodContains(access, g, from, to),
    )
  );
}
export function availableAttendanceGrants(staff, access) {
  if (!access) return currentAttendanceGrants(staff, access);
  return staff.attendanceGrants.filter(
    (g) =>
      g.sessionId &&
      (!g.termId ||
        access.terms.some(
          (t) => same(t._id, g.termId) && same(t.sessionId, g.sessionId),
        )) &&
      access.rows.some(
        (r) =>
          same(r.sessionId, g.sessionId) &&
          same(r.classId, g.classId) &&
          r.arm === g.arm &&
          (!g.termId || !r.termId || same(g.termId, r.termId)),
      ),
  );
}
export function currentAttendanceGrants(staff, access) {
  if (!access)
    return staff.attendanceGrants.filter(
      (g) => !g.sessionId && staff.classIds.some((id) => same(id, g.classId)),
    );
  return staff.attendanceGrants.filter(
    (g) =>
      g.sessionId &&
      access.current.some(
        (r) =>
          same(r.sessionId, g.sessionId) &&
          same(r.classId, g.classId) &&
          r.arm === g.arm &&
          (!g.termId || !r.termId || same(g.termId, r.termId)) &&
          (!g.termId ||
            access.terms.some(
              (t) => same(t._id, g.termId) && t.status === "active",
            )),
      ),
  );
}
export function attendanceAssignmentClauses(staff, access) {
  if (!access)
    return currentAttendanceGrants(staff, access).map((g) => ({
      classId: g.classId,
      arm: g.arm,
    }));
  const clauses = [];
  for (const r of access.current)
    for (const g of currentAttendanceGrants(staff, access)) {
      if (
        !same(r.classId, g.classId) ||
        r.arm !== g.arm ||
        !same(r.sessionId, g.sessionId)
      )
        continue;
      const period =
        access.terms.find((t) => same(t._id, r.termId || g.termId)) ||
        access.sessions.find((s) => same(s._id, r.sessionId));
      clauses.push({
        sessionId: r.sessionId,
        classId: r.classId,
        arm: r.arm,
        date: { $gte: period.startDate, $lte: period.endDate },
      });
    }
  return clauses;
}
