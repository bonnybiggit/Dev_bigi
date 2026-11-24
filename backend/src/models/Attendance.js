import mongoose from "mongoose";
const schema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },
    kind: { type: String, enum: ["student", "staff"], required: true },
    personId: { type: mongoose.Schema.Types.ObjectId, required: true },
    date: { type: Date, required: true },
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AcademicSession",
      default: null,
    },
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SchoolClass",
      default: null,
    },
    arm: { type: String, default: "" },
    personName: { type: String, required: true },
    identifier: { type: String, required: true },
    sessionName: { type: String, default: "" },
    className: { type: String, default: "" },
    category: { type: String, default: "" },
    status: {
      type: String,
      enum: ["present", "absent", "late", "excused"],
      required: true,
    },
    revision: { type: Number, required: true, default: 1 },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    createdByName: { type: String, required: true },
    updatedByName: { type: String, required: true },
  },
  { timestamps: true },
);
schema.index({ schoolId: 1, kind: 1, personId: 1, date: 1 }, { unique: true });
schema.index({
  schoolId: 1,
  kind: 1,
  date: 1,
  sessionId: 1,
  classId: 1,
  arm: 1,
});
export const Attendance = mongoose.model("Attendance", schema);
