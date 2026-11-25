import mongoose from "mongoose";
const schoolSchema = new mongoose.Schema(
  {
    studentFinanceEnabled: { type: Boolean, default: false },
    documentPrefix: { type: String, default: "SCH", maxlength: 12 },
    admissionPrivacyNotice: { type: String, default: "", maxlength: 2000 },
    applicationChecklist: { type: [String], default: undefined },
    name: { type: String, required: true, trim: true, maxlength: 160 },
    city: { type: String, required: true, trim: true },
    country: { type: String, required: true, trim: true },
    address: { type: String, trim: true, maxlength: 300, default: "" },
    phone: { type: String, trim: true, maxlength: 30, default: "" },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 254,
      default: "",
    },
    logoUrl: { type: String, maxlength: 2048, default: "" },
    configurationRevision: { type: Number, default: 0, select: false },
    schoolType: {
      type: String,
      enum: ["Nursery", "Primary", "Nursery and Primary", "Secondary", "Other"],
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "suspended"],
      default: "active",
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true, optimisticConcurrency: true },
);
schoolSchema.index(
  { name: 1, city: 1, country: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } },
);
export const School = mongoose.model("School", schoolSchema);
