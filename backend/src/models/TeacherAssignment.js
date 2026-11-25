import mongoose from "mongoose";
const ref = (name) => ({
  type: mongoose.Schema.Types.ObjectId,
  ref: name,
  required: true,
});
const schema = new mongoose.Schema(
  {
    schoolId: ref("School"),
    staffId: ref("Staff"),
    sessionId: ref("AcademicSession"),
    termId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AcademicTerm",
      default: null,
    },
    classId: ref("SchoolClass"),
    arm: { type: String, default: "", maxlength: 20 },
    kind: { type: String, enum: ["teaching", "class_teacher"], required: true },
    subjectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subject",
      default: null,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
      required: true,
    },
    revision: { type: Number, default: 1, required: true },
    sourceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TeacherAssignment",
      default: null,
    },
    createdBy: ref("User"),
    updatedBy: ref("User"),
  },
  { timestamps: true },
);
schema.index(
  {
    schoolId: 1,
    staffId: 1,
    sessionId: 1,
    termId: 1,
    classId: 1,
    arm: 1,
    kind: 1,
    subjectId: 1,
  },
  { unique: true, partialFilterExpression: { status: "active" } },
);
schema.index(
  { schoolId: 1, sessionId: 1, termId: 1, classId: 1, arm: 1, kind: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "active", kind: "class_teacher" },
  },
);
schema.index({ schoolId: 1, staffId: 1, status: 1 });
schema.pre("validate", function () {
  if ((this.kind === "teaching") !== Boolean(this.subjectId))
    this.invalidate("subjectId", "Only teaching assignments require a subject");
});
export const TeacherAssignment = mongoose.model("TeacherAssignment", schema);
