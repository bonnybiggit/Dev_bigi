import mongoose from "mongoose";
const schema = new mongoose.Schema(
  {
    schoolId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    arms: { type: [String], default: [] },
    inactiveArms: { type: [String], default: [] },
    capacity: { type: Number, required: true, min: 1, max: 10000 },
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
  { schoolId: 1, name: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } },
);
export const SchoolClass = mongoose.model("SchoolClass", schema);
