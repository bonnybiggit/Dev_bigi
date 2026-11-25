import { Student } from "../models/Student.js";
import { SchoolClass } from "../models/SchoolClass.js";
import { AcademicSession } from "../models/AcademicSession.js";
import { mutateConfiguration, fail } from "./schoolConfiguration.js";
export const studentListFields =
  "_id admissionNumber firstName middleName lastName sessionId classId arm admissionStatus status applicationId applicationReference";
export const studentDetailFields = `${studentListFields} dateOfBirth gender address admissionDate previousSchool`;
export const studentDetails = (record) =>
  Object.fromEntries(
    studentDetailFields
      .split(" ")
      .filter((key) => record[key] !== undefined)
      .map((key) => [key, record[key]]),
  );
export async function ownedStudent(schoolId, id, session = null) {
  const record = await Student.findOne({ schoolId, _id: id }).session(session);
  if (!record) fail(404, "Student record not found.");
  return record;
}
export async function validatePlacement(
  input,
  schoolId,
  transaction,
  allowInactive = false,
) {
  const session = await AcademicSession.findOne({
    _id: input.sessionId,
    schoolId,
  }).session(transaction);
  const schoolClass = await SchoolClass.findOne({
    _id: input.classId,
    schoolId,
  }).session(transaction);
  if (!session || !schoolClass)
    fail(400, "The academic session or class is unavailable in your school.");
  if (
    schoolClass.arms.length
      ? !schoolClass.arms.includes(input.arm)
      : !!input.arm
  )
    fail(
      400,
      "Choose an arm belonging to the selected class, or leave blank for a class without arms.",
    );
  if (
    !allowInactive &&
    (session.status !== "active" ||
      schoolClass.status !== "active" ||
      schoolClass.inactiveArms.includes(input.arm))
  )
    fail(
      400,
      "New placement and activation require an active session, class, and arm.",
    );
}
export function saveStudent({
  schoolId,
  userId,
  id,
  input,
  transaction = null,
  application = null,
}) {
  const operation = async (transaction) => {
    const record = id ? await ownedStudent(schoolId, id, transaction) : null;
    if (
      record?.applicationId &&
      record.admissionNumber !== input.admissionNumber
    )
      fail(
        409,
        "Application-generated admission numbers are permanent and cannot be changed.",
      );
    if (record?.status === "archived")
      fail(409, "Restore the archived student to inactive before editing.");
    if (
      await Student.exists({
        schoolId,
        admissionNumber: input.admissionNumber,
        ...(id ? { _id: { $ne: id } } : {}),
      })
        .collation({ locale: "en", strength: 2 })
        .session(transaction)
    )
      fail(
        409,
        "This admission number is already reserved in your school, including inactive or archived students.",
      );
    const unchangedPlacement =
      record &&
      String(record.sessionId) === input.sessionId &&
      String(record.classId) === input.classId &&
      record.arm === input.arm;
    await validatePlacement(input, schoolId, transaction, !!unchangedPlacement);
    if (record) {
      Object.assign(record, input, { updatedBy: userId });
      return record.save({ session: transaction });
    }
    return (
      await Student.create(
        [
          {
            ...input,
            ...(application
              ? {
                  applicationId: application._id,
                  applicationReference: application.reference,
                }
              : {}),
            schoolId,
            createdBy: userId,
            updatedBy: userId,
          },
        ],
        { session: transaction },
      )
    )[0];
  };
  return transaction
    ? operation(transaction)
    : mutateConfiguration(schoolId, operation);
}
