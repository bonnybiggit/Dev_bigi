import mongoose from "mongoose";
const schema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
    guardianId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Guardian",
      required: true,
    },
    relationship: {
      type: String,
      enum: ["father", "mother", "guardian", "other"],
      required: true,
    },
    isActive: { type: Boolean, default: true, required: true },
    removedAt: { type: Date, default: null },
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
  },
  { timestamps: true },
);
schema.index({ schoolId: 1, guardianId: 1, studentId: 1 }, { unique: true });
schema.index({ schoolId: 1, studentId: 1, isActive: 1 });
export const StudentGuardian = mongoose.model("StudentGuardian", schema);
