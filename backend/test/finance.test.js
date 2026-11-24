import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import request from "supertest";
import bcrypt from "bcrypt";
import { createApp } from "../src/app.js";
import {
  FinanceOption,
  FeeStructure,
  Invoice,
  Payment,
  InvoiceEntry,
  FinanceAudit,
  initializeFinance,
} from "../src/models/Finance.js";
import { Student } from "../src/models/Student.js";
import { User } from "../src/models/User.js";
import { School } from "../src/models/School.js";
import { AcademicSession } from "../src/models/AcademicSession.js";
import { AcademicTerm } from "../src/models/AcademicTerm.js";
import { SchoolClass } from "../src/models/SchoolClass.js";
import { initializeSchoolConfiguration } from "../src/services/schoolConfiguration.js";
import { attendanceToday } from "../src/validation/attendance.js";
import { allocateMinor } from "../src/services/money.js";

const config = {
  NODE_ENV: "test",
  JWT_SECRET: "finance-test-secret-more-than-32-characters",
  FRONTEND_ORIGIN: "http://localhost:5173",
};
let mongo,
  app,
  agent,
  editorAgent,
  superAgent,
  admin,
  editor,
  school,
  otherSchool,
  session,
  otherSession,
  term,
  otherTerm,
  wrongTerm,
  schoolClass,
  secondClass,
  students,
  foreignStudent,
  foreignInvoice,
  foreignPayment,
  foreignCategory,
  categoryTuition,
  categoryBooks,
  categoryTransport,
  customMethod,
  structure,
  newStructure,
  invoiceA,
  invoiceB,
  invoiceC,
  paymentA,
  paymentPayload;
const send = (client, method, path, body) =>
  client[method](`/api/school/finance${path}`)
    .set("Origin", config.FRONTEND_ORIGIN)
    .send(body);
const write = (method, path, body, client = agent) =>
  send(client, method, path, body);
const feeLines = () => [
  { categoryId: categoryTuition, amount: "100.05", compulsory: true },
  { categoryId: categoryBooks, amount: "50.05", compulsory: false },
  { categoryId: categoryTransport, amount: "25.01", compulsory: false },
];
const structureBody = () => ({
  sessionId: session.id,
  termId: term.id,
  classId: schoolClass.id,
  lines: feeLines(),
});
const fetchInvoice = async (id) =>
  (await agent.get(`/api/school/finance/invoices/${id}`)).body.record;
const pay = (invoiceId, amount, extra = {}) =>
  write("post", "/payments", {
    invoiceId,
    amount,
    methodId: "cash",
    paidOn: attendanceToday(),
    requestKey: randomUUID(),
    ...extra,
  });
