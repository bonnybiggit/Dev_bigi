import { Staff } from "../models/Staff.js";
import { SchoolClass } from "../models/SchoolClass.js";
import { Subject } from "../models/Subject.js";
import { User } from "../models/User.js";
import { mutateConfiguration, fail } from "./schoolConfiguration.js";

export async function ownedStaff(schoolId, id, session = null) {
  const record = await Staff.findOne({ _id: id, schoolId }).session(session);
  if (!record) fail(404, "Staff record not found.");
  return record;
}
async function validateAssignments(input, existing, schoolId, session) {
  if (input.category !== "teaching") return;
  const classes = await SchoolClass.find({
    _id: { $in: input.classIds },
    schoolId,
  }).session(session);
  const subjects = await Subject.find({
    _id: { $in: input.subjectIds },
    schoolId,
  }).session(session);
  if (
    classes.length !== input.classIds.length ||
    subjects.length !== input.subjectIds.length
  )
    fail(400, "An assigned class or subject is unavailable in your school.");
  const retainedClasses = new Set((existing?.classIds || []).map(String));
  const retainedSubjects = new Set((existing?.subjectIds || []).map(String));
  const inactiveClasses = new Set(
    classes
      .filter((record) => record.status !== "active")
      .map((record) => record.id),
  );
  if (
    classes.some(
      (record) => record.status !== "active" && !retainedClasses.has(record.id),
    ) ||
    subjects.some(
      (record) =>
        (record.status !== "active" ||
          inactiveClasses.has(String(record.classId))) &&
        !retainedSubjects.has(record.id),
    )
  )
    fail(400, "New assignments must use active classes and subjects.");
  if (
    subjects.some((record) => !input.classIds.includes(String(record.classId)))
  )
    fail(
      400,
      "Each assigned subject must belong to one of the selected classes.",
    );
}
export function saveStaff({ schoolId, userId, id, input }) {
  // Share the academic configuration lock so assignment validation cannot race
  // a class/subject change made through the existing academic routes.
  return mutateConfiguration(schoolId, async (session) => {
    const existing = id ? await ownedStaff(schoolId, id, session) : null;
    if (
      await Staff.exists({
        schoolId,
        employeeId: input.employeeId,
        ...(id ? { _id: { $ne: id } } : {}),
      })
        .collation({ locale: "en", strength: 2 })
        .session(session)
    )
      fail(
        409,
        "This employee ID is already used in your school, including inactive records.",
      );
    if (existing?.assignmentMode !== "explicit")
      await validateAssignments(input, existing, schoolId, session);
    if (existing) {
      if (
        existing.assignmentMode === "explicit" &&
        ["classIds", "subjectIds"].some(
          (field) =>
            existing[field].map(String).sort().join() !==
            [...input[field]].sort().join(),
        )
      )
        fail(
          409,
          "This teacher uses period-aware assignments. Manage assignments on the Teacher Assignments page; legacy arrays are retained read-only.",
        );
      await User.updateMany(
        { schoolId, staffId: existing._id, role: "teacher" },
        { $inc: { sessionVersion: 1 } },
        { session },
      );
      Object.assign(existing, input, { updatedBy: userId });
      return existing.save({ session });
    }
    return (
      await Staff.create(
        [{ ...input, schoolId, createdBy: userId, updatedBy: userId }],
        { session },
      )
    )[0];
  });
}
