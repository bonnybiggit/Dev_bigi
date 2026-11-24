import mongoose from "mongoose";
const schema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 254,
      default: "",
    },
    primaryPhone: { type: String, required: true, trim: true, maxlength: 30 },
    alternativePhone: { type: String, trim: true, maxlength: 30, default: "" },
    address: { type: String, required: true, trim: true, maxlength: 300 },
    occupation: { type: String, trim: true, maxlength: 100, default: "" },
    gender: {
      type: String,
      enum: ["female", "male", "other", "not_specified"],
      default: "not_specified",
    },
    emergencyContactName: {
      type: String,
      trim: true,
      maxlength: 120,
      default: "",
    },
    emergencyContactPhone: {
      type: String,
      trim: true,
      maxlength: 30,
      default: "",
    },
    emergencyContactRelationship: {
      type: String,
      trim: true,
      maxlength: 60,
      default: "",
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
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
schema.index({ schoolId: 1, status: 1, createdAt: -1 });
export const Guardian = mongoose.model("Guardian", schema);
