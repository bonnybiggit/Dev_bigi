import { Guardian } from "../models/Guardian.js";
import { StudentGuardian } from "../models/StudentGuardian.js";
import { Student } from "../models/Student.js";
import { ownedStudent } from "./student.js";
import { mutateConfiguration, fail } from "./schoolConfiguration.js";
export const guardianListFields = "_id fullName email primaryPhone status";
const detailFields = `${guardianListFields} alternativePhone address occupation gender emergencyContactName emergencyContactPhone emergencyContactRelationship`;
export const guardianDetails = (record) =>
  Object.fromEntries(
    detailFields
      .split(" ")
      .filter((key) => record[key] !== undefined)
      .map((key) => [key, record[key]]),
  );
export async function ownedGuardian(schoolId, id, session = null) {
  const record = await Guardian.findOne({ _id: id, schoolId }).session(session);
  if (!record) fail(404, "Guardian record not found.");
  return record;
}
export function saveGuardian({ schoolId, userId, id, input }) {
  return mutateConfiguration(schoolId, async (session) => {
    if (id) {
      const record = await ownedGuardian(schoolId, id, session);
      Object.assign(record, input, { updatedBy: userId });
      return record.save({ session });
    }
    return (
      await Guardian.create(
        [{ ...input, schoolId, createdBy: userId, updatedBy: userId }],
        { session },
      )
    )[0];
  });
}
export function changeRelationship({
  schoolId,
  userId,
  guardianId,
  studentId,
  relationship,
  operation,
}) {
  return mutateConfiguration(schoolId, async (session) => {
    const guardian = await ownedGuardian(schoolId, guardianId, session);
    const student = await ownedStudent(schoolId, studentId, session);
    const existing = await StudentGuardian.findOne({
      schoolId,
      guardianId,
      studentId,
    }).session(session);
    if (operation === "create") {
      if (existing?.isActive)
        fail(
          409,
          "This guardian is already linked to the student. Edit the existing relationship instead.",
        );
      if (guardian.status !== "active")
        fail(409, "Activate the guardian before adding a relationship.");
    } else if (!existing?.isActive) fail(404, "Relationship not found.");
    if (operation !== "remove" && student.status === "archived")
      fail(
        409,
        "Restore the archived student before adding or editing a relationship.",
      );
    if (existing) {
      Object.assign(
        existing,
        operation === "remove"
          ? { isActive: false, removedAt: new Date() }
          : { relationship, isActive: true, removedAt: null },
        { updatedBy: userId },
      );
      return existing.save({ session });
    }
    return (
      await StudentGuardian.create(
        [
          {
            schoolId,
            guardianId,
            studentId,
            relationship,
            createdBy: userId,
            updatedBy: userId,
          },
        ],
        { session },
      )
    )[0];
  });
}
export const relationshipDetails = (record) => ({
  studentId: record.studentId,
  guardianId: record.guardianId,
  relationship: record.relationship,
});
export async function relatedRecords({ schoolId, guardianId, studentId }) {
  if (guardianId) await ownedGuardian(schoolId, guardianId);
  else await ownedStudent(schoolId, studentId);
  const links = await StudentGuardian.find({
    schoolId,
    ...(guardianId ? { guardianId } : { studentId }),
    isActive: true,
  })
    .sort({ createdAt: 1 })
    .lean();
  const Model = guardianId ? Student : Guardian;
  const key = guardianId ? "studentId" : "guardianId";
  const records = await Model.find({
    schoolId,
    _id: { $in: links.map((link) => link[key]) },
  })
    .select(
      guardianId
        ? "_id admissionNumber firstName middleName lastName status"
        : guardianListFields,
    )
    .lean();
  const lookup = new Map(records.map((record) => [String(record._id), record]));
  return links
    .filter((link) => lookup.has(String(link[key])))
    .map((link) => ({
      ...relationshipDetails(link),
      record: lookup.get(String(link[key])),
    }));
}
