import { createHash, randomBytes } from "node:crypto";
import {
  FinanceOption,
  FeeStructure,
  Invoice,
  Payment,
  InvoiceEntry,
  FinanceAudit,
} from "../models/Finance.js";
import { Student } from "../models/Student.js";
import { AcademicSession } from "../models/AcademicSession.js";
import { AcademicTerm } from "../models/AcademicTerm.js";
import { SchoolClass } from "../models/SchoolClass.js";
import { mutateConfiguration, fail } from "./schoolConfiguration.js";
import { MAX_MINOR, moneySum, invoiceCategories } from "./money.js";
export const builtinMethods = [
  { _id: "cash", name: "Cash", status: "active", builtin: true },
  {
    _id: "bank_transfer",
    name: "Bank transfer",
    status: "active",
    builtin: true,
  },
  { _id: "pos", name: "POS", status: "active", builtin: true },
  { _id: "other", name: "Other", status: "active", builtin: true },
];
export const financeFields = "-schoolId -__v -fingerprint -requestKey";
const reference = (prefix) =>
  `${prefix}-${randomBytes(12).toString("hex").toUpperCase()}`;
const fingerprint = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export async function ownedFinance(Model, schoolId, id, transaction = null) {
  const record = await Model.findOne({ _id: id, schoolId }).session(
    transaction,
  );
  if (!record) fail(404, "Financial record not found.");
  return record;
}
export async function auditFinance(
  schoolId,
  actor,
  entityType,
  entityId,
  action,
  details,
  transaction,
) {
  await FinanceAudit.create(
    [
      {
        schoolId,
        actorId: actor._id,
        actorName: actor.name,
        entityType,
        entityId,
        action,
        details,
      },
    ],
    { session: transaction },
  );
}
export function checkedMinor(value) {
  value = BigInt(value);
  if (value > MAX_MINOR || value < -MAX_MINOR)
    fail(400, "Financial amount exceeds the supported limit.");
  return Number(value);
}
function recalculate(invoice) {
  const balance =
    BigInt(invoice.billedMinor) -
    BigInt(invoice.discountMinor) +
    BigInt(invoice.adjustmentMinor) -
    BigInt(invoice.paidMinor);
  if (
    invoice.discountMinor < 0 ||
    invoice.discountMinor > invoice.billedMinor ||
    balance < 0n ||
    invoice.paidMinor < 0
  )
    fail(409, "This operation would overpay or over-credit the invoice.");
  invoice.balanceMinor = checkedMinor(balance);
  checkedMinor(
    BigInt(invoice.billedMinor) -
      BigInt(invoice.discountMinor) +
      BigInt(invoice.adjustmentMinor),
  );
  invoice.revision += 1;
}
async function period(schoolId, input, transaction) {
  const session = await ownedFinance(
    AcademicSession,
    schoolId,
    input.sessionId,
    transaction,
  );
  const term = await ownedFinance(
    AcademicTerm,
    schoolId,
    input.termId,
    transaction,
  );
  const schoolClass = await ownedFinance(
    SchoolClass,
    schoolId,
    input.classId,
    transaction,
  );
  if (String(term.sessionId) !== input.sessionId)
    fail(400, "Term must belong to the selected academic session.");
  return {
    sessionName: session.name,
    termName: term.name,
    className: schoolClass.name,
  };
}
export function saveStructure(schoolId, actor, input, id) {
  return mutateConfiguration(schoolId, async (transaction) => {
    const existing = id
      ? await ownedFinance(FeeStructure, schoolId, id, transaction)
      : null;
    if (
      existing &&
      (!existing.isCurrent || input.revision !== existing.revision)
    )
      fail(
        409,
        "This structure changed or is historical. Reload the current version.",
      );
    if (
      existing &&
      ["sessionId", "termId", "classId"].some(
        (field) => String(existing[field]) !== input[field],
      )
    )
      fail(
        400,
        "The fee period/class cannot be changed; create a structure for that period instead.",
      );
    const names = await period(schoolId, input, transaction);
    const group = {
      schoolId,
      sessionId: input.sessionId,
      termId: input.termId,
      classId: input.classId,
    };
    if (
      !existing &&
      (await FeeStructure.exists({ ...group, isCurrent: true }).session(
        transaction,
      ))
    )
      fail(
        409,
        "A current fee structure already exists for this period and class. Edit it instead.",
      );
    const lines = [];
    for (const line of input.lines) {
      const category = await ownedFinance(
        FinanceOption,
        schoolId,
        line.categoryId,
        transaction,
      );
      if (category.kind !== "category" || category.status !== "active")
        fail(400, "Select active fee categories from your school.");
      lines.push({
        categoryId: category._id,
        categoryName: category.name,
        amountMinor: line.amount,
        compulsory: line.compulsory,
      });
    }
    checkedMinor(moneySum(lines.map((line) => line.amountMinor)));
    const values = { ...group, ...names, lines };
    let record;
    if (
      existing &&
      !(await Invoice.exists({
        schoolId,
        feeStructureId: existing._id,
      }).session(transaction))
    ) {
      existing.set({ ...values, revision: existing.revision + 1 });
      record = await existing.save({ session: transaction });
    } else {
      if (existing) {
        existing.isCurrent = false;
        await existing.save({ session: transaction });
      }
      record = (
        await FeeStructure.create(
          [{ ...values, revision: existing ? existing.revision + 1 : 1 }],
          { session: transaction },
        )
      )[0];
    }
    await auditFinance(
      schoolId,
      actor,
      "structure",
      record._id,
      existing ? "structure_updated" : "structure_created",
      {
        previousId: existing?.id || null,
        revision: record.revision,
        lines: values.lines,
      },
      transaction,
    );
    return record;
  });
}
export function generateInvoice(schoolId, actor, input) {
  return mutateConfiguration(schoolId, async (transaction) => {
    const student = await ownedFinance(
      Student,
      schoolId,
      input.studentId,
      transaction,
    );
    const structure = await ownedFinance(
      FeeStructure,
      schoolId,
      input.structureId,
      transaction,
    );
    if (
      student.status !== "active" ||
      !structure.isCurrent ||
      String(student.sessionId) !== String(structure.sessionId) ||
      String(student.classId) !== String(structure.classId)
    )
      fail(
        400,
        "Select an active student and the current structure for their session and class.",
      );
    await period(
      schoolId,
      {
        sessionId: String(structure.sessionId),
        termId: String(structure.termId),
        classId: String(structure.classId),
      },
      transaction,
    );
    if (
      await Invoice.exists({
        schoolId,
        studentId: student._id,
        sessionId: structure.sessionId,
        termId: structure.termId,
      }).session(transaction)
    )
      fail(
        409,
        "This student already has an invoice for the academic session and term.",
      );
    const optional = structure.lines
      .filter((line) => !line.compulsory)
      .map((line) => String(line.categoryId));
    if (input.optionalCategoryIds.some((id) => !optional.includes(id)))
      fail(400, "Optional categories must belong to the chosen structure.");
    const lines = structure.lines
      .filter(
        (line) =>
          line.compulsory ||
          input.optionalCategoryIds.includes(String(line.categoryId)),
      )
      .map((line) => line.toObject());
    const total = checkedMinor(moneySum(lines.map((line) => line.amountMinor)));
    if (total <= 0) fail(400, "Select at least one billable fee.");
    const record = (
      await Invoice.create(
        [
          {
            schoolId,
            studentId: student._id,
            sessionId: structure.sessionId,
            termId: structure.termId,
            classId: structure.classId,
            feeStructureId: structure._id,
            structureRevision: structure.revision,
            reference: reference("INV"),
            studentName: [
              student.firstName,
              student.middleName,
              student.lastName,
            ]
              .filter(Boolean)
              .join(" "),
            admissionNumber: student.admissionNumber,
            sessionName: structure.sessionName,
            termName: structure.termName,
            className: structure.className,
            lines,
            billedMinor: total,
            balanceMinor: total,
            createdBy: actor._id,
            createdByName: actor.name,
          },
        ],
        { session: transaction },
      )
    )[0];
    await auditFinance(
      schoolId,
      actor,
      "invoice",
      record._id,
      "invoice_generated",
      {
        reference: record.reference,
        billedMinor: total,
        structureId: structure.id,
        structureRevision: structure.revision,
      },
      transaction,
    );
    return record;
  });
}
export function addInvoiceEntry(schoolId, actor, invoiceId, input) {
  return mutateConfiguration(schoolId, async (transaction) => {
    const hash = fingerprint({
      invoiceId,
      kind: input.kind,
      amount: input.amount,
      reason: input.reason,
    });
    const previous = await InvoiceEntry.findOne({
      schoolId,
      requestKey: input.requestKey,
    }).session(transaction);
    if (previous) {
      if (previous.fingerprint !== hash)
        fail(
          409,
          "This submission key was already used for a different adjustment.",
        );
      return { replayed: true };
    }
    const invoice = await ownedFinance(
      Invoice,
      schoolId,
      invoiceId,
      transaction,
    );
    if (invoice.revision !== input.revision)
      fail(409, "Invoice changed. Reload before applying an adjustment.");
    const before = {
      discountMinor: invoice.discountMinor,
      adjustmentMinor: invoice.adjustmentMinor,
      balanceMinor: invoice.balanceMinor,
    };
    if (input.kind === "adjustment")
      invoice.adjustmentMinor = checkedMinor(
        BigInt(invoice.adjustmentMinor) + BigInt(input.amount),
      );
    else
      invoice.discountMinor = checkedMinor(
        BigInt(invoice.discountMinor) + BigInt(input.amount),
      );
    recalculate(invoice);
    await invoice.save({ session: transaction });
    const entry = (
      await InvoiceEntry.create(
        [
          {
            schoolId,
            invoiceId,
            kind: input.kind,
            amountMinor: input.amount,
            reason: input.reason,
            requestKey: input.requestKey,
            fingerprint: hash,
            actorId: actor._id,
            actorName: actor.name,
          },
        ],
        { session: transaction },
      )
    )[0];
    await auditFinance(
      schoolId,
      actor,
      "invoice",
      invoice._id,
      input.kind,
      {
        entryId: entry.id,
        amountMinor: input.amount,
        reason: input.reason,
        before,
        after: {
          discountMinor: invoice.discountMinor,
          adjustmentMinor: invoice.adjustmentMinor,
          balanceMinor: invoice.balanceMinor,
        },
      },
      transaction,
    );
    return { replayed: false };
  });
}
export function recordPayment(schoolId, actor, input) {
  return mutateConfiguration(schoolId, async (transaction) => {
    const hash = fingerprint({
      invoiceId: input.invoiceId,
      amount: input.amount,
      paidOn: input.paidOn,
      methodId: input.methodId,
      externalReference: input.externalReference,
    });
    const previous = await Payment.findOne({
      schoolId,
      requestKey: input.requestKey,
    }).session(transaction);
    if (previous) {
      if (previous.fingerprint !== hash)
        fail(
          409,
          "This submission key was already used for a different payment.",
        );
      return { payment: previous, replayed: true };
    }
    const invoice = await ownedFinance(
      Invoice,
      schoolId,
      input.invoiceId,
      transaction,
    );
    let method = builtinMethods.find((method) => method._id === input.methodId);
    if (!method) {
      method = await ownedFinance(
        FinanceOption,
        schoolId,
        input.methodId,
        transaction,
      );
      if (method.kind !== "method" || method.status !== "active")
        fail(400, "Select an active payment method.");
    }
    if (
      input.externalReference &&
      (await Payment.exists({
        schoolId,
        externalReference: input.externalReference,
      }).session(transaction))
    )
      fail(
        409,
        "This external payment reference is already recorded, including reversed payments.",
      );
    const beforeBalance = invoice.balanceMinor;
    invoice.paidMinor = checkedMinor(
      BigInt(invoice.paidMinor) + BigInt(input.amount),
    );
    recalculate(invoice);
    await invoice.save({ session: transaction });
    const payment = (
      await Payment.create(
        [
          {
            schoolId,
            invoiceId: invoice._id,
            studentId: invoice.studentId,
            reference: reference("PAY"),
            requestKey: input.requestKey,
            fingerprint: hash,
            amountMinor: input.amount,
            balanceAfterMinor: invoice.balanceMinor,
            periodLabel: `${invoice.sessionName} · ${invoice.termName}`,
            className: invoice.className,
            paidOn: input.paidOn,
            methodId: input.methodId,
            methodName: method.name,
            ...(input.externalReference
              ? { externalReference: input.externalReference }
              : {}),
            invoiceReference: invoice.reference,
            studentName: invoice.studentName,
            admissionNumber: invoice.admissionNumber,
            createdBy: actor._id,
            createdByName: actor.name,
          },
        ],
        { session: transaction },
      )
    )[0];
    await auditFinance(
      schoolId,
      actor,
      "invoice",
      invoice._id,
      "payment_recorded",
      {
        paymentId: payment.id,
        reference: payment.reference,
        amountMinor: payment.amountMinor,
        beforeBalance,
        afterBalance: invoice.balanceMinor,
      },
      transaction,
    );
    return { payment, replayed: false };
  });
}
export function reversePayment(schoolId, actor, id, reason) {
  return mutateConfiguration(schoolId, async (transaction) => {
    const payment = await ownedFinance(Payment, schoolId, id, transaction);
    if (payment.status === "reversed")
      fail(409, "This payment has already been reversed.");
    const invoice = await ownedFinance(
      Invoice,
      schoolId,
      payment.invoiceId,
      transaction,
    );
    const beforeBalance = invoice.balanceMinor;
    invoice.paidMinor = checkedMinor(
      BigInt(invoice.paidMinor) - BigInt(payment.amountMinor),
    );
    recalculate(invoice);
    await invoice.save({ session: transaction });
    payment.set({
      status: "reversed",
      reversalReason: reason,
      reversedBy: actor._id,
      reversedByName: actor.name,
      reversedAt: new Date(),
    });
    await payment.save({ session: transaction });
    await auditFinance(
      schoolId,
      actor,
      "invoice",
      invoice._id,
      "payment_reversed",
      {
        paymentId: payment.id,
        reference: payment.reference,
        amountMinor: payment.amountMinor,
        reason,
        beforeBalance,
        afterBalance: invoice.balanceMinor,
      },
      transaction,
    );
    return payment;
  });
}
export async function invoiceFilter(schoolId, input) {
  const filter = { schoolId };
  for (const [field, Model] of [
    ["sessionId", AcademicSession],
    ["termId", AcademicTerm],
    ["classId", SchoolClass],
    ["studentId", Student],
  ])
    if (input[field]) {
      await ownedFinance(Model, schoolId, input[field]);
      filter[field] = input[field];
    }
  if (input.sessionId && input.termId) {
    const term = await ownedFinance(AcademicTerm, schoolId, input.termId);
    if (String(term.sessionId) !== input.sessionId)
      fail(400, "Term filter must belong to the selected session.");
  }
  if (input.search) {
    const search = input.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = ["reference", "studentName", "admissionNumber"].map(
      (field) => ({ [field]: { $regex: search, $options: "i" } }),
    );
  }
  if (input.status === "paid") filter.balanceMinor = 0;
  if (input.status === "outstanding") filter.balanceMinor = { $gt: 0 };
  return filter;
}
export async function financialReport(schoolId, input) {
  if (["posted", "reversed"].includes(input.status))
    fail(400, "Use paid/outstanding status for invoice financial reports.");
  const filter = await invoiceFilter(schoolId, input);
  const invoices = await Invoice.find(filter)
    .select(financeFields)
    .sort({ createdAt: -1, _id: -1 })
    .lean();
  const totals = {
    billedMinor: 0n,
    discountMinor: 0n,
    adjustmentMinor: 0n,
    paidMinor: 0n,
    balanceMinor: 0n,
  };
  const term = new Map(),
    classes = new Map(),
    categories = new Map();
  const add = (map, id, name, values) => {
    const row = map.get(id) || {
      id,
      name,
      ...Object.fromEntries(Object.keys(totals).map((key) => [key, 0n])),
    };
    for (const key of Object.keys(totals)) row[key] += BigInt(values[key]);
    map.set(id, row);
  };
  for (const invoice of invoices) {
    for (const key of Object.keys(totals)) totals[key] += BigInt(invoice[key]);
    add(
      term,
      String(invoice.termId),
      `${invoice.sessionName} · ${invoice.termName}`,
      invoice,
    );
    add(classes, String(invoice.classId), invoice.className, invoice);
    for (const category of invoiceCategories(invoice))
      add(categories, category.categoryId, category.categoryName, category);
  }
  const serialize = (value) =>
    Object.fromEntries(
      Object.entries(value).map(([key, amount]) => [
        key,
        typeof amount === "bigint" ? amount.toString() : amount,
      ]),
    );
  return {
    totals: serialize(totals),
    byTerm: [...term.values()].map(serialize),
    byClass: [...classes.values()].map(serialize),
    byCategory: [...categories.values()].map(serialize),
    records: invoices.slice(
      (input.page - 1) * input.limit,
      input.page * input.limit,
    ),
    total: invoices.length,
    page: input.page,
    limit: input.limit,
  };
}
