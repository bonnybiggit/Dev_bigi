import mongoose from "mongoose";
const schema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AcademicSession",
      required: true,
    },
    name: {
      type: String,
      enum: ["First Term", "Second Term", "Third Term"],
      required: true,
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "inactive",
      required: true,
    },
  },
  { timestamps: true },
);
schema.index({ schoolId: 1, sessionId: 1, name: 1 }, { unique: true });
schema.index(
  { schoolId: 1, sessionId: 1 },
  { unique: true, partialFilterExpression: { status: "active" } },
);
export const AcademicTerm = mongoose.model("AcademicTerm", schema);
