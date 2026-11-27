import mongoose from "mongoose";

// Immutable versions preserve logos referenced by previously issued documents.
const schema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
      immutable: true,
    },
    contentType: {
      type: String,
      required: true,
      enum: ["image/png", "image/jpeg"],
      immutable: true,
    },
    data: { type: Buffer, required: true, select: false, immutable: true },
  },
  { timestamps: true },
);
export const SchoolLogo = mongoose.model("SchoolLogo", schema);
