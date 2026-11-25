import { School } from "../models/School.js";
import mongoose from "mongoose";
import { AdmissionApplication, StudentMedical } from "../models/Admissions.js";
import { AcademicSession } from "../models/AcademicSession.js";
import { SchoolClass } from "../models/SchoolClass.js";
import { Guardian } from "../models/Guardian.js";
import { studentInput } from "../validation/student.js";
import { guardianInput } from "../validation/guardian.js";
import { saveStudent, ownedStudent, studentDetails } from "./student.js";
import { saveGuardian, changeRelationship } from "./guardian.js";
import { mutateConfiguration, fail } from "./schoolConfiguration.js";
import {
  allocateReference,
  admissionsAudit,
  fingerprint,
} from "./admissionCommon.js";
import { createApplicationDocument, documentSettings } from "./documents.js";
export const transitions = {
  awaiting_form: ["form_received", "withdrawn", "cancelled"],
  form_received: ["under_review", "withdrawn", "cancelled"],
  under_review: [
    "form_received",
    "approved",
    "rejected",
    "withdrawn",
    "cancelled",
  ],
  approved: ["under_review", "withdrawn", "cancelled"],
  rejected: ["under_review"],
  withdrawn: [],
  cancelled: [],
  enrolled: [],
};
export const applicationView = (record) => {
  const value = record.toObject ? record.toObject() : { ...record };
  delete value.fingerprint;
  delete value.requestKey;
  delete value.enrolmentFingerprint;
  delete value.__v;
  return value;
};
const workflowState = (app) => ({
  reference: app.reference,
  status: app.status,
  revision: app.revision,
  sessionId: app.sessionId,
  classId: app.classId,
  arm: app.arm,
  studentId: app.studentId,
});
export async function ownedApplication(req, id, session = null) {
  const app = await AdmissionApplication.findOne({
    _id: id,
    schoolId: req.user.schoolId,
  }).session(session);
  if (!app) fail(404, "Application not found.");
  return app;
}
async function validateIntention(req, input, session, complete = false) {
  if (
    !(await AcademicSession.exists({
      _id: input.sessionId,
      schoolId: req.user.schoolId,
    }).session(session))
  )
    fail(400, "Choose an academic session in your school.");
  if (!input.classId) {
    if (complete || input.arm)
      fail(
        400,
        "Choose the intended class before selecting an arm or approving admission.",
      );
    return;
  }
  const c = await SchoolClass.findOne({
    _id: input.classId,
    schoolId: req.user.schoolId,
    status: "active",
  }).session(session);
  if (
    !c ||
    (input.arm
      ? !c.arms.includes(input.arm) || c.inactiveArms.includes(input.arm)
      : complete && c.arms.length)
  )
    fail(400, "Choose an active class and a valid active arm in your school.");
}
export function createApplication(req, input) {
  return mutateConfiguration(req.user.schoolId, async (session) => {
    const existing = await AdmissionApplication.findOne({
      schoolId: req.user.schoolId,
      requestKey: input.requestKey,
    }).session(session);
    if (existing) {
      if (existing.fingerprint !== fingerprint(input))
        fail(
          409,
          "This request key already generated a different application.",
        );
      return { application: applicationView(existing), reused: true };
    }
    await validateIntention(req, input, session);
    req.school = await School.findById(req.user.schoolId).session(session);
    const id = new mongoose.Types.ObjectId(),
      reference = await allocateReference(req.school, "APP", id, session);
    const document = await createApplicationDocument(
      req,
      id,
      reference,
      input,
      session,
    );
    const application = (
      await AdmissionApplication.create(
        [
          {
            _id: id,
            schoolId: req.user.schoolId,
            reference,
            requestKey: input.requestKey,
            fingerprint: fingerprint(input),
            documentId: document._id,
            sessionId: input.sessionId,
            classId: input.classId || undefined,
            arm: input.arm,
            checklist: documentSettings(req.school).checklist,
            createdBy: req.user._id,
            updatedBy: req.user._id,
          },
        ],
        { session },
      )
    )[0];
    await admissionsAudit(
      req,
      "application_created",
      { applicationId: id, documentId: document._id },
      workflowState(application),
      "Awaiting completed form",
      session,
    );
    return { application: applicationView(application), reused: false };
  });
}
export function updateApplication(req, id, input) {
  return mutateConfiguration(req.user.schoolId, async (session) => {
    const app = await ownedApplication(req, id, session);
    if (app.revision !== input.revision)
      fail(409, "Application changed. Reload before saving.");
    if (
      !["awaiting_form", "form_received", "under_review"].includes(app.status)
    )
      fail(
        409,
        "Reopen an approved or rejected application for review before editing. Enrolled, withdrawn and cancelled applications are retained read-only.",
      );
    await validateIntention(req, input, session);
    for (const guardian of input.guardians)
      if (
        guardian.guardianId &&
        !(await Guardian.exists({
          _id: guardian.guardianId,
          schoolId: req.user.schoolId,
          status: "active",
        }).session(session))
      )
        fail(400, "Choose an active guardian record in your school.");
    if (input.receivedDocuments.some((label) => !app.checklist.includes(label)))
      fail(
        400,
        "Choose supporting documents from the application's issued checklist.",
      );
    const before = workflowState(app);
    app.set({
      sessionId: input.sessionId,
      classId: input.classId || null,
      arm: input.arm,
      student: input.student,
      guardians: input.guardians,
      receivedDocuments: input.receivedDocuments,
      revision: app.revision + 1,
      updatedBy: req.user._id,
    });
    await app.save({ session });
    await admissionsAudit(
      req,
      "application_draft_saved",
      { applicationId: app._id },
      {
        before,
        after: workflowState(app),
        fields: ["student", "guardians", "receivedDocuments", "placement"],
      },
      "Draft data saved; workflow status unchanged",
      session,
    );
    return applicationView(app);
  });
}
export function transitionApplication(req, id, input) {
  return mutateConfiguration(req.user.schoolId, async (session) => {
    const app = await ownedApplication(req, id, session);
    if (app.revision !== input.revision)
      fail(409, "Application changed. Reload before changing its status.");
    if (!transitions[app.status].includes(input.status))
      fail(409, "This application status transition is not permitted.");
    if (input.status === "approved") {
      await validateIntention(req, app, session, true);
      if (!app.student.firstName || !app.student.lastName)
        fail(
          400,
          "Record the student's first name and surname before approving admission.",
        );
    }
    const before = workflowState(app);
    app.status = input.status;
    app.revision++;
    app.updatedBy = req.user._id;
    await app.save({ session });
    await admissionsAudit(
      req,
      "application_status_changed",
      { applicationId: app._id },
      { before, after: workflowState(app) },
      input.reason,
      session,
    );
    return applicationView(app);
  });
}
export function enrolApplication(req, id, input) {
  return mutateConfiguration(req.user.schoolId, async (transaction) => {
    const app = await AdmissionApplication.findOne({
      _id: id,
      schoolId: req.user.schoolId,
    })
      .select("+enrolmentFingerprint")
      .session(transaction);
    if (!app) fail(404, "Application not found.");
    const digest = fingerprint({
      applicationId: String(id),
      admissionDate: input.admissionDate,
      classId: input.classId,
      arm: input.arm,
    });
    if (app.status === "enrolled") {
      if (app.enrolmentFingerprint !== digest)
        fail(
          409,
          "This application was already enrolled with different placement or admission details.",
        );
      return {
        student: studentDetails(
          await ownedStudent(req.user.schoolId, app.studentId, transaction),
        ),
        application: applicationView(app),
        reused: true,
      };
    }
    if (
      app.classId &&
      (String(app.classId) !== input.classId || app.arm !== input.arm)
    )
      fail(
        409,
        "Reopen the application for review before changing its approved class or arm.",
      );
    if (app.status !== "approved")
      fail(409, "Only approved applications can be enrolled.");
    if (app.revision !== input.revision)
      fail(409, "Application changed. Reload before enrolling.");
    if (
      !app.guardians.length ||
      app.guardians.some(
        (g) => !g.verified || (!g.guardianId && !g.createNewConfirmed),
      )
    )
      fail(
        400,
        "Verify every guardian's identity and explicitly select an existing record or confirm a new record before enrolment.",
      );
    req.school = await School.findById(req.user.schoolId).session(transaction);
    const admissionNumber = await allocateReference(
      req.school,
      "STD",
      app._id,
      transaction,
    );
    const { nationality: _nationality, ...studentData } = app.student;
    const validated = studentInput.parse({
      ...studentData,
      admissionNumber,
      admissionDate: input.admissionDate,
      sessionId: String(app.sessionId),
      classId: input.classId,
      arm: input.arm,
      admissionStatus: "admitted",
    });
    const student = await saveStudent({
      schoolId: req.user.schoolId,
      userId: req.user._id,
      input: validated,
      transaction,
      application: app,
    });
    const ids = [];
    for (const item of app.guardians) {
      let guardian;
      if (item.guardianId) {
        guardian = await Guardian.findOne({
          _id: item.guardianId,
          schoolId: req.user.schoolId,
          status: "active",
        }).session(transaction);
        if (!guardian)
          fail(400, "A matched guardian is unavailable or inactive.");
      } else {
        const {
          guardianId: _id,
          verified: _verified,
          createNewConfirmed: _confirmed,
          relationship: _relationship,
          ...data
        } = item;
        guardian = await saveGuardian({
          schoolId: req.user.schoolId,
          userId: req.user._id,
          input: guardianInput.parse(data),
          transaction,
        });
      }
      await changeRelationship({
        schoolId: req.user.schoolId,
        userId: req.user._id,
        guardianId: guardian._id,
        studentId: student._id,
        relationship: item.relationship,
        operation: "create",
        transaction,
      });
      ids.push(guardian._id);
    }
    await StudentMedical.updateOne(
      { schoolId: req.user.schoolId, applicationId: app._id },
      { $set: { studentId: student._id } },
      { session: transaction },
    );
    const before = workflowState(app);
    app.set({
      status: "enrolled",
      studentId: student._id,
      guardianIds: ids,
      classId: input.classId,
      arm: input.arm,
      enrolmentFingerprint: digest,
      revision: app.revision + 1,
      updatedBy: req.user._id,
    });
    await app.save({ session: transaction });
    await admissionsAudit(
      req,
      "application_enrolled",
      { applicationId: app._id, documentId: app.documentId },
      {
        before,
        after: workflowState(app),
        admissionNumber,
        guardianIds: ids,
        verifiedBy: req.user._id,
      },
      "Approved application converted to a registered student; no login account created",
      transaction,
    );
    return {
      student: studentDetails(student),
      application: applicationView(app),
      reused: false,
    };
  });
}
export async function medicalOwner(req, kind, id, session = null) {
  if (kind === "application") {
    const app = await ownedApplication(req, id, session);
    return {
      applicationId: app._id,
      ...(app.studentId ? { studentId: app.studentId } : {}),
    };
  }
  const student = await ownedStudent(req.user.schoolId, id, session);
  return {
    studentId: student._id,
    ...(student.applicationId ? { applicationId: student.applicationId } : {}),
  };
}
export async function getMedical(req, kind, id) {
  const links = await medicalOwner(req, kind, id);
  const record = await StudentMedical.findOne({
    schoolId: req.user.schoolId,
    ...(kind === "application"
      ? { applicationId: links.applicationId }
      : { studentId: links.studentId }),
  }).select("-schoolId -__v -updatedBy");
  await admissionsAudit(
    req,
    "medical_information_viewed",
    links.applicationId ? { applicationId: links.applicationId } : {},
    { studentId: links.studentId, medicalRecordId: record?._id },
    "Authorised administrator viewed safety information",
  );
  return record;
}
export function saveMedical(req, kind, id, input) {
  return mutateConfiguration(req.user.schoolId, async (session) => {
    const links = await medicalOwner(req, kind, id, session);
    let record = await StudentMedical.findOne({
      schoolId: req.user.schoolId,
      ...(kind === "application"
        ? { applicationId: links.applicationId }
        : { studentId: links.studentId }),
    }).session(session);
    if ((record?.revision || 0) !== input.revision)
      fail(409, "Medical information changed. Reload before saving.");
    const { revision: _revision, reason, ...data } = input;
    if (record) {
      record.set({
        ...data,
        revision: record.revision + 1,
        updatedBy: req.user._id,
      });
      await record.save({ session });
    } else
      record = (
        await StudentMedical.create(
          [
            {
              schoolId: req.user.schoolId,
              ...links,
              ...data,
              updatedBy: req.user._id,
            },
          ],
          { session },
        )
      )[0];
    await admissionsAudit(
      req,
      "medical_information_updated",
      links.applicationId ? { applicationId: links.applicationId } : {},
      {
        studentId: links.studentId,
        revision: record.revision,
        medicalRecordId: record._id,
      },
      reason,
      session,
    );
    return { revision: record.revision, ...data };
  });
}
