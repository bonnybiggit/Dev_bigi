import mongoose from "mongoose";
const ref = (model) => ({
  type: mongoose.Schema.Types.ObjectId,
  ref: model,
  required: true,
});
const component = new mongoose.Schema(
  { key: String, name: String, maxMarks: Number, weight: Number },
  { _id: false },
);
const grade = new mongoose.Schema(
  { minPercent: Number, grade: String, remark: String },
  { _id: false },
);
const subject = new mongoose.Schema(
  { subjectId: ref("Subject"), name: String },
  { _id: false },
);
const schema = new mongoose.Schema(
  {
    schoolId: ref("School"),
    name: { type: String, required: true },
    sessionId: ref("AcademicSession"),
    termId: ref("AcademicTerm"),
    classId: ref("SchoolClass"),
    sessionName: String,
    termName: String,
    className: String,
    termStartDate: Date,
    termEndDate: Date,
    subjects: [subject],
    components: [component],
    totalMarks: Number,
    gradingScale: [grade],
    positionsEnabled: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ["draft", "submitted", "approved", "published"],
      default: "draft",
    },
    revision: { type: Number, default: 1 },
    configRevision: { type: Number, default: 1 },
    publicationNumber: { type: Number, default: 0 },
    cohortIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Student" }],
  },
  { timestamps: true },
);
schema.index(
  { schoolId: 1, sessionId: 1, termId: 1, classId: 1, name: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } },
);
export const Examination = mongoose.model("Examination", schema);
