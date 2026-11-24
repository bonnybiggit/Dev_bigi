import mongoose from "mongoose";
const schema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 40 },
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
schema.index(
  { schoolId: 1, name: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } },
);
schema.index(
  { schoolId: 1 },
  { unique: true, partialFilterExpression: { status: "active" } },
);
export const AcademicSession = mongoose.model("AcademicSession", schema);
