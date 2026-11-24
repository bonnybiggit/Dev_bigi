import mongoose from "mongoose";
const ref = (model) => ({
  type: mongoose.Schema.Types.ObjectId,
  ref: model,
  required: true,
});
const schema = new mongoose.Schema(
  {
    schoolId: ref("School"),
    examinationId: ref("Examination"),
    studentId: ref("Student"),
    subjectId: ref("Subject"),
    studentName: String,
    admissionNumber: String,
    arm: { type: String, default: "" },
    subjectName: String,
    scores: { type: mongoose.Schema.Types.Mixed, required: true },
    totalHundredths: Number,
    percentHundredths: Number,
    grade: String,
    remark: String,
    teacherComment: { type: String, default: "" },
    status: {
      type: String,
      enum: ["draft", "submitted", "approved", "published"],
      default: "draft",
    },
    revision: { type: Number, default: 1 },
    createdBy: ref("User"),
    createdByName: String,
    updatedBy: ref("User"),
    updatedByName: String,
  },
  { timestamps: true },
);
schema.index(
  { schoolId: 1, examinationId: 1, studentId: 1, subjectId: 1 },
  { unique: true },
);
export const Result = mongoose.model("Result", schema);
const revisionSchema = new mongoose.Schema(
  {
    schoolId: ref("School"),
    resultId: ref("Result"),
    examinationId: ref("Examination"),
    revision: Number,
    event: String,
    reason: String,
    actorId: ref("User"),
    actorName: String,
    snapshot: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
revisionSchema.index(
  { schoolId: 1, resultId: 1, revision: 1 },
  { unique: true },
);
export const ResultRevision = mongoose.model("ResultRevision", revisionSchema);
const auditSchema = new mongoose.Schema(
  {
    schoolId: ref("School"),
    examinationId: ref("Examination"),
    action: String,
    actorId: ref("User"),
    actorName: String,
    reason: String,
    details: mongoose.Schema.Types.Mixed,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
auditSchema.index({ schoolId: 1, examinationId: 1, createdAt: -1 });
export const ExaminationAudit = mongoose.model("ExaminationAudit", auditSchema);
const commentSchema = new mongoose.Schema(
  {
    schoolId: ref("School"),
    examinationId: ref("Examination"),
    studentId: ref("Student"),
    comment: String,
    actorName: String,
  },
  { timestamps: true },
);
commentSchema.index(
  { schoolId: 1, examinationId: 1, studentId: 1 },
  { unique: true },
);
export const ResultComment = mongoose.model("ResultComment", commentSchema);
const cardSchema = new mongoose.Schema(
  {
    schoolId: ref("School"),
    examinationId: ref("Examination"),
    studentId: ref("Student"),
    publication: Number,
    snapshot: { type: mongoose.Schema.Types.Mixed, required: true },
    publishedBy: ref("User"),
    publishedByName: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
cardSchema.index(
  { schoolId: 1, examinationId: 1, studentId: 1, publication: 1 },
  { unique: true },
);
export const ReportCard = mongoose.model("ReportCard", cardSchema);
