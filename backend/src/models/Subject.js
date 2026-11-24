import mongoose from "mongoose";
const schema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },
    classId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SchoolClass",
      required: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    code: { type: String, trim: true, maxlength: 30, default: "" },
    description: { type: String, trim: true, maxlength: 1000, default: "" },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
      required: true,
    },
  },
  { timestamps: true },
);
schema.index(
  { schoolId: 1, classId: 1, name: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } },
);
export const Subject = mongoose.model("Subject", schema);
