import mongoose from "mongoose";
import { School } from "../models/School.js";
import { Student } from "../models/Student.js";
import { Guardian } from "../models/Guardian.js";
import { StudentGuardian } from "../models/StudentGuardian.js";
import { Subject } from "../models/Subject.js";
import { Staff } from "../models/Staff.js";
import { User } from "../models/User.js";
import { AcademicSession } from "../models/AcademicSession.js";
import { SchoolClass } from "../models/SchoolClass.js";
import { AcademicTerm } from "../models/AcademicTerm.js";
import { TeacherAssignment } from "../models/TeacherAssignment.js";
import {
  AdmissionApplication,
  IssuedDocument,
  StudentMedical,
} from "../models/Admissions.js";
import {
  documentTypes,
  defaultChecklist,
  defaultPrivacyNotice,
} from "./documentTypes.js";
import {
  allocateReference,
  admissionsAudit,
  fingerprint,
} from "./admissionCommon.js";
import { mutateConfiguration, fail } from "./schoolConfiguration.js";
const pick = (record, fields) =>
  Object.fromEntries(
    fields
      .split(" ")
      .filter((k) => record?.[k] !== undefined)
      .map((k) => [k, record[k]]),
  );
const studentFields =
  "firstName middleName lastName dateOfBirth gender address previousSchool admissionNumber admissionDate status sessionId classId arm";
const guardianFields =
  "fullName primaryPhone alternativePhone email address occupation gender emergencyContactName emergencyContactPhone emergencyContactRelationship";
