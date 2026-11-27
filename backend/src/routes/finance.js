import { Router } from "express";
import { z } from "zod";
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
import {
  financeId,
  financeFilters,
  optionInput,
  structureInput,
  generateInput,
  entryInput,
  paymentInput,
  reasonInput,
} from "../validation/finance.js";
import {
  builtinMethods,
  financeFields,
  ownedFinance,
  auditFinance,
  saveStructure,
  generateInvoice,
  addInvoiceEntry,
  recordPayment,
  reversePayment,
  invoiceFilter,
  financialReport,
} from "../services/finance.js";
import { mutateConfiguration, fail } from "../services/schoolConfiguration.js";
const publicRecord = (record) => {
  const data = record.toObject ? record.toObject() : { ...record };
  for (const field of ["schoolId", "__v", "fingerprint", "requestKey"])
    delete data[field];
  return data;
};
const pageResult = async (Model, filter, input, projection = financeFields) => {
  const [records, total] = await Promise.all([
    Model.find(filter)
      .select(projection)
      .sort({ createdAt: -1, _id: -1 })
      .skip((input.page - 1) * input.limit)
      .limit(input.limit),
    Model.countDocuments(filter),
  ]);
  return { records, total, page: input.page, limit: input.limit };
};
export function financeRoutes() {
  const router = Router();
  router.get("/audit", async (req, res) => {
    const { page, limit } = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(50).default(10),
      })
      .strict()
      .parse(req.query);
    res.json(
      await pageResult(
        FinanceAudit,
        { schoolId: req.user.schoolId },
        { page, limit },
      ),
    );
  });
  router.use((req, _res, next) => {
    if (req.method !== "GET") z.object({}).strict().parse(req.query);
    next();
  });
  router.get("/context", async (req, res) => {
    z.object({}).strict().parse(req.query);
    const schoolId = req.user.schoolId;
    const [categories, methods, sessions, terms, classes] = await Promise.all([
      FinanceOption.find({ schoolId, kind: "category" })
        .select(financeFields)
        .sort({ name: 1 }),
      FinanceOption.find({ schoolId, kind: "method" })
        .select(financeFields)
        .sort({ name: 1 }),
      AcademicSession.find({ schoolId }).select("_id name status"),
      AcademicTerm.find({ schoolId }).select("_id name sessionId status"),
      SchoolClass.find({ schoolId }).select("_id name status"),
    ]);
    res.json({
      currency: "NGN",
      categories,
      methods: [...builtinMethods, ...methods],
      sessions,
      terms,
      classes,
      permissions: ["read", "manage", "collect", "adjust", "reverse"],
    });
  });
  for (const [path, kind] of [
    ["categories", "category"],
    ["methods", "method"],
  ]) {
    router.get(`/${path}`, async (req, res) => {
      z.object({}).strict().parse(req.query);
      const records = await FinanceOption.find({
        schoolId: req.user.schoolId,
        kind,
      })
        .select(financeFields)
        .sort({ name: 1 });
      res.json({
        records: kind === "method" ? [...builtinMethods, ...records] : records,
      });
    });
    for (const editing of [false, true])
      router[editing ? "put" : "post"](
        `/${path}${editing ? "/:id" : ""}`,
        async (req, res) => {
          const input = optionInput.parse(req.body),
            id = editing ? financeId.parse(req.params.id) : null;
          const record = await mutateConfiguration(
            req.user.schoolId,
            async (transaction) => {
              const record = id
                ? await ownedFinance(
                    FinanceOption,
                    req.user.schoolId,
                    id,
                    transaction,
                  )
                : null;
              if (record && record.kind !== kind)
                fail(404, "Financial option not found.");
              if (
                kind === "method" &&
                builtinMethods.some(
                  (method) =>
                    method.name.toLowerCase() === input.name.toLowerCase(),
                )
              )
                fail(409, "This built-in payment method already exists.");
              const before = record
                ? { name: record.name, status: record.status }
                : null;
              const saved = record
                ? await record.set(input).save({ session: transaction })
                : (
                    await FinanceOption.create(
                      [{ schoolId: req.user.schoolId, kind, ...input }],
                      { session: transaction },
                    )
                  )[0];
              await auditFinance(
                req.user.schoolId,
                req.user,
                kind,
                saved._id,
                `${kind}_${editing ? "updated" : "created"}`,
                { before, after: input },
                transaction,
              );
              return saved;
            },
          );
          res
            .status(editing ? 200 : 201)
            .json({ record: publicRecord(record) });
        },
      );
  }
  router.get("/structures", async (req, res) => {
    const input = financeFilters
      .extend({ history: z.enum(["", "all"]).default("") })
      .parse(req.query);
    if (input.studentId || input.status)
      fail(400, "Structure filters support session, term and class only.");
    const filter = await invoiceFilter(req.user.schoolId, {
      ...input,
      search: "",
    });
    if (input.history !== "all") filter.isCurrent = true;
    if (input.search) {
      const search = input.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = ["className", "sessionName", "termName"].map((field) => ({
        [field]: { $regex: search, $options: "i" },
      }));
    }
    res.json(await pageResult(FeeStructure, filter, input));
  });
  router.post("/structures", async (req, res) =>
    res.status(201).json({
      record: publicRecord(
        await saveStructure(
          req.user.schoolId,
          req.user,
          structureInput.parse(req.body),
        ),
      ),
    }),
  );
  router.put("/structures/:id", async (req, res) =>
    res.json({
      record: publicRecord(
        await saveStructure(
          req.user.schoolId,
          req.user,
          structureInput.parse(req.body),
          financeId.parse(req.params.id),
        ),
      ),
    }),
  );
  router.get("/invoices", async (req, res) => {
    const input = financeFilters.parse(req.query);
    if (["posted", "reversed"].includes(input.status))
      fail(400, "Select paid or outstanding invoices.");
    res.json(
      await pageResult(
        Invoice,
        await invoiceFilter(req.user.schoolId, input),
        input,
        `${financeFields} -lines`,
      ),
    );
  });
  router.post("/invoices", async (req, res) =>
    res.status(201).json({
      record: publicRecord(
        await generateInvoice(
          req.user.schoolId,
          req.user,
          generateInput.parse(req.body),
        ),
      ),
    }),
  );
  router.get("/invoices/:id", async (req, res) => {
    z.object({}).strict().parse(req.query);
    const id = financeId.parse(req.params.id),
      invoice = await ownedFinance(Invoice, req.user.schoolId, id);
    const filter = { schoolId: req.user.schoolId, invoiceId: id };
    const [payments, entries, audit] = await Promise.all([
      Payment.find(filter).select(financeFields).sort({ createdAt: 1 }),
      InvoiceEntry.find(filter).select(financeFields).sort({ createdAt: 1 }),
      FinanceAudit.find({
        schoolId: req.user.schoolId,
        entityType: "invoice",
        entityId: id,
      })
        .select(financeFields)
        .sort({ createdAt: 1 }),
    ]);
    res.json({ record: publicRecord(invoice), payments, entries, audit });
  });
  router.post("/invoices/:id/entries", async (req, res) => {
    const result = await addInvoiceEntry(
      req.user.schoolId,
      req.user,
      financeId.parse(req.params.id),
      entryInput.parse(req.body),
    );
    res.status(result.replayed ? 200 : 201).json(result);
  });
  router.post("/payments", async (req, res) => {
    const result = await recordPayment(
      req.user.schoolId,
      req.user,
      paymentInput.parse(req.body),
    );
    res.status(result.replayed ? 200 : 201).json({
      record: publicRecord(result.payment),
      replayed: result.replayed,
    });
  });
  router.get("/payments", async (req, res) => {
    const input = financeFilters.parse(req.query);
    if (["paid", "outstanding"].includes(input.status))
      fail(400, "Select posted or reversed payment status.");
    const invoices = await Invoice.find(
      await invoiceFilter(req.user.schoolId, {
        ...input,
        search: "",
        status: "",
      }),
    ).select("_id");
    const filter = {
      schoolId: req.user.schoolId,
      invoiceId: { $in: invoices.map((invoice) => invoice._id) },
    };
    if (input.status) filter.status = input.status;
    if (input.search) {
      const search = input.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.$or = [
        "reference",
        "invoiceReference",
        "studentName",
        "admissionNumber",
        "externalReference",
      ].map((field) => ({ [field]: { $regex: search, $options: "i" } }));
    }
    res.json(await pageResult(Payment, filter, input));
  });
  router.post("/payments/:id/reverse", async (req, res) => {
    const { reason } = z
      .object({ reason: reasonInput })
      .strict()
      .parse(req.body);
    res.json({
      record: publicRecord(
        await reversePayment(
          req.user.schoolId,
          req.user,
          financeId.parse(req.params.id),
          reason,
        ),
      ),
    });
  });
  router.get("/payments/:id/receipt", async (req, res) => {
    z.object({}).strict().parse(req.query);
    const payment = await ownedFinance(
      Payment,
      req.user.schoolId,
      financeId.parse(req.params.id),
    );
    const school = Object.fromEntries(
      ["name", "logoUrl", "address", "city", "country", "phone", "email"].map(
        (key) => [key, req.school[key] || ""],
      ),
    );
    res.json({ payment: publicRecord(payment), school, currency: "NGN" });
  });
  router.get("/reports", async (req, res) =>
    res.json(
      await financialReport(req.user.schoolId, financeFilters.parse(req.query)),
    ),
  );
  router.get("/students/:id/statement", async (req, res) => {
    if ("studentId" in req.query)
      fail(400, "Choose the student through the statement path.");
    const studentId = financeId.parse(req.params.id),
      student = await ownedFinance(Student, req.user.schoolId, studentId);
    const input = financeFilters.parse({ ...req.query, studentId });
    const report = await financialReport(req.user.schoolId, input);
    const invoices = await Invoice.find(
      await invoiceFilter(req.user.schoolId, input),
    )
      .select(financeFields)
      .lean();
    const filter = {
      schoolId: req.user.schoolId,
      invoiceId: { $in: invoices.map((invoice) => invoice._id) },
    };
    const [payments, entries] = await Promise.all([
      Payment.find(filter).select(financeFields).lean(),
      InvoiceEntry.find(filter).select(financeFields).lean(),
    ]);
    const activities = invoices.map((invoice) => ({
      _id: invoice._id,
      date: invoice.createdAt,
      type: "Invoice",
      reference: invoice.reference,
      deltaMinor: BigInt(invoice.billedMinor),
    }));
    for (const entry of entries)
      activities.push({
        _id: entry._id,
        date: entry.createdAt,
        type: entry.kind,
        reference: "",
        reason: entry.reason,
        deltaMinor: BigInt(
          entry.kind === "adjustment" ? entry.amountMinor : -entry.amountMinor,
        ),
      });
    for (const payment of payments) {
      activities.push({
        _id: payment._id,
        date: payment.createdAt,
        valueDate: payment.paidOn,
        type: "Payment",
        reference: payment.reference,
        status: payment.status,
        deltaMinor: -BigInt(payment.amountMinor),
      });
      if (payment.status === "reversed")
        activities.push({
          _id: `${payment._id}-reversal`,
          date: payment.reversedAt,
          type: "Payment reversal",
          reference: payment.reference,
          reason: payment.reversalReason,
          deltaMinor: BigInt(payment.amountMinor),
        });
    }
    activities.sort(
      (a, b) => a.date - b.date || String(a._id).localeCompare(String(b._id)),
    );
    let running = 0n;
    const records = activities.map((activity) => {
      running += activity.deltaMinor;
      return {
        ...activity,
        deltaMinor: activity.deltaMinor.toString(),
        runningBalanceMinor: running.toString(),
      };
    });
    res.json({
      student: {
        _id: student._id,
        name: [student.firstName, student.middleName, student.lastName]
          .filter(Boolean)
          .join(" "),
        admissionNumber: student.admissionNumber,
      },
      totals: report.totals,
      records: records.slice(
        (input.page - 1) * input.limit,
        input.page * input.limit,
      ),
      total: records.length,
      page: input.page,
      limit: input.limit,
    });
  });
  for (const [path, Model] of [
    ["categories", FinanceOption],
    ["methods", FinanceOption],
    ["structures", FeeStructure],
    ["invoices", Invoice],
    ["payments", Payment],
  ])
    router.delete(`/${path}/:id`, async (req, res) => {
      await ownedFinance(
        Model,
        req.user.schoolId,
        financeId.parse(req.params.id),
      );
      res.status(405).json({
        message:
          "Financial records cannot be deleted. Use an audited adjustment, payment reversal, or option deactivation.",
      });
    });
  router.put("/invoices/:id", async (req, res) => {
    await ownedFinance(
      Invoice,
      req.user.schoolId,
      financeId.parse(req.params.id),
    );
    res.status(405).json({
      message:
        "Issued invoice lines and periods are immutable. Use authorised, reasoned discounts or adjustments instead.",
    });
  });
  return router;
}
