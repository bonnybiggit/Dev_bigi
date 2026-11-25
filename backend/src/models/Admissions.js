import mongoose from "mongoose";
const ref = (name, required = true) => ({
  type: mongoose.Schema.Types.ObjectId,
  ref: name,
  required,
});
const immutableText = { type: String, required: true, immutable: true };
const counterSchema = new mongoose.Schema({
  schoolId: ref("School"),
  kind: String,
  year: Number,
  sequence: { type: Number, default: 0 },
});
counterSchema.index({ schoolId: 1, kind: 1, year: 1 }, { unique: true });
export const DocumentCounter = mongoose.model("DocumentCounter", counterSchema);
const referenceSchema = new mongoose.Schema(
  {
    schoolId: { ...ref("School"), immutable: true },
    reference: immutableText,
    kind: immutableText,
    year: { type: Number, immutable: true },
    sequence: { type: Number, immutable: true },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
referenceSchema.index({ schoolId: 1, reference: 1 }, { unique: true });
referenceSchema.index({ schoolId: 1, kind: 1, targetId: 1 }, { unique: true });
export const ReferenceReservation = mongoose.model(
  "ReferenceReservation",
  referenceSchema,
);
const documentSchema = new mongoose.Schema(
  {
    schoolId: { ...ref("School"), immutable: true },
    reference: immutableText,
    type: immutableText,
    templateVersion: { type: Number, default: 1, immutable: true },
    requestKey: immutableText,
    fingerprint: immutableText,
    applicationId: ref("AdmissionApplication", false),
    studentId: ref("Student", false),
    guardianId: ref("Guardian", false),
    staffId: ref("Staff", false),
    snapshot: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
      immutable: true,
    },
    issuedBy: { ...ref("User"), immutable: true },
    status: { type: String, enum: ["issued", "cancelled"], default: "issued" },
    printRequests: { type: Number, default: 0 },
    revision: { type: Number, default: 1 },
  },
  { timestamps: true },
);
documentSchema.index({ schoolId: 1, reference: 1 }, { unique: true });
documentSchema.index({ schoolId: 1, requestKey: 1 }, { unique: true });
documentSchema.index({ schoolId: 1, type: 1, createdAt: -1 });
export const IssuedDocument = mongoose.model("IssuedDocument", documentSchema);
export const applicationStatuses = [
  "awaiting_form",
  "form_received",
  "under_review",
  "approved",
  "rejected",
  "withdrawn",
  "cancelled",
  "enrolled",
];
const applicationSchema = new mongoose.Schema(
  {
    schoolId: { ...ref("School"), immutable: true },
    reference: immutableText,
    requestKey: immutableText,
    fingerprint: immutableText,
    documentId: { ...ref("IssuedDocument"), immutable: true },
    sessionId: ref("AcademicSession"),
    classId: ref("SchoolClass", false),
    arm: { type: String, default: "" },
    student: { type: mongoose.Schema.Types.Mixed, default: {} },
    guardians: { type: [mongoose.Schema.Types.Mixed], default: [] },
    checklist: { type: [String], immutable: true },
    receivedDocuments: [String],
    status: {
      type: String,
      enum: applicationStatuses,
      default: "awaiting_form",
    },
    revision: { type: Number, default: 1 },
    studentId: ref("Student", false),
    guardianIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Guardian" }],
    enrolmentFingerprint: { type: String, select: false },
    createdBy: ref("User"),
    updatedBy: ref("User"),
  },
  { timestamps: true },
);
applicationSchema.index({ schoolId: 1, reference: 1 }, { unique: true });
applicationSchema.index({ schoolId: 1, requestKey: 1 }, { unique: true });
applicationSchema.index({
  schoolId: 1,
  status: 1,
  sessionId: 1,
  classId: 1,
  arm: 1,
  createdAt: -1,
});
applicationSchema.index({ schoolId: 1, studentId: 1 });
export const AdmissionApplication = mongoose.model(
  "AdmissionApplication",
  applicationSchema,
);
const medicalSchema = new mongoose.Schema(
  {
    schoolId: ref("School"),
    applicationId: ref("AdmissionApplication", false),
    studentId: ref("Student", false),
    allergies: { type: String, maxlength: 1000, default: "" },
    conditions: { type: String, maxlength: 1000, default: "" },
    safetyInstructions: { type: String, maxlength: 1000, default: "" },
    emergencyName: { type: String, maxlength: 120, default: "" },
    emergencyPhone: { type: String, maxlength: 30, default: "" },
    emergencyRelationship: { type: String, maxlength: 60, default: "" },
    revision: { type: Number, default: 1 },
    updatedBy: ref("User"),
  },
  { timestamps: true },
);
medicalSchema.index(
  { schoolId: 1, applicationId: 1 },
  {
    unique: true,
    partialFilterExpression: { applicationId: { $type: "objectId" } },
  },
);
medicalSchema.index(
  { schoolId: 1, studentId: 1 },
  {
    unique: true,
    partialFilterExpression: { studentId: { $type: "objectId" } },
  },
);
export const StudentMedical = mongoose.model("StudentMedical", medicalSchema);
const auditSchema = new mongoose.Schema(
  {
    schoolId: ref("School"),
    applicationId: ref("AdmissionApplication", false),
    documentId: ref("IssuedDocument", false),
    actorId: ref("User"),
    action: { type: String, required: true },
    reason: { type: String, default: "", maxlength: 500 },
    details: mongoose.Schema.Types.Mixed,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
auditSchema.index({ schoolId: 1, applicationId: 1, createdAt: -1 });
auditSchema.index({ schoolId: 1, documentId: 1, createdAt: -1 });
export const AdmissionAudit = mongoose.model("AdmissionAudit", auditSchema);
export const initialiseAdmissions = () =>
  Promise.all(
    [
      DocumentCounter,
      ReferenceReservation,
      IssuedDocument,
      AdmissionApplication,
      StudentMedical,
      AdmissionAudit,
    ].map((m) => m.init()),
  );
