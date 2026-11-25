import { TeacherAssignment } from "../models/TeacherAssignment.js";
import { TeacherAudit } from "../models/TeacherAudit.js";
import { Staff } from "../models/Staff.js";
import { User } from "../models/User.js";
import { SchoolClass } from "../models/SchoolClass.js";
import { Subject } from "../models/Subject.js";
import { AcademicSession } from "../models/AcademicSession.js";
import { AcademicTerm } from "../models/AcademicTerm.js";
import { fail, mutateConfiguration } from "./schoolConfiguration.js";
export async function assignmentAudit(
  req,
  staffId,
  assignmentId,
  action,
  before,
  after,
  reason,
  session,
) {
  await TeacherAudit.create(
    [
      {
        schoolId: req.user.schoolId,
        staffId,
        actorId: req.user._id,
        assignmentId,
        action,
        before,
        after,
        reason,
      },
    ],
    { session },
  );
}
export async function revokeTeacherSessions(schoolId, staffIds, session) {
  await User.updateMany(
    { schoolId, staffId: { $in: staffIds }, role: "teacher" },
    { $inc: { sessionVersion: 1 } },
    { session },
  );
}
export async function assignmentTeacher(req, id, session, adoptLegacy, reason) {
  const staff = await Staff.findOne({
    schoolId: req.user.schoolId,
    _id: id,
    status: "active",
    category: "teaching",
  }).session(session);
  if (!staff)
    fail(400, "Choose an active teaching staff record in your school.");
  if (staff.assignmentMode !== "explicit") {
    if (!adoptLegacy)
      fail(
        409,
        "Review legacy assignments and explicitly enable period-aware access for this teacher first.",
      );
    await assignmentAudit(
      req,
      staff._id,
      undefined,
      "legacy_adopted",
      {
        classIds: staff.classIds,
        subjectIds: staff.subjectIds,
        attendanceGrants: staff.attendanceGrants,
      },
      { assignmentMode: "explicit" },
      reason,
      session,
    );
    staff.assignmentMode = "explicit";
    staff.updatedBy = req.user._id;
    await staff.save({ session });
  }
  return staff;
}
export async function validateAssignment(
  req,
  value,
  transaction,
  excludeId = null,
) {
  const schoolId = req.user.schoolId;
  const [session, term, c, subject] = await Promise.all([
    AcademicSession.findOne({ schoolId, _id: value.sessionId }).session(
      transaction,
    ),
    value.termId
      ? AcademicTerm.findOne({
          schoolId,
          _id: value.termId,
          sessionId: value.sessionId,
        }).session(transaction)
      : Promise.resolve(null),
    SchoolClass.findOne({
      schoolId,
      _id: value.classId,
      status: "active",
    }).session(transaction),
    value.subjectId
      ? Subject.findOne({
          schoolId,
          _id: value.subjectId,
          classId: value.classId,
          status: "active",
        }).session(transaction)
      : Promise.resolve(null),
  ]);
  if (
    !session ||
    (value.termId && !term) ||
    !c ||
    (value.kind === "teaching" && !subject)
  )
    fail(
      400,
      "Choose valid school-owned periods, an active class and subjects belonging to that class.",
    );
  if (
    (c.arms.length ? !c.arms.includes(value.arm) : !!value.arm) ||
    c.inactiveArms.includes(value.arm)
  )
    fail(400, "Choose an active arm of the selected class.");
  if (value.status !== "active") return;
  const overlap = {
    schoolId,
    sessionId: value.sessionId,
    classId: value.classId,
    arm: value.arm,
    kind: value.kind,
    status: "active",
    ...(value.kind === "teaching"
      ? { staffId: value.staffId, subjectId: value.subjectId }
      : {}),
    ...(value.termId
      ? { $or: [{ termId: null }, { termId: value.termId }] }
      : {}),
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
  };
  if (await TeacherAssignment.exists(overlap).session(transaction))
    fail(
      409,
      value.kind === "class_teacher"
        ? "An active lead class teacher already covers this class, arm and period. Revoke or transfer that appointment first."
        : "This teaching assignment already covers this period, including any session-wide overlap.",
    );
}
const valuesFor = (input, subjectId) => ({
  staffId: input.staffId,
  sessionId: input.sessionId,
  termId: input.termId,
  classId: input.classId,
  arm: input.arm,
  kind: input.kind,
  subjectId,
  status: input.status,
});
export function createAssignments(req, input) {
  return mutateConfiguration(req.user.schoolId, async (session) => {
    const staff = await assignmentTeacher(
      req,
      input.staffId,
      session,
      input.adoptLegacy,
      input.reason,
    );
    const records = [];
    for (const subjectId of input.kind === "teaching"
      ? input.subjectIds
      : [null]) {
      const value = valuesFor(input, subjectId);
      await validateAssignment(req, value, session);
      const record = (
        await TeacherAssignment.create(
          [
            {
              ...value,
              schoolId: req.user.schoolId,
              createdBy: req.user._id,
              updatedBy: req.user._id,
            },
          ],
          { session },
        )
      )[0];
      await assignmentAudit(
        req,
        staff._id,
        record._id,
        "assignment_created",
        null,
        record.toObject(),
        input.reason,
        session,
      );
      records.push(record);
    }
    await revokeTeacherSessions(req.user.schoolId, [staff._id], session);
    return records;
  });
}
export async function ownedAssignment(req, id, session = null) {
  const record = await TeacherAssignment.findOne({
    _id: id,
    schoolId: req.user.schoolId,
  }).session(session);
  if (!record) fail(404, "Assignment not found.");
  return record;
}
export function editAssignment(req, id, input) {
  return mutateConfiguration(req.user.schoolId, async (session) => {
    const record = await ownedAssignment(req, id, session),
      before = record.toObject();
    if (record.revision !== input.revision)
      fail(409, "Assignment changed. Reload before saving.");
    if (String(record.staffId) !== input.staffId)
      fail(400, "Use the audited transfer action to change the teacher.");
    if (input.kind === "teaching" && input.subjectIds.length !== 1)
      fail(400, "Edit one existing subject assignment at a time.");
    await assignmentTeacher(req, input.staffId, session, false, input.reason);
    const value = valuesFor(input, input.subjectIds[0] || null);
    await validateAssignment(req, value, session, record._id);
    record.set({
      ...value,
      revision: record.revision + 1,
      updatedBy: req.user._id,
    });
    await record.save({ session });
    await assignmentAudit(
      req,
      record.staffId,
      record._id,
      "assignment_updated",
      before,
      record.toObject(),
      input.reason,
      session,
    );
    await revokeTeacherSessions(req.user.schoolId, [record.staffId], session);
    return record;
  });
}
export function deactivateAssignment(req, id, input) {
  return mutateConfiguration(req.user.schoolId, async (session) => {
    const record = await ownedAssignment(req, id, session),
      before = record.toObject();
    if (record.revision !== input.revision)
      fail(409, "Assignment changed. Reload before saving.");
    record.set({
      status: "inactive",
      revision: record.revision + 1,
      updatedBy: req.user._id,
    });
    await record.save({ session });
    await assignmentAudit(
      req,
      record.staffId,
      record._id,
      "assignment_revoked",
      before,
      record.toObject(),
      input.reason,
      session,
    );
    await revokeTeacherSessions(req.user.schoolId, [record.staffId], session);
    return record;
  });
}
export function transferAssignment(req, id, input) {
  return mutateConfiguration(req.user.schoolId, async (session) => {
    const source = await ownedAssignment(req, id, session),
      before = source.toObject();
    if (source.revision !== input.revision || source.status !== "active")
      fail(409, "Only the latest active assignment can be transferred.");
    if (String(source.staffId) === input.staffId)
      fail(400, "Choose a different teacher.");
    await assignmentTeacher(
      req,
      input.staffId,
      session,
      input.adoptLegacy,
      input.reason,
    );
    source.set({
      status: "inactive",
      revision: source.revision + 1,
      updatedBy: req.user._id,
    });
    await source.save({ session });
    const value = { ...before, staffId: input.staffId, status: "active" };
    delete value._id;
    delete value.__v;
    delete value.createdAt;
    delete value.updatedAt;
    await validateAssignment(req, value, session);
    const target = (
      await TeacherAssignment.create(
        [
          {
            ...value,
            revision: 1,
            sourceId: source._id,
            createdBy: req.user._id,
            updatedBy: req.user._id,
          },
        ],
        { session },
      )
    )[0];
    await assignmentAudit(
      req,
      source.staffId,
      source._id,
      "assignment_transferred",
      before,
      { ...source.toObject(), successorId: target._id },
      input.reason,
      session,
    );
    await assignmentAudit(
      req,
      target.staffId,
      target._id,
      "assignment_transferred",
      { sourceId: source._id },
      target.toObject(),
      input.reason,
      session,
    );
    await revokeTeacherSessions(
      req.user.schoolId,
      [source.staffId, target.staffId],
      session,
    );
    return { source, record: target };
  });
}
export function copyAssignments(req, input) {
  return mutateConfiguration(req.user.schoolId, async (session) => {
    const records = [];
    for (const id of input.ids) {
      const source = await ownedAssignment(req, id, session);
      if (
        String(source.sessionId) === input.sessionId &&
        String(source.termId || "") === (input.termId || "")
      )
        fail(400, "Choose a different target academic period.");
      await assignmentTeacher(
        req,
        source.staffId,
        session,
        false,
        input.reason,
      );
      const value = {
        staffId: source.staffId,
        sessionId: input.sessionId,
        termId: input.termId,
        classId: source.classId,
        arm: source.arm,
        subjectId: source.subjectId,
        kind: source.kind,
        status: "active",
      };
      await validateAssignment(req, value, session);
      const record = (
        await TeacherAssignment.create(
          [
            {
              ...value,
              schoolId: req.user.schoolId,
              sourceId: source._id,
              createdBy: req.user._id,
              updatedBy: req.user._id,
            },
          ],
          { session },
        )
      )[0];
      await assignmentAudit(
        req,
        source.staffId,
        record._id,
        "assignment_copied",
        { sourceId: source._id },
        record.toObject(),
        input.reason,
        session,
      );
      records.push(record);
    }
    await revokeTeacherSessions(
      req.user.schoolId,
      records.map((r) => r.staffId),
      session,
    );
    return records;
  });
}
