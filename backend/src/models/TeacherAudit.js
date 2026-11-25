import mongoose from "mongoose";
const schema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, required: true },
    staffId: { type: mongoose.Schema.Types.ObjectId, required: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, required: true },
    action: {
      type: String,
      enum: [
        "attendance_grants_updated",
        "contact_updated",
        "assignment_created",
        "assignment_updated",
        "assignment_revoked",
        "assignment_transferred",
        "assignment_copied",
        "legacy_adopted",
      ],
      required: true,
    },
    before: mongoose.Schema.Types.Mixed,
    assignmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "TeacherAssignment",
    },
    reason: { type: String, maxlength: 500, default: "" },
    after: mongoose.Schema.Types.Mixed,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
schema.index({ schoolId: 1, staffId: 1, createdAt: -1 });
export const TeacherAudit = mongoose.model("TeacherAudit", schema);