export const documentSettings = (school) => ({
  prefix: school.documentPrefix || "SCH",
  privacyNotice: school.admissionPrivacyNotice || defaultPrivacyNotice,
  checklist: school.applicationChecklist || defaultChecklist,
});
export function blankDocument(school) {
  return {
    school: pick(school, "name logoUrl address city country phone email"),
    privacyNotice: documentSettings(school).privacyNotice,
    checklist: documentSettings(school).checklist,
    student: {},
    guardians: [],
    staff: {},
    administrator: {},
    children: [],
    assignments: [],
  };
}
async function owned(Model, schoolId, id, session) {
  const record = await Model.findOne({ _id: id, schoolId }).session(session);
  if (!record) fail(404, "Document source not found in your school.");
  return record;
}
export async function sourceSnapshot(req, input, session) {
  const allowed = {
    guardian_registration: ["guardianId"],
    teacher_registration: ["staffId"],
    staff_registration: ["staffId"],
    administrator_registration: ["administratorId"],
    teacher_assignment: ["staffId"],
    student_application: ["applicationId"],
  }[input.type] || ["applicationId", "studentId"];
  for (const key of [
    "applicationId",
    "studentId",
    "guardianId",
    "staffId",
    "administratorId",
  ])
    if (input[key] && !allowed.includes(key))
      fail(400, "This record type cannot prefill the selected document.");
  if (input.applicationId && input.studentId)
    fail(400, "Choose an application or a student, not both.");
  if (
    input.includeMedical &&
    !["student_application", "medical_emergency"].includes(input.type)
  )
    fail(
      400,
      "Medical information is available only on explicitly authorised safety/application printouts.",
    );
  const schoolId = req.user.schoolId;
  const snapshot = blankDocument(req.school);
  let application, student, guardian, staff, administrator;
  if (input.applicationId)
    application = await owned(
      AdmissionApplication,
      schoolId,
      input.applicationId,
      session,
    );
  if (input.studentId)
    student = await owned(Student, schoolId, input.studentId, session);
  if (input.guardianId)
    guardian = await owned(Guardian, schoolId, input.guardianId, session);
  if (input.staffId)
    staff = await owned(Staff, schoolId, input.staffId, session);
  if (input.administratorId) {
    administrator = await User.findOne({
      _id: input.administratorId,
      schoolId,
      role: "school_admin",
    })
      .select("name email phone isActive")
      .session(session);
    if (!administrator)
      fail(404, "Administrator record not found in your school.");
  }
  if (input.sessionId) {
    const period = await owned(
      AcademicSession,
      schoolId,
      input.sessionId,
      session,
    );
    snapshot.sessionName = period.name;
  }
  if (
    input.type === "admission_acceptance" &&
    !(application && ["approved", "enrolled"].includes(application.status)) &&
    !(
      student &&
      student.admissionStatus === "admitted" &&
      student.status === "active"
    )
  )
    fail(
      400,
      "Acceptance letters require an approved application or an admitted student.",
    );
  if (
    input.type === "teacher_registration" &&
    staff &&
    staff.category !== "teaching"
  )
    fail(400, "Select a teaching staff record.");
  if (
    ["staff_registration"].includes(input.type) &&
    staff &&
    staff.category !== "non_teaching"
  )
    fail(400, "Select a non-teaching staff record.");
  if (
    input.type === "teacher_assignment" &&
    staff &&
    staff.category !== "teaching"
  )
    fail(400, "Assignments require a teaching staff record.");
  if (!input.prefill && input.type !== "admission_acceptance") return snapshot;
  if (application) {
    snapshot.student = { ...application.student };
    snapshot.guardians = application.guardians.map((g) =>
      pick(g, guardianFields + " relationship"),
    );
    snapshot.checklist = application.checklist;
    snapshot.receivedDocuments = application.receivedDocuments;
    snapshot.applicationReference = application.reference;
    snapshot.applicationStatus = application.status;
    snapshot.sourceRevision = application.revision;
    snapshot.sessionName = (
      await owned(AcademicSession, schoolId, application.sessionId, session)
    ).name;
    snapshot.className = application.classId
      ? (await owned(SchoolClass, schoolId, application.classId, session)).name
      : "";
    snapshot.arm = application.arm;
    if (application.studentId) {
      student = await owned(Student, schoolId, application.studentId, session);
      snapshot.student.admissionNumber = student.admissionNumber;
      snapshot.student.admissionDate = student.admissionDate;
    }
  }
  if (student && !application) {
    snapshot.student = pick(student, studentFields);
    snapshot.sessionName = (
      await owned(AcademicSession, schoolId, student.sessionId, session)
    ).name;
    snapshot.className = (
      await owned(SchoolClass, schoolId, student.classId, session)
    ).name;
    snapshot.arm = student.arm;
  }
  if (guardian) {
    snapshot.guardians = [pick(guardian, guardianFields)];
    const links = await StudentGuardian.find({
      schoolId,
      guardianId: guardian._id,
      isActive: true,
    }).session(session);
    const children = await Student.find({
      schoolId,
      _id: { $in: links.map((l) => l.studentId) },
    })
      .select("firstName middleName lastName admissionNumber classId arm")
      .session(session);
    const classes = await SchoolClass.find({ schoolId })
      .select("name")
      .session(session);
    snapshot.children = children.map((s) => ({
      ...pick(s, "firstName middleName lastName admissionNumber arm"),
      className: classes.find((c) => c.id === String(s.classId))?.name || "",
      relationship: links.find((l) => String(l.studentId) === s.id)
        ?.relationship,
    }));
  }
  if (staff) {
    snapshot.staff = pick(
      staff,
      "fullName employeeId email phone address employmentDate department designation employmentType category status",
    );
    if (input.type === "teacher_assignment") {
      snapshot.assignmentMode = staff.assignmentMode;
      const [rows, sessions, terms, classes, subjects] = await Promise.all([
        TeacherAssignment.find({
          schoolId,
          staffId: staff._id,
          status: "active",
          ...(input.sessionId ? { sessionId: input.sessionId } : {}),
        }).session(session),
        AcademicSession.find({ schoolId }).session(session),
        AcademicTerm.find({ schoolId }).session(session),
        SchoolClass.find({ schoolId }).session(session),
        Subject.find({ schoolId }).session(session),
      ]);
      snapshot.assignments = rows.map((r) => ({
        sessionName:
          sessions.find((s) => s.id === String(r.sessionId))?.name || "",
        termName: r.termId
          ? terms.find((t) => t.id === String(r.termId))?.name || ""
          : "All session terms",
        className: classes.find((c) => c.id === String(r.classId))?.name || "",
        arm: r.arm,
        subjectName: r.subjectId
          ? subjects.find((s) => s.id === String(r.subjectId))?.name || ""
          : "",
        kind: r.kind,
        attendance: staff.attendanceGrants.some(
          (g) =>
            String(g.classId) === String(r.classId) &&
            g.arm === r.arm &&
            String(g.sessionId) === String(r.sessionId) &&
            (!g.termId || !r.termId || String(g.termId) === String(r.termId)),
        ),
      }));
    }
  }
  if (administrator)
    snapshot.administrator = pick(administrator, "name email phone isActive");
  if (input.includeMedical && (application || student)) {
    const medical = await StudentMedical.findOne({
      schoolId,
      ...(application
        ? { applicationId: application._id }
        : { studentId: student._id }),
    }).session(session);
    snapshot.medical = medical
      ? pick(
          medical,
          "allergies conditions safetyInstructions emergencyName emergencyPhone emergencyRelationship",
        )
      : {};
  }
  return snapshot;
}
export async function createApplicationDocument(
  req,
  applicationId,
  reference,
  input,
  session,
) {
  const snapshot = blankDocument(req.school);
  snapshot.sessionName = (
    await owned(AcademicSession, req.user.schoolId, input.sessionId, session)
  ).name;
  snapshot.className = input.classId
    ? (await owned(SchoolClass, req.user.schoolId, input.classId, session)).name
    : "";
  snapshot.arm = input.arm;
  const document = (
    await IssuedDocument.create(
      [
        {
          schoolId: req.user.schoolId,
          reference,
          type: "student_application",
          requestKey: `application:${input.requestKey}`,
          fingerprint: fingerprint(input),
          applicationId,
          snapshot,
          issuedBy: req.user._id,
        },
      ],
      { session },
    )
  )[0];
  await admissionsAudit(
    req,
    "document_generated",
    { documentId: document._id, applicationId },
    { reference, type: document.type, templateVersion: 1 },
    "Application issued",
    session,
  );
  return document;
}
export function issueDocument(req, input) {
  return mutateConfiguration(req.user.schoolId, async (session) => {
    req.school = await School.findById(req.user.schoolId).session(session);
    const digest = fingerprint(input);
    const existing = await IssuedDocument.findOne({
      schoolId: req.user.schoolId,
      requestKey: input.requestKey,
    }).session(session);
    if (existing) {
      if (existing.fingerprint !== digest)
        fail(409, "This request key already issued a different document.");
      return { document: existing, reused: true };
    }
    if (input.type === "student_application")
      fail(
        400,
        "Generate tracked student applications through Admission Applications.",
      );
    const docId = new mongoose.Types.ObjectId();
    const snapshot = await sourceSnapshot(req, input, session);
    const reference = await allocateReference(
      req.school,
      documentTypes[input.type].code,
      docId,
      session,
    );
    const document = (
      await IssuedDocument.create(
        [
          {
            _id: docId,
            schoolId: req.user.schoolId,
            reference,
            type: input.type,
            requestKey: input.requestKey,
            fingerprint: digest,
            applicationId: input.applicationId || undefined,
            studentId: input.studentId || undefined,
            guardianId: input.guardianId || undefined,
            staffId: input.staffId || undefined,
            snapshot,
            issuedBy: req.user._id,
          },
        ],
        { session },
      )
    )[0];
    await admissionsAudit(
      req,
      "document_generated",
      {
        documentId: docId,
        ...(input.applicationId ? { applicationId: input.applicationId } : {}),
      },
      {
        reference,
        type: input.type,
        templateVersion: 1,
        prefilled: input.prefill,
        includesMedical: Boolean(snapshot.medical),
      },
      "Document issued",
      session,
    );
    return { document, reused: false };
  });
}
export async function ownedDocument(req, id, session = null) {
  return owned(IssuedDocument, req.user.schoolId, id, session);
}
export function preparePrint(req, id, input) {
  return mutateConfiguration(req.user.schoolId, async (session) => {
    const document = await ownedDocument(req, id, session);
    let snapshot = document.snapshot;
    if (input.prefill && document.applicationId) {
      const latest = await sourceSnapshot(
        req,
        {
          type: document.type,
          applicationId: document.applicationId,
          prefill: true,
          includeMedical: input.includeMedical,
        },
        session,
      );
      snapshot = {
        ...latest,
        school: document.snapshot.school,
        privacyNotice: document.snapshot.privacyNotice,
        checklist: document.snapshot.checklist,
      };
    }
    const action = document.printRequests
      ? "document_reprint_requested"
      : "document_print_requested";
    document.printRequests++;
    await document.save({ session });
    await admissionsAudit(
      req,
      action,
      {
        documentId: document._id,
        ...(document.applicationId
          ? { applicationId: document.applicationId }
          : {}),
      },
      {
        reference: document.reference,
        templateVersion: document.templateVersion,
        sourceRevision: snapshot.sourceRevision,
        includesMedical: Boolean(snapshot.medical),
        physicalPrintConfirmed: false,
      },
      "Browser print preparation requested; completion is not verified",
      session,
    );
    const application = document.applicationId
      ? await AdmissionApplication.findOne({
          _id: document.applicationId,
          schoolId: req.user.schoolId,
        })
          .select("status")
          .session(session)
      : null;
    return {
      document: {
        ...document.toObject(),
        snapshot,
        applicationStatus: application?.status,
      },
      physicalPrintConfirmed: false,
    };
  });
}
