import mongoose from "mongoose";
const schema = new mongoose.Schema(
  {
    schoolId: { type: mongoose.Schema.Types.ObjectId, required: true },
    studentId: mongoose.Schema.Types.ObjectId,
    actorId: { type: mongoose.Schema.Types.ObjectId, required: true },
    action: { type: String, required: true },
    details: mongoose.Schema.Types.Mixed,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
schema.index({ schoolId: 1, studentId: 1, createdAt: -1 });
export const StudentPortalAudit = mongoose.model("StudentPortalAudit", schema);
