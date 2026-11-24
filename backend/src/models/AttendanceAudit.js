import mongoose from "mongoose";
const schema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },
    attendanceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Attendance",
      required: true,
    },
    previousStatus: {
      type: String,
      enum: ["present", "absent", "late", "excused", null],
      default: null,
    },
    status: {
      type: String,
      enum: ["present", "absent", "late", "excused"],
      required: true,
    },
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    actorName: { type: String, required: true },
    reason: { type: String, maxlength: 300, default: "" },
    revision: { type: Number, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
schema.index({ schoolId: 1, attendanceId: 1, revision: 1 }, { unique: true });
export const AttendanceAudit = mongoose.model("AttendanceAudit", schema);