before(
  async () => {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(mongo.getUri());
    await Promise.all([
      User.init(),
      School.init(),
      Student.init(),
      initializeSchoolConfiguration(),
      initializeFinance(),
    ]);
    const passwordHash = await bcrypt.hash("Test-password-123!", 4);
    const owner = await User.create({
      name: "Platform Admin",
      email: "owner@finance.test",
      role: "super_admin",
      passwordHash,
    });
    school = await School.create({
      name: "Bright Future International School",
      city: "Lagos",
      country: "Nigeria",
      schoolType: "Nursery and Primary",
      createdBy: owner._id,
    });
    otherSchool = await School.create({
      name: "Other School",
      city: "Abuja",
      country: "Nigeria",
      schoolType: "Primary",
      createdBy: owner._id,
    });
    admin = await User.create({
      name: "Finance Admin",
      email: "school@finance.test",
      role: "school_admin",
      schoolId: school._id,
      passwordHash,
    });
    editor = await User.create({
      name: "Finance Reviewer",
      email: "editor@finance.test",
      role: "school_admin",
      schoolId: school._id,
      passwordHash,
    });
    [session, otherSession] = await AcademicSession.create(
      [school, otherSchool].map((item) => ({
        schoolId: item._id,
        name: "2026/2027",
        startDate: "2026-09-01",
        endDate: "2027-07-31",
        status: "active",
      })),
    );
    const nextSession = await AcademicSession.create({
      schoolId: school._id,
      name: "2027/2028",
      startDate: "2027-09-01",
      endDate: "2028-07-31",
    });
    [term, otherTerm, wrongTerm] = await AcademicTerm.create([
      {
        schoolId: school._id,
        sessionId: session._id,
        name: "First Term",
        startDate: "2026-09-01",
        endDate: "2026-12-18",
      },
      {
        schoolId: otherSchool._id,
        sessionId: otherSession._id,
        name: "First Term",
        startDate: "2026-09-01",
        endDate: "2026-12-18",
      },
      {
        schoolId: school._id,
        sessionId: nextSession._id,
        name: "First Term",
        startDate: "2027-09-01",
        endDate: "2027-12-18",
      },
    ]);
    [schoolClass, secondClass] = await SchoolClass.create([
      { schoolId: school._id, name: "Primary 1", capacity: 30 },
      { schoolId: school._id, name: "Primary 2", capacity: 30 },
    ]);
    const otherClass = await SchoolClass.create({
      schoolId: otherSchool._id,
      name: "Primary 1",
      capacity: 30,
    });
    const studentBase = {
      schoolId: school._id,
      dateOfBirth: "2020-04-15",
      gender: "not_specified",
      address: "Private student address",
      admissionDate: "2026-09-01",
      sessionId: session._id,
      classId: schoolClass._id,
      admissionStatus: "admitted",
      createdBy: admin._id,
      updatedBy: admin._id,
    };
    students = await Student.create(
      ["Alice", "Bola", "Chidi"].map((firstName, index) => ({
        ...studentBase,
        firstName,
        lastName: "Test",
        admissionNumber: `BFIS-${index}`,
        ...(index === 1 ? { classId: secondClass._id } : {}),
      })),
    );
    foreignStudent = await Student.create({
      ...studentBase,
      schoolId: otherSchool._id,
      firstName: "Foreign",
      lastName: "Student",
      admissionNumber: "FOREIGN",
      sessionId: otherSession._id,
      classId: otherClass._id,
    });
    foreignCategory = await FinanceOption.create({
      schoolId: otherSchool._id,
      kind: "category",
      name: "Foreign Tuition",
    });
    const foreignStructure = await FeeStructure.create({
      schoolId: otherSchool._id,
      sessionId: otherSession._id,
      termId: otherTerm._id,
      classId: otherClass._id,
      lines: [
        {
          categoryId: foreignCategory._id,
          categoryName: foreignCategory.name,
          amountMinor: 100,
          compulsory: true,
        },
      ],
    });
    foreignInvoice = await Invoice.create({
      schoolId: otherSchool._id,
      studentId: foreignStudent._id,
      sessionId: otherSession._id,
      termId: otherTerm._id,
      classId: otherClass._id,
      feeStructureId: foreignStructure._id,
      reference: "INV-FOREIGN",
      studentName: "Foreign Student",
      lines: foreignStructure.lines,
      billedMinor: 100,
      paidMinor: 100,
      balanceMinor: 0,
      createdBy: owner._id,
    });
    foreignPayment = await Payment.create({
      schoolId: otherSchool._id,
      invoiceId: foreignInvoice._id,
      studentId: foreignStudent._id,
      reference: "PAY-FOREIGN",
      requestKey: randomUUID(),
      fingerprint: "foreign",
      amountMinor: 100,
      paidOn: attendanceToday(),
      methodId: "cash",
      methodName: "Cash",
      createdBy: owner._id,
    });
    app = createApp(config);
    agent = request.agent(app);
    editorAgent = request.agent(app);
    superAgent = request.agent(app);
    for (const [client, user, path] of [
      [agent, admin, "/school-login"],
      [editorAgent, editor, "/school-login"],
      [superAgent, owner, "/login"],
    ])
      assert.equal(
        (
          await client
            .post(`/api/auth${path}`)
            .set("Origin", config.FRONTEND_ORIGIN)
            .send({ email: user.email, password: "Test-password-123!" })
        ).status,
        200,
      );
  },
  { timeout: 900000 },
);
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

