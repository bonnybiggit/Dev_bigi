import mongoose from "mongoose";
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      unique: true,
    },
    passwordHash: { type: String, required: true, select: false },
    phone: { type: String, trim: true, maxlength: 30 },
    mustChangePassword: { type: Boolean, default: false },
    sessionVersion: { type: Number, default: 0, select: false },
    role: {
      type: String,
      enum: ["super_admin", "school_admin", "teacher", "student"],
      required: true,
    },
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      default: null,
    },
    isActive: { type: Boolean, default: true },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      default: null,
    },
    staffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Staff",
      default: null,
    },
  },
  { timestamps: true },
);
userSchema.index({ schoolId: 1, role: 1 });
userSchema.index(
  { schoolId: 1, studentId: 1 },
  { unique: true, partialFilterExpression: { role: "student" } },
);
userSchema.index(
  { schoolId: 1, staffId: 1 },
  { unique: true, partialFilterExpression: { role: "teacher" } },
);
userSchema.pre("validate", function () {
  if (
    ["school_admin", "teacher", "student"].includes(this.role) &&
    !this.schoolId
  )
    this.invalidate("schoolId", "School administrators require a schoolId");
  if (this.role === "super_admin" && this.schoolId)
    this.invalidate("schoolId", "Super administrators are platform accounts");
  if (this.role === "teacher" && !this.staffId)
    this.invalidate("staffId", "Teachers require a linked staff record");
  if (this.role !== "teacher" && this.staffId)
    this.invalidate("staffId", "Only teacher accounts may carry staffId");
  if (this.role === "student" && !this.studentId)
    this.invalidate("studentId", "Students require a linked student record");
  if (this.role !== "student" && this.studentId)
    this.invalidate("studentId", "Only students may carry studentId");
});
export const User = mongoose.model("User", userSchema);
