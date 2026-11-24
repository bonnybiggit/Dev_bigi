import mongoose from "mongoose";
const ref = (name, required = true) => ({
  type: mongoose.Schema.Types.ObjectId,
  ref: name,
  required,
});
const amount = (defaultValue = 0) => ({
  type: Number,
  required: true,
  default: defaultValue,
  validate: Number.isSafeInteger,
});
const optionSchema = new mongoose.Schema(
  {
    schoolId: ref("School"),
    kind: { type: String, enum: ["category", "method"], required: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
      required: true,
    },
  },
  { timestamps: true },
);
optionSchema.index(
  { schoolId: 1, kind: 1, name: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } },
);
export const FinanceOption = mongoose.model("FinanceOption", optionSchema);
const lineSchema = new mongoose.Schema(
  {
    categoryId: ref("FinanceOption"),
    categoryName: { type: String, required: true },
    amountMinor: amount(),
    compulsory: { type: Boolean, required: true },
  },
  { _id: false },
);
const structureSchema = new mongoose.Schema(
  {
    schoolId: ref("School"),
    sessionId: ref("AcademicSession"),
    termId: ref("AcademicTerm"),
    classId: ref("SchoolClass"),
    sessionName: String,
    termName: String,
    className: String,
    lines: { type: [lineSchema], required: true },
    revision: { type: Number, required: true, default: 1 },
    isCurrent: { type: Boolean, required: true, default: true },
  },
  { timestamps: true },
);
structureSchema.index(
  { schoolId: 1, sessionId: 1, termId: 1, classId: 1, revision: 1 },
  { unique: true },
);
structureSchema.index(
  { schoolId: 1, sessionId: 1, termId: 1, classId: 1 },
  { unique: true, partialFilterExpression: { isCurrent: true } },
);
export const FeeStructure = mongoose.model("FeeStructure", structureSchema);
const invoiceSchema = new mongoose.Schema(
  {
    schoolId: ref("School"),
    studentId: ref("Student"),
    sessionId: ref("AcademicSession"),
    termId: ref("AcademicTerm"),
    classId: ref("SchoolClass"),
    feeStructureId: ref("FeeStructure"),
    structureRevision: Number,
    reference: { type: String, required: true },
    studentName: String,
    admissionNumber: String,
    sessionName: String,
    termName: String,
    className: String,
    currency: { type: String, default: "NGN", required: true },
    lines: [lineSchema],
    billedMinor: amount(),
    discountMinor: amount(),
    adjustmentMinor: amount(),
    paidMinor: amount(),
    balanceMinor: amount(),
    revision: { type: Number, default: 1, required: true },
    createdBy: ref("User"),
    createdByName: String,
  },
  { timestamps: true },
);
invoiceSchema.index(
  { schoolId: 1, studentId: 1, sessionId: 1, termId: 1 },
  { unique: true },
);
invoiceSchema.index({ schoolId: 1, reference: 1 }, { unique: true });
export const Invoice = mongoose.model("Invoice", invoiceSchema);
const paymentSchema = new mongoose.Schema(
  {
    schoolId: ref("School"),
    invoiceId: ref("Invoice"),
    studentId: ref("Student"),
    reference: { type: String, required: true },
    requestKey: { type: String, required: true },
    fingerprint: { type: String, required: true },
    amountMinor: amount(),
    balanceAfterMinor: amount(),
    periodLabel: String,
    className: String,
    paidOn: { type: Date, required: true },
    methodId: String,
    methodName: String,
    externalReference: { type: String, default: undefined },
    status: {
      type: String,
      enum: ["posted", "reversed"],
      default: "posted",
      required: true,
    },
    invoiceReference: String,
    studentName: String,
    admissionNumber: String,
    createdBy: ref("User"),
    createdByName: String,
    reversalReason: String,
    reversedBy: ref("User", false),
    reversedByName: String,
    reversedAt: Date,
  },
  { timestamps: true },
);
paymentSchema.index({ schoolId: 1, reference: 1 }, { unique: true });
paymentSchema.index({ schoolId: 1, requestKey: 1 }, { unique: true });
paymentSchema.index(
  { schoolId: 1, externalReference: 1 },
  {
    unique: true,
    partialFilterExpression: { externalReference: { $type: "string" } },
  },
);
paymentSchema.index({ schoolId: 1, invoiceId: 1, paidOn: -1 });
export const Payment = mongoose.model("Payment", paymentSchema);
const entrySchema = new mongoose.Schema(
  {
    schoolId: ref("School"),
    invoiceId: ref("Invoice"),
    kind: {
      type: String,
      enum: ["discount", "scholarship", "adjustment"],
      required: true,
    },
    amountMinor: amount(),
    reason: { type: String, required: true },
    requestKey: { type: String, required: true },
    fingerprint: String,
    actorId: ref("User"),
    actorName: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
entrySchema.index({ schoolId: 1, requestKey: 1 }, { unique: true });
export const InvoiceEntry = mongoose.model("InvoiceEntry", entrySchema);
const auditSchema = new mongoose.Schema(
  {
    schoolId: ref("School"),
    entityType: { type: String, required: true },
    entityId: { type: mongoose.Schema.Types.ObjectId, required: true },
    action: { type: String, required: true },
    actorId: ref("User"),
    actorName: String,
    details: { type: mongoose.Schema.Types.Mixed, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
auditSchema.index({ schoolId: 1, entityId: 1, createdAt: -1 });
export const FinanceAudit = mongoose.model("FinanceAudit", auditSchema);
export const initializeFinance = () =>
  Promise.all(
    [
      FinanceOption,
      FeeStructure,
      Invoice,
      Payment,
      InvoiceEntry,
      FinanceAudit,
    ].map((Model) => Model.init()),
  );