test("fee categories and custom payment methods are real school configuration with audit", async () => {
  for (const [name, assign] of [
    ["Tuition", (value) => (categoryTuition = value)],
    ["Books", (value) => (categoryBooks = value)],
    ["Transport", (value) => (categoryTransport = value)],
  ]) {
    const res = await write("post", "/categories", { name });
    assert.equal(res.status, 201);
    assign(res.body.record._id);
  }
  assert.equal(
    (await write("post", "/categories", { name: "tuition" })).status,
    409,
  );
  const method = await write("post", "/methods", { name: "Cheque" });
  assert.equal(method.status, 201);
  customMethod = method.body.record._id;
  const context = await agent.get("/api/school/finance/context");
  assert.equal(context.status, 200);
  assert.equal(context.body.categories.length, 3);
  assert.equal(context.body.methods.length, 5);
  assert.equal(
    context.body.categories.some((item) => item._id === foreignCategory.id),
    false,
  );
  assert.equal(await FinanceAudit.countDocuments({ schoolId: school._id }), 4);
});

test("fee structures validate periods, categories and exact decimal monetary inputs", async () => {
  const res = await write("post", "/structures", structureBody());
  assert.equal(res.status, 201);
  structure = res.body.record;
  assert.equal(structure.lines[0].amountMinor, 10005);
  assert.equal(structure.revision, 1);
  assert.equal(
    (await write("post", "/structures", structureBody())).status,
    409,
  );
  assert.equal(
    (
      await write("post", "/structures", {
        ...structureBody(),
        termId: wrongTerm.id,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await write("post", "/structures", {
        ...structureBody(),
        classId: secondClass.id,
        lines: [
          { categoryId: foreignCategory.id, amount: "1.00", compulsory: true },
        ],
      })
    ).status,
    404,
  );
  for (const amount of [
    "0",
    "-1",
    "1.001",
    "1e3",
    "1,000",
    "99999999999",
    1.23,
  ])
    assert.equal(
      (
        await write("post", "/structures", {
          ...structureBody(),
          classId: secondClass.id,
          lines: [{ categoryId: categoryTuition, amount, compulsory: true }],
        })
      ).status,
      400,
    );
  assert.equal(
    (
      await write("post", "/structures", {
        ...structureBody(),
        schoolId: otherSchool.id,
      })
    ).status,
    400,
  );
});

test("unused structures edit with revision checks and generated invoices snapshot compulsory/optional fees", async () => {
  const edited = await write("put", `/structures/${structure._id}`, {
    ...structureBody(),
    revision: 1,
  });
  assert.equal(edited.status, 200);
  structure = edited.body.record;
  assert.equal(structure.revision, 2);
  assert.equal(
    (
      await write("put", `/structures/${structure._id}`, {
        ...structureBody(),
        revision: 1,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await write("post", "/invoices", {
        studentId: students[0].id,
        structureId: structure._id,
        optionalCategoryIds: [categoryTuition],
      })
    ).status,
    400,
  );
  const res = await write("post", "/invoices", {
    studentId: students[0].id,
    structureId: structure._id,
    optionalCategoryIds: [categoryBooks],
  });
  assert.equal(res.status, 201);
  invoiceA = res.body.record;
  assert.equal(invoiceA.billedMinor, 15010);
  assert.equal(invoiceA.balanceMinor, 15010);
  assert.equal(invoiceA.lines.length, 2);
  assert.equal(invoiceA.structureRevision, 2);
  assert.equal(
    (
      await write("post", "/invoices", {
        studentId: students[0].id,
        structureId: structure._id,
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await write("post", "/invoices", {
        studentId: students[1].id,
        structureId: structure._id,
      })
    ).status,
    400,
  );
});

test("editing an invoiced structure creates a new immutable-used version", async () => {
  const body = {
    ...structureBody(),
    revision: structure.revision,
    lines: feeLines().map((line) =>
      line.categoryId === categoryTuition
        ? { ...line, amount: "120.05" }
        : line,
    ),
  };
  const res = await write("put", `/structures/${structure._id}`, body);
  assert.equal(res.status, 200);
  newStructure = res.body.record;
  assert.notEqual(newStructure._id, structure._id);
  assert.equal(newStructure.revision, 3);
  const old = await FeeStructure.findById(structure._id);
  assert.equal(old.isCurrent, false);
  assert.equal(old.lines[0].amountMinor, 10005);
  assert.equal((await fetchInvoice(invoiceA._id)).billedMinor, 15010);
  assert.equal(
    (
      await write("put", `/structures/${structure._id}`, {
        ...structureBody(),
        revision: 2,
      })
    ).status,
    409,
  );
  const third = await write("post", "/invoices", {
    studentId: students[2].id,
    structureId: newStructure._id,
  });
  assert.equal(third.status, 201);
  invoiceC = third.body.record;
  assert.equal(invoiceC.billedMinor, 12005);
  const microStructure = await write("post", "/structures", {
    ...structureBody(),
    classId: secondClass.id,
    lines: [
      { categoryId: categoryTuition, amount: "0.03", compulsory: true },
      { categoryId: categoryBooks, amount: "0.02", compulsory: true },
    ],
  });
  assert.equal(microStructure.status, 201);
  const micro = await write("post", "/invoices", {
    studentId: students[1].id,
    structureId: microStructure.body.record._id,
  });
  assert.equal(micro.status, 201);
  invoiceB = micro.body.record;
  assert.equal(invoiceB.billedMinor, 5);
});

test("partial and full payments use exact kobo and immutable receipt snapshots", async () => {
  paymentPayload = {
    invoiceId: invoiceA._id,
    amount: "50.01",
    methodId: "bank_transfer",
    paidOn: attendanceToday(),
    externalReference: "BANK-001",
    requestKey: randomUUID(),
  };
  const first = await write("post", "/payments", paymentPayload);
  assert.equal(first.status, 201);
  paymentA = first.body.record;
  assert.equal(paymentA.amountMinor, 5001);
  assert.equal(paymentA.balanceAfterMinor, 10009);
  assert.match(paymentA.reference, /^PAY-[A-F0-9]{24}$/);
  assert.equal(paymentA.requestKey, undefined);
  assert.equal((await fetchInvoice(invoiceA._id)).balanceMinor, 10009);
  assert.equal(
    (await pay(invoiceA._id, "100.09", { methodId: "pos" })).status,
    201,
  );
  assert.equal((await fetchInvoice(invoiceA._id)).balanceMinor, 0);
  assert.equal((await fetchInvoice(invoiceA._id)).paidMinor, 15010);
  assert.equal((await pay(invoiceA._id, "0.01")).status, 409);
  for (const amount of ["0.01", "0.02", "0.02"])
    assert.equal(
      (await pay(invoiceB._id, amount, { methodId: customMethod })).status,
      201,
    );
  assert.equal((await fetchInvoice(invoiceB._id)).paidMinor, 5);
  assert.equal((await fetchInvoice(invoiceB._id)).balanceMinor, 0);
  const receipt = await agent.get(
    `/api/school/finance/payments/${paymentA._id}/receipt`,
  );
  assert.equal(receipt.body.payment.balanceAfterMinor, 10009);
  assert.equal(receipt.body.school.name, school.name);
  assert.equal(receipt.body.school.createdBy, undefined);
});

test("payment retry keys, references and external identifiers prevent duplicate submissions", async () => {
  const before = await Payment.countDocuments({ schoolId: school._id });
  const replay = await write("post", "/payments", paymentPayload);
  assert.equal(replay.status, 200);
  assert.equal(replay.body.record._id, paymentA._id);
  assert.equal(replay.body.replayed, true);
  assert.equal(
    (await write("post", "/payments", { ...paymentPayload, amount: "1.00" }))
      .status,
    409,
  );
  assert.equal(
    (await pay(invoiceC._id, "1.00", { externalReference: "bank-001" })).status,
    409,
  );
  assert.equal(await Payment.countDocuments({ schoolId: school._id }), before);
  const all = await Payment.find({ schoolId: school._id });
  assert.equal(
    new Set(all.map((payment) => payment.reference)).size,
    all.length,
  );
  const duplicate = (await Payment.findById(paymentA._id)).toObject();
  delete duplicate._id;
  duplicate.requestKey = randomUUID();
  delete duplicate.externalReference;
  await assert.rejects(
    Payment.create(duplicate),
    (error) => error.code === 11000,
  );
});

test("discounts, scholarships and signed adjustments require reasons, revisions and retry keys", async () => {
  let invoice = await fetchInvoice(invoiceC._id);
  const scholarship = {
    kind: "scholarship",
    amount: "10.01",
    reason: "Approved academic scholarship",
    revision: invoice.revision,
    requestKey: randomUUID(),
  };
  assert.equal(
    (await write("post", `/invoices/${invoiceC._id}/entries`, scholarship))
      .status,
    201,
  );
  assert.equal(
    (await write("post", `/invoices/${invoiceC._id}/entries`, scholarship))
      .status,
    200,
  );
  assert.equal(
    (
      await write("post", `/invoices/${invoiceC._id}/entries`, {
        ...scholarship,
        amount: "10.02",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await write("post", `/invoices/${invoiceC._id}/entries`, {
        ...scholarship,
        requestKey: randomUUID(),
      })
    ).status,
    409,
  );
  for (const [kind, amount] of [
    ["discount", "5.00"],
    ["adjustment", "2.00"],
    ["adjustment", "-0.04"],
  ]) {
    invoice = await fetchInvoice(invoiceC._id);
    assert.equal(
      (
        await write(
          "post",
          `/invoices/${invoiceC._id}/entries`,
          {
            kind,
            amount,
            reason: "Authorised review",
            revision: invoice.revision,
            requestKey: randomUUID(),
          },
          editorAgent,
        )
      ).status,
      201,
    );
  }
  invoice = await fetchInvoice(invoiceC._id);
  assert.equal(invoice.discountMinor, 1501);
  assert.equal(invoice.adjustmentMinor, 196);
  assert.equal(invoice.balanceMinor, 10700);
  assert.equal(
    await InvoiceEntry.countDocuments({
      schoolId: school._id,
      invoiceId: invoiceC._id,
    }),
    4,
  );
  for (const extra of [
    { reason: "" },
    { amount: "-1.00", kind: "discount" },
    { amount: "0" },
    { amount: "100000.00" },
    { schoolId: otherSchool.id },
  ])
    assert.equal(
      [400, 409].includes(
        (
          await write("post", `/invoices/${invoiceC._id}/entries`, {
            kind: "discount",
            amount: "1.00",
            reason: "Review",
            revision: invoice.revision,
            requestKey: randomUUID(),
            ...extra,
          })
        ).status,
      ),
      true,
    );
});

test("issued and paid invoice lines cannot be edited and over-crediting a paid invoice is blocked", async () => {
  const paid = await fetchInvoice(invoiceA._id);
  assert.equal(
    (await write("put", `/invoices/${invoiceA._id}`, { billedMinor: 1 }))
      .status,
    405,
  );
  assert.equal(
    (
      await write("post", `/invoices/${invoiceA._id}/entries`, {
        kind: "discount",
        amount: "0.01",
        reason: "Attempted over-credit",
        revision: paid.revision,
        requestKey: randomUUID(),
      })
    ).status,
    409,
  );
  assert.equal((await fetchInvoice(invoiceA._id)).billedMinor, 15010);
  assert.equal((await fetchInvoice(invoiceA._id)).paidMinor, 15010);
});

test("financial reports reconcile billed, discounts, adjustments, collections and outstanding by category", async () => {
  const res = await agent.get("/api/school/finance/reports");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.totals, {
    billedMinor: "27020",
    discountMinor: "1501",
    adjustmentMinor: "196",
    paidMinor: "15015",
    balanceMinor: "10700",
  });
  assert.equal(res.body.byClass.length, 2);
  assert.equal(res.body.byTerm.length, 1);
  assert.equal(res.body.byCategory.length, 2);
  for (const field of [
    "billedMinor",
    "discountMinor",
    "adjustmentMinor",
    "paidMinor",
    "balanceMinor",
  ])
    assert.equal(
      res.body.byCategory
        .reduce((sum, row) => sum + BigInt(row[field]), 0n)
        .toString(),
      res.body.totals[field],
    );
  for (const row of res.body.byCategory)
    assert.equal(
      BigInt(row.billedMinor) -
        BigInt(row.discountMinor) +
        BigInt(row.adjustmentMinor) -
        BigInt(row.paidMinor),
      BigInt(row.balanceMinor),
    );
  assert.deepEqual(allocateMinor(1, [1, 1, 1]), [1n, 0n, 0n]);
  assert.deepEqual(allocateMinor(2, [1, 1, 1]), [1n, 1n, 0n]);
});

test("payment reversals retain original amounts, reopen balances, and append complete actor audit", async () => {
  assert.equal(
    (await write("post", `/payments/${paymentA._id}/reverse`, { reason: "" }))
      .status,
    400,
  );
  const res = await write(
    "post",
    `/payments/${paymentA._id}/reverse`,
    { reason: "Bank deposit recorded in error" },
    editorAgent,
  );
  assert.equal(res.status, 200);
  assert.equal(res.body.record.amountMinor, 5001);
  assert.equal(res.body.record.status, "reversed");
  assert.equal(res.body.record.reversedByName, editor.name);
  assert.ok(res.body.record.reversedAt);
  assert.equal((await fetchInvoice(invoiceA._id)).paidMinor, 10009);
  assert.equal((await fetchInvoice(invoiceA._id)).balanceMinor, 5001);
  assert.equal(
    (
      await write("post", `/payments/${paymentA._id}/reverse`, {
        reason: "Second reversal attempt",
      })
    ).status,
    409,
  );
  assert.equal(
    (await write("post", "/payments", paymentPayload)).body.record.status,
    "reversed",
  );
  const audit = await FinanceAudit.findOne({
    schoolId: school._id,
    entityId: invoiceA._id,
    action: "payment_reversed",
  });
  assert.equal(audit.actorId.toString(), editor.id);
  assert.equal(audit.details.beforeBalance, 0);
  assert.equal(audit.details.afterBalance, 5001);
  assert.ok(audit.createdAt);
  const report = await agent.get("/api/school/finance/reports");
  assert.equal(report.body.totals.paidMinor, "10014");
  assert.equal(report.body.totals.balanceMinor, "15701");
  const receipt = await agent.get(
    `/api/school/finance/payments/${paymentA._id}/receipt`,
  );
  assert.equal(receipt.body.payment.balanceAfterMinor, 10009);
  assert.equal(receipt.body.payment.amountMinor, 5001);
  assert.equal(receipt.body.payment.status, "reversed");
});

test("student statements retain original payments and reversal ledger with a reconciled running balance", async () => {
  const statement = await agent.get(
    `/api/school/finance/students/${students[0].id}/statement`,
  );
  assert.equal(statement.status, 200);
  assert.equal(
    statement.body.student.admissionNumber,
    students[0].admissionNumber,
  );
  assert.equal(statement.body.student.address, undefined);
  assert.equal(
    statement.body.records.some(
      (row) => row.type === "Payment" && row.status === "reversed",
    ),
    true,
  );
  assert.equal(
    statement.body.records.some((row) => row.type === "Payment reversal"),
    true,
  );
  assert.equal(statement.body.records.at(-1).runningBalanceMinor, "5001");
  assert.equal(statement.body.totals.balanceMinor, "5001");
  const entries = await agent.get(
    `/api/school/finance/students/${students[2].id}/statement`,
  );
  assert.equal(entries.body.records.length, 5);
  assert.equal(entries.body.records.at(-1).runningBalanceMinor, "10700");
});

test("search, period/class/status filters, pagination and financial audit use real school records", async () => {
  assert.equal(
    (await agent.get("/api/school/finance/invoices?search=Alice")).body.total,
    1,
  );
  assert.equal(
    (await agent.get("/api/school/finance/invoices?search=.*")).body.total,
    0,
  );
  assert.equal(
    (await agent.get("/api/school/finance/invoices?status=paid")).body.total,
    1,
  );
  assert.equal(
    (
      await agent.get(
        `/api/school/finance/invoices?classId=${schoolClass.id}&termId=${term.id}`,
      )
    ).body.total,
    2,
  );
  assert.equal(
    (
      await agent.get(
        "/api/school/finance/payments?search=BANK-001&status=reversed",
      )
    ).body.total,
    1,
  );
  assert.equal(
    (
      await agent.get(
        `/api/school/finance/payments?studentId=${students[1].id}`,
      )
    ).body.total,
    3,
  );
  const first = await agent.get("/api/school/finance/invoices?limit=1"),
    second = await agent.get("/api/school/finance/invoices?limit=1&page=2");
  assert.equal(first.body.total, 3);
  assert.notEqual(first.body.records[0]._id, second.body.records[0]._id);
  const audit = await agent.get("/api/school/finance/audit?limit=2");
  assert.equal(audit.status, 200);
  assert.equal(audit.body.records.length, 2);
  assert.equal(audit.body.records[0].schoolId, undefined);
  assert.equal(
    (await agent.get("/api/school/finance/structures?history=all")).body.total,
    3,
  );
  assert.equal(
    (await agent.get("/api/school/finance/structures")).body.total,
    2,
  );
});

test("all financial references and endpoints enforce school isolation and safe retention", async () => {
  assert.equal(
    (await agent.get(`/api/school/finance/invoices/${foreignInvoice.id}`))
      .status,
    404,
  );
  assert.equal(
    (
      await write("post", "/payments", {
        invoiceId: foreignInvoice.id,
        amount: "1.00",
        methodId: "cash",
        paidOn: attendanceToday(),
        requestKey: randomUUID(),
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await write("post", `/payments/${foreignPayment.id}/reverse`, {
        reason: "Foreign reversal",
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await agent.get(
        `/api/school/finance/payments/${foreignPayment.id}/receipt`,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await agent.get(
        `/api/school/finance/students/${foreignStudent.id}/statement`,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await agent.get(
        `/api/school/finance/reports?sessionId=${otherSession.id}`,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await write("post", "/invoices", {
        studentId: foreignStudent.id,
        structureId: newStructure._id,
      })
    ).status,
    404,
  );
  for (const [path, id] of [
    ["invoices", invoiceA._id],
    ["payments", paymentA._id],
    ["structures", structure._id],
    ["categories", categoryTuition],
    ["methods", customMethod],
  ])
    assert.equal((await write("delete", `/${path}/${id}`)).status, 405);
  assert.ok(await Payment.findById(paymentA._id));
  assert.equal((await Invoice.findById(foreignInvoice.id)).balanceMinor, 0);
  for (const query of ["schoolId=" + otherSchool.id, "page=0", "limit=100"])
    assert.equal(
      (await agent.get("/api/school/finance/reports?" + query)).status,
      400,
    );
});

test("concurrent payments cannot overpay a balance and inactive methods cannot receive new payments", async () => {
  assert.equal(
    (
      await write("put", `/methods/${customMethod}`, {
        name: "Cheque",
        status: "inactive",
      })
    ).status,
    200,
  );
  assert.equal(
    (await pay(invoiceC._id, "1.00", { methodId: customMethod })).status,
    400,
  );
  const results = await Promise.all(
    [1, 2].map(() => pay(invoiceC._id, "107.00")),
  );
  assert.deepEqual(results.map((result) => result.status).sort(), [201, 409]);
  assert.equal((await fetchInvoice(invoiceC._id)).balanceMinor, 0);
  assert.equal((await fetchInvoice(invoiceC._id)).paidMinor, 10700);
  const copy = {
    invoiceId: invoiceC._id,
    amount: "1.00",
    methodId: "cash",
    paidOn: "2099-01-01",
    requestKey: randomUUID(),
  };
  assert.equal((await write("post", "/payments", copy)).status, 400);
});

test("finance permissions remain limited to active School Administrators with completed password setup", async () => {
  for (const client of [request(app), superAgent]) {
    const status = client === superAgent ? 403 : 401;
    for (const path of [
      "/context",
      "/reports",
      "/audit",
      "/invoices",
      "/payments",
      `/payments/${paymentA._id}/receipt`,
    ])
      assert.equal(
        (await client.get(`/api/school/finance${path}`)).status,
        status,
      );
    for (const [path, body] of [
      ["/categories", { name: "Unauthorized category" }],
      ["/structures", structureBody()],
      [
        "/invoices",
        { studentId: students[0].id, structureId: newStructure._id },
      ],
      ["/payments", paymentPayload],
      [
        `/payments/${paymentA._id}/reverse`,
        { reason: "Unauthorized reversal" },
      ],
      [
        `/invoices/${invoiceA._id}/entries`,
        {
          kind: "adjustment",
          amount: "1.00",
          reason: "Unauthorized change",
          revision: 1,
          requestKey: randomUUID(),
        },
      ],
    ])
      assert.equal((await send(client, "post", path, body)).status, status);
  }
  await User.findByIdAndUpdate(admin.id, { mustChangePassword: true });
  assert.equal(
    (await agent.get("/api/school/finance/reports")).body.code,
    "PASSWORD_CHANGE_REQUIRED",
  );
  await User.findByIdAndUpdate(admin.id, {
    mustChangePassword: false,
    isActive: false,
  });
  assert.equal((await agent.get("/api/school/finance/reports")).status, 401);
  await User.findByIdAndUpdate(admin.id, { isActive: true });
  await School.findByIdAndUpdate(school.id, { status: "suspended" });
  assert.equal((await agent.get("/api/school/finance/reports")).status, 403);
  assert.equal((await superAgent.get("/api/schools")).status, 200);
});
