import mongoose from "mongoose";
const schema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },
    admissionNumber: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 40,
    },
    firstName: { type: String, required: true, trim: true, maxlength: 60 },
    middleName: { type: String, trim: true, maxlength: 60, default: "" },
    lastName: { type: String, required: true, trim: true, maxlength: 60 },
    dateOfBirth: { type: Date, required: true },
    gender: {
      type: String,
      enum: ["female", "male", "other", "not_specified"],
      required: true,
    },
    address: { type: String, required: true, trim: true, maxlength: 300 },
    admissionDate: { type: Date, required: true },
    previousSchool: { type: String, trim: true, maxlength: 160, default: "" },
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AcademicSession",
      required: true,
    },
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SchoolClass",
      required: true,
    },
    arm: { type: String, trim: true, maxlength: 20, default: "" },
    admissionStatus: {
      type: String,
      enum: ["pending", "admitted", "waitlisted", "rejected"],
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive", "archived"],
      default: "active",
      required: true,
    },
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
schema.index(
  { schoolId: 1, admissionNumber: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } },
);
schema.index({ schoolId: 1, sessionId: 1, classId: 1, arm: 1, status: 1 });
export const Student = mongoose.model("Student", schema);
