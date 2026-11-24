import mongoose from "mongoose";
const schema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },
    employeeId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 40,
    },
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
    },
    phone: { type: String, required: true, trim: true, maxlength: 30 },
    gender: {
      type: String,
      enum: ["female", "male", "other", "not_specified"],
      default: "not_specified",
    },
    address: { type: String, trim: true, maxlength: 300, default: "" },
    dateOfBirth: { type: Date, default: null },
    employmentDate: { type: Date, required: true },
    department: { type: String, required: true, trim: true, maxlength: 80 },
    designation: { type: String, required: true, trim: true, maxlength: 100 },
    employmentType: {
      type: String,
      enum: ["full_time", "part_time", "contract", "temporary", "intern"],
      required: true,
    },
    category: {
      type: String,
      enum: ["teaching", "non_teaching"],
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      required: true,
      default: "active",
    },
    classIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "SchoolClass" }],
    subjectIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Subject" }],
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
  { schoolId: 1, employeeId: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } },
);
schema.index({ schoolId: 1, status: 1, category: 1, createdAt: -1 });
export const Staff = mongoose.model("Staff", schema);
