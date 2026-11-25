import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import request from "supertest";
import bcrypt from "bcrypt";
import { createApp } from "../src/app.js";
import { User } from "../src/models/User.js";
import { School } from "../src/models/School.js";
import { Student } from "../src/models/Student.js";
import { Staff } from "../src/models/Staff.js";
import { StudentPortalAudit } from "../src/models/StudentPortalAudit.js";
import { AcademicSession } from "../src/models/AcademicSession.js";
import { AcademicTerm } from "../src/models/AcademicTerm.js";
import { SchoolClass } from "../src/models/SchoolClass.js";
import { Subject } from "../src/models/Subject.js";
import { Attendance } from "../src/models/Attendance.js";
import { Examination } from "../src/models/Examination.js";
import { ReportCard } from "../src/models/Result.js";
import { Invoice, Payment } from "../src/models/Finance.js";
const config = {
  NODE_ENV: "test",
  JWT_SECRET: "student-portal-test-secret-over-32-characters",
  FRONTEND_ORIGIN: "http://localhost:5173",
};
let mongo,
  app,
  adminAgent,
  portal,
  school,
  foreignSchool,
  admin,
  student,
  peer,
  foreign,
  schoolClass,
  subject,
  session,
  term,
  exam,
  card,
  peerCard,
  foreignCard,
  invoice,
  payment,
  peerPayment,
  temp;
const write = (agent, method, path, data) =>
  agent[method](path).set("Origin", config.FRONTEND_ORIGIN).send(data);
const account = (action, person = student) =>
  write(
    adminAgent,
    "post",
    `/api/school/students/${person.id}/portal-account`,
    { action },
  );
const signin = (agent, password, person = student) =>
  write(agent, "post", "/api/auth/student-login", {
    schoolId: String(person.schoolId),
    admissionNumber: person.admissionNumber.toLowerCase(),
    password,
  });
const change = (
  agent,
  currentPassword,
  newPassword = "Student-password-123!",
) =>
  write(agent, "post", "/api/auth/change-password", {
    currentPassword,
    newPassword,
  });
before(
  async () => {
    mongo = await MongoMemoryReplSet.create({
      replSet: { count: 1 },
      instanceOpts: [{ launchTimeout: 60000 }],
    });
    await mongoose.connect(mongo.getUri());
    await Promise.all(
      [
        User,
        School,
        Student,
        Staff,
        StudentPortalAudit,
        AcademicSession,
        AcademicTerm,
        SchoolClass,
        Subject,
        Attendance,
        Examination,
        ReportCard,
        Invoice,
        Payment,
      ].map((m) => m.init()),
    );
    const passwordHash = await bcrypt.hash("Admin-password-123!", 4);
    const owner = await User.create({
      name: "Owner",
      email: "owner@student.test",
      role: "super_admin",
      passwordHash,
    });
    [school, foreignSchool] = await School.create(
      ["Our School", "Other School"].map((name) => ({
        name,
        city: "Lagos",
        country: "Nigeria",
        schoolType: "Primary",
        createdBy: owner._id,
      })),
    );
    admin = await User.create({
      name: "Administrator",
      email: "admin@student.test",
      schoolId: school._id,
      role: "school_admin",
      passwordHash,
    });
    session = await AcademicSession.create({
      schoolId: school._id,
      name: "2026/2027",
      startDate: "2026-09-01",
      endDate: "2027-07-31",
      status: "active",
    });
    term = await AcademicTerm.create({
      schoolId: school._id,
      sessionId: session._id,
      name: "First Term",
      startDate: "2026-09-01",
      endDate: "2026-12-18",
      status: "active",
    });
    schoolClass = await SchoolClass.create({
      schoolId: school._id,
      name: "Primary 1",
      arms: ["A"],
      capacity: 30,
    });
    subject = await Subject.create({
      schoolId: school._id,
      classId: schoolClass._id,
      name: "Maths",
      code: "MTH",
      description: "Numbers",
    });
    await Subject.create({
      schoolId: school._id,
      classId: schoolClass._id,
      name: "Inactive subject",
      status: "inactive",
    });
    const base = {
      schoolId: school._id,
      firstName: "Ada",
      lastName: "Student",
      admissionNumber: "ADM-1",
      dateOfBirth: "2020-01-01",
      gender: "not_specified",
      address: "Private address",
      admissionDate: "2026-09-01",
      sessionId: session._id,
      classId: schoolClass._id,
      arm: "A",
      admissionStatus: "admitted",
      createdBy: admin._id,
      updatedBy: admin._id,
    };
    student = await Student.create(base);
    peer = await Student.create({
      ...base,
      firstName: "Peer",
      admissionNumber: "ADM-2",
    });
    foreign = await Student.create({ ...base, schoolId: foreignSchool._id });
    await Staff.create({
      schoolId: school._id,
      employeeId: "T-1",
      fullName: "Assigned Teacher",
      email: "teacher@student.test",
      phone: "08012345678",
      employmentDate: "2020-01-01",
      department: "Primary",
      designation: "Teacher",
      employmentType: "full_time",
      category: "teaching",
      classIds: [schoolClass._id],
      subjectIds: [subject._id],
      createdBy: admin._id,
      updatedBy: admin._id,
    });
    await Attendance.create(
      ["present", "late", "absent", "excused"].map((status, i) => ({
        schoolId: school._id,
        kind: "student",
        personId: student._id,
        date: `2026-09-${10 + i}`,
        sessionId: session._id,
        classId: schoolClass._id,
        arm: "A",
        personName: "Ada Student",
        identifier: student.admissionNumber,
        status,
        createdBy: admin._id,
        updatedBy: admin._id,
        createdByName: admin.name,
        updatedByName: admin.name,
      })),
    );
    await Attendance.create({
      schoolId: school._id,
      kind: "student",
      personId: peer._id,
      date: "2026-09-10",
      sessionId: session._id,
      classId: schoolClass._id,
      arm: "A",
      personName: "Peer Student",
      identifier: peer.admissionNumber,
      status: "absent",
      createdBy: admin._id,
      updatedBy: admin._id,
      createdByName: admin.name,
      updatedByName: admin.name,
    });
    exam = await Examination.create({
      schoolId: school._id,
      name: "Published exam",
      sessionId: session._id,
      termId: term._id,
      classId: schoolClass._id,
      status: "published",
      publicationNumber: 1,
      subjects: [{ subjectId: subject._id, name: "Maths" }],
    });
    const snapshot = {
      school: { name: school.name },
      examinationName: "Published exam",
      sessionName: session.name,
      termName: term.name,
      className: schoolClass.name,
      studentName: "Ada Student",
      admissionNumber: student.admissionNumber,
      components: [
        { key: "ca", name: "CA", maxMarks: 40, weight: 40 },
        { key: "exam", name: "Exam", maxMarks: 60, weight: 60 },
      ],
      totalMarks: 100,
      subjects: [
        {
          subjectId: subject.id,
          subjectName: "Maths",
          scores: { ca: 30, exam: 50 },
          totalHundredths: 8000,
          grade: "A",
          remark: "Great",
          teacherComment: "Well done",
        },
      ],
      overallAverageHundredths: 8000,
      overallGrade: "A",
      overallRemark: "Great",
      position: 1,
      cohortCount: 2,
      subjectAverages: [{ private: "must not expose" }],
      attendance: {
        present: 1,
        absent: 1,
        late: 1,
        excused: 1,
        totalRecorded: 4,
        attendancePercentage: 66.67,
      },
    };
    card = await ReportCard.create({
      schoolId: school._id,
      studentId: student._id,
      examinationId: exam._id,
      publication: 1,
      snapshot,
      publishedBy: admin._id,
      publishedByName: admin.name,
    });
    peerCard = await ReportCard.create({
      schoolId: school._id,
      studentId: peer._id,
      examinationId: exam._id,
      publication: 1,
      snapshot: { ...snapshot, studentName: "Peer Student" },
      publishedBy: admin._id,
    });
    foreignCard = await ReportCard.create({
      schoolId: foreignSchool._id,
      studentId: foreign._id,
      examinationId: exam._id,
      publication: 1,
      snapshot,
      publishedBy: admin._id,
    });
    invoice = await Invoice.create({
      schoolId: school._id,
      studentId: student._id,
      sessionId: session._id,
      termId: term._id,
      classId: schoolClass._id,
      feeStructureId: new mongoose.Types.ObjectId(),
      reference: "INV-1",
      billedMinor: 10001,
      paidMinor: 3000,
      balanceMinor: 7001,
      createdBy: admin._id,
      createdByName: "Internal admin name",
    });
    const pbase = {
      schoolId: school._id,
      invoiceId: invoice._id,
      studentId: student._id,
      reference: "PAY-1",
      requestKey: "key1",
      fingerprint: "fp",
      amountMinor: 3000,
      balanceAfterMinor: 7001,
      paidOn: "2026-09-10",
      methodName: "Cash",
      studentName: "Ada Student",
      admissionNumber: student.admissionNumber,
      createdBy: admin._id,
      reversalReason: "Private internal note",
    };
    payment = await Payment.create(pbase);
    peerPayment = await Payment.create({
      ...pbase,
      studentId: peer._id,
      reference: "PAY-PEER",
      requestKey: "key2",
    });
    app = createApp(config);
    adminAgent = request.agent(app);
    portal = request.agent(app);
    assert.equal(
      (
        await write(adminAgent, "post", "/api/auth/school-login", {
          email: admin.email,
          password: "Admin-password-123!",
        })
      ).status,
      200,
    );
  },
  { timeout: 120000 },
);
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

test("administrators provision one hashed, linked, email-free student login and cannot provision foreign students", async () => {
  assert.equal((await account("create", foreign)).status, 404);
  const result = await account("create");
  assert.equal(result.status, 201);
  temp = result.body.temporaryPassword;
  assert.ok(temp.length >= 32);
  const user = await User.findById(result.body.account.id).select(
    "+passwordHash",
  );
  assert.equal(user.role, "student");
  assert.equal(String(user.studentId), student.id);
  assert.ok(await bcrypt.compare(temp, user.passwordHash));
  assert.equal((await account("create")).status, 409);
  const view = await adminAgent.get(
    `/api/school/students/${student.id}/portal-account`,
  );
  assert.equal(view.body.temporaryPassword, undefined);
  assert.equal(view.body.account.passwordHash, undefined);
  assert.equal(view.body.schoolId, school.id);
  assert.equal(
    await StudentPortalAudit.countDocuments({ action: "create" }),
    1,
  );
});

test("school-scoped admission login, HttpOnly cookie and mandatory first password change", async () => {
  assert.equal((await signin(portal, temp, foreign)).status, 401);
  const login = await signin(portal, temp);
  assert.equal(login.status, 200);
  assert.match(login.headers["set-cookie"][0], /HttpOnly/);
  assert.equal(login.body.user.email, undefined);
  assert.equal(
    (await portal.get("/api/student/dashboard")).body.code,
    "PASSWORD_CHANGE_REQUIRED",
  );
  assert.equal((await change(portal, "wrong-password")).status, 400);
  assert.equal((await change(portal, temp)).status, 200);
  assert.equal((await portal.get("/api/student/dashboard")).status, 200);
});

test("same admission number in another school authenticates only to its linked records", async () => {
  const user = await User.create({
    schoolId: foreignSchool._id,
    studentId: foreign._id,
    name: "Foreign student",
    email: `student-${foreign.id}@portal.invalid`,
    passwordHash: await bcrypt.hash("Foreign-password-123!", 4),
    role: "student",
  });
  const agent = request.agent(app);
  assert.equal(
    (await signin(agent, "Foreign-password-123!", foreign)).status,
    200,
  );
  assert.equal(
    (await agent.get("/api/student/context")).body.student._id,
    foreign.id,
  );
  assert.equal(
    (await agent.get(`/api/student/report-cards/${card.id}`)).status,
    404,
  );
  assert.equal(user.role, "student");
});

test("personal dashboard/profile use database records and omit private data", async () => {
  const dashboard = await portal.get("/api/student/dashboard");
  assert.equal(dashboard.body.subjects, 1);
  assert.equal(dashboard.body.publishedResults, 1);
  assert.equal(dashboard.body.attendance.totalRecorded, 4);
  assert.equal(dashboard.body.attendance.attendancePercentage, 66.67);
  assert.equal(dashboard.body.fees, undefined);
  const context = await portal.get("/api/student/context");
  assert.equal(context.body.student._id, student.id);
  for (const key of ["address", "dateOfBirth", "createdBy", "updatedBy"])
    assert.equal(context.body.student[key], undefined);
  assert.equal(
    (await portal.get("/api/student/context").query({ studentId: peer.id }))
      .status,
    400,
  );
  assert.equal(
    (await portal.get(`/api/student/students/${peer.id}`)).status,
    404,
  );
});

test("subjects reflect active configuration and explicitly related teacher names only", async () => {
  const response = await portal.get("/api/student/subjects");
  assert.equal(response.body.records.length, 1);
  assert.equal(response.body.records[0].code, "MTH");
  assert.deepEqual(response.body.records[0].teachers, ["Assigned Teacher"]);
  await Subject.updateOne({ _id: subject._id }, { status: "inactive" });
  assert.equal(
    (await portal.get("/api/student/subjects")).body.records.length,
    0,
  );
  await Subject.updateOne({ _id: subject._id }, { status: "active" });
});

test("attendance is personal, paginated, term/session filtered and monthly summaries retain calculation rules", async () => {
  const response = await portal
    .get("/api/student/attendance")
    .query({ sessionId: session.id, termId: term.id, limit: 1 });
  assert.equal(response.status, 200);
  assert.equal(response.body.total, 4);
  assert.equal(response.body.records.length, 1);
  assert.equal(response.body.summary.excused, 1);
  assert.equal(response.body.summary.absent, 1);
  assert.equal(response.body.monthly[0].attendancePercentage, 66.67);
  assert.equal(response.body.records[0].personName, undefined);
  assert.equal(
    (await portal.get("/api/student/attendance").query({ personId: peer.id }))
      .status,
    400,
  );
  assert.equal(
    (
      await portal
        .get("/api/student/attendance")
        .query({ termId: new mongoose.Types.ObjectId().toString() })
    ).status,
    404,
  );
  assert.equal(
    (await write(portal, "put", "/api/student/attendance", {})).status,
    404,
  );
});

test("report cards use own published snapshot scores, comments and historic grades", async () => {
  const list = await portal
    .get("/api/student/report-cards")
    .query({ sessionId: session.id, termId: term.id });
  assert.equal(list.body.total, 1);
  assert.equal(list.body.records[0]._id, card.id);
  const response = await portal.get(`/api/student/report-cards/${card.id}`);
  assert.equal(response.status, 200);
  assert.equal(response.body.card.snapshot.subjects[0].scores.ca, 30);
  assert.equal(
    response.body.card.snapshot.subjects[0].teacherComment,
    "Well done",
  );
  assert.equal(response.body.card.snapshot.subjectAverages, undefined);
  assert.equal(
    (await portal.get(`/api/student/report-cards/${peerCard.id}`)).status,
    404,
  );
  assert.equal(
    (await portal.get(`/api/student/report-cards/${foreignCard.id}`)).status,
    404,
  );
  assert.equal(
    (
      await portal
        .get(`/api/student/report-cards/${card.id}`)
        .query({ studentId: peer.id })
    ).status,
    400,
  );
});

test("draft, submitted, approved, withdrawn and superseded report cards cannot be read directly", async () => {
  for (const status of ["draft", "submitted", "approved"]) {
    await Examination.updateOne({ _id: exam._id }, { status });
    assert.equal((await portal.get("/api/student/report-cards")).body.total, 0);
    assert.equal(
      (await portal.get(`/api/student/report-cards/${card.id}`)).status,
      404,
    );
    assert.equal(
      (await portal.get("/api/student/dashboard")).body.publishedResults,
      0,
    );
  }
  await Examination.updateOne(
    { _id: exam._id },
    { status: "published", publicationNumber: 2 },
  );
  assert.equal(
    (await portal.get(`/api/student/report-cards/${card.id}`)).status,
    404,
  );
  await Examination.updateOne({ _id: exam._id }, { publicationNumber: 1 });
});

test("finance defaults off, administrator enables it, students see only exact own totals and safe payments", async () => {
  assert.equal((await portal.get("/api/student/fees")).status, 403);
  assert.equal(
    (await portal.get(`/api/student/fees/receipts/${payment.id}`)).status,
    403,
  );
  assert.equal(
    (
      await write(portal, "put", "/api/school/student-portal-settings", {
        enabled: true,
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await write(adminAgent, "put", "/api/school/student-portal-settings", {
        enabled: true,
      })
    ).status,
    200,
  );
  const response = await portal.get("/api/student/fees");
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.summary, {
    billedMinor: 10001,
    paidMinor: 3000,
    balanceMinor: 7001,
  });
  assert.equal(response.body.payments.length, 1);
  assert.equal(response.body.payments[0].reversalReason, undefined);
  assert.equal(response.body.records[0].createdByName, undefined);
  assert.equal(
    (await portal.get("/api/student/dashboard")).body.fees.balanceMinor,
    7001,
  );
  assert.equal(
    (await portal.get(`/api/student/fees/receipts/${payment.id}`)).status,
    200,
  );
  assert.equal(
    (await portal.get(`/api/student/fees/receipts/${peerPayment.id}`)).status,
    404,
  );
  assert.equal(
    (await portal.get("/api/student/fees").query({ studentId: peer.id }))
      .status,
    400,
  );
  await Payment.updateOne({ _id: payment._id }, { status: "reversed" });
  assert.equal(
    (await portal.get(`/api/student/fees/receipts/${payment.id}`)).status,
    404,
  );
  await write(adminAgent, "put", "/api/school/student-portal-settings", {
    enabled: false,
  });
  assert.equal((await portal.get("/api/student/fees")).status, 403);
});

test("student cannot reach administrator/teacher modules or mutate official records and origin checks remain", async () => {
  for (const path of [
    "/api/schools",
    "/api/school/students",
    "/api/teacher/dashboard",
    "/api/school/examinations",
    "/api/school/finance/reports",
  ])
    assert.equal((await portal.get(path)).status, 403);
  assert.equal(
    (
      await write(portal, "put", `/api/school/students/${student.id}`, {
        role: "school_admin",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await write(
        portal,
        "post",
        `/api/school/students/${student.id}/portal-account`,
        { action: "reset" },
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await portal.post("/api/auth/change-password").send({
        currentPassword: "Student-password-123!",
        newPassword: "Other-password-123!",
      })
    ).status,
    403,
  );
  assert.equal((await adminAgent.get("/api/student/context")).status, 403);
  assert.equal((await request(app).get("/api/student/context")).status, 401);
});

test("administrator reset revokes sessions, returns one-time password and enforces password change", async () => {
  const old = request.agent(app);
  await signin(old, "Student-password-123!");
  const result = await account("reset");
  assert.equal(result.status, 200);
  temp = result.body.temporaryPassword;
  assert.equal((await old.get("/api/student/context")).status, 401);
  assert.equal((await signin(portal, "Student-password-123!")).status, 401);
  assert.equal((await signin(portal, temp)).status, 200);
  assert.equal(
    (await portal.get("/api/student/context")).body.code,
    "PASSWORD_CHANGE_REQUIRED",
  );
  assert.equal((await change(portal, temp)).status, 200);
  assert.equal(await StudentPortalAudit.countDocuments({ action: "reset" }), 1);
});

test("account deactivation and reactivation never restore an old session", async () => {
  const old = request.agent(app);
  await signin(old, "Student-password-123!");
  assert.equal((await account("deactivate")).status, 200);
  assert.equal((await old.get("/api/student/context")).status, 401);
  assert.equal((await signin(portal, "Student-password-123!")).status, 401);
  assert.equal((await account("activate")).status, 200);
  assert.equal((await old.get("/api/student/context")).status, 401);
  assert.equal((await signin(portal, "Student-password-123!")).status, 200);
});

test("inactive and archived enrolments revoke sessions and block login and account activation", async () => {
  app = createApp(config);
  portal = request.agent(app);
  assert.equal((await signin(portal, "Student-password-123!")).status, 200);
  for (const status of ["inactive", "archived"]) {
    assert.equal(
      (
        await write(
          adminAgent,
          "patch",
          `/api/school/students/${student.id}/status`,
          { status },
        )
      ).status,
      200,
    );
    assert.equal((await portal.get("/api/student/context")).status, 401);
    assert.equal((await signin(portal, "Student-password-123!")).status, 403);
    assert.equal((await account("activate")).status, 400);
    await Student.updateOne({ _id: student._id }, { status: "active" });
    assert.equal((await portal.get("/api/student/context")).status, 401);
    await signin(portal, "Student-password-123!");
  }
});

test("suspended schools block active sessions and student login", async () => {
  await School.updateOne({ _id: school._id }, { status: "suspended" });
  assert.equal((await portal.get("/api/student/context")).status, 403);
  assert.equal((await signin(portal, "Student-password-123!")).status, 403);
  await School.updateOne({ _id: school._id }, { status: "active" });
});

test("concurrent duplicate provisioning is atomic and another student receives only their own snapshot", async () => {
  const outcomes = await Promise.all([
    account("create", peer),
    account("create", peer),
  ]);
  assert.deepEqual(outcomes.map((r) => r.status).sort(), [201, 409]);
  const credentials = outcomes.find((r) => r.status === 201).body;
  const agent = request.agent(createApp(config));
  assert.equal(
    (await signin(agent, credentials.temporaryPassword, peer)).status,
    200,
  );
  assert.equal(
    (await change(agent, credentials.temporaryPassword)).status,
    200,
  );
  const cards = await agent.get("/api/student/report-cards");
  assert.equal(cards.body.total, 1);
  assert.equal(cards.body.records[0]._id, peerCard.id);
  assert.equal(
    (await agent.get("/api/student/report-cards/" + card.id)).status,
    404,
  );
});

test("student login remains rate limited and rejects field injection", async () => {
  const local = request.agent(createApp(config));
  for (let i = 0; i < 10; i++)
    assert.equal(
      (
        await write(local, "post", "/api/auth/student-login", {
          schoolId: school.id,
          admissionNumber: student.admissionNumber,
          password: "wrong",
          role: "school_admin",
        })
      ).status,
      400,
    );
  assert.equal((await signin(local, "Student-password-123!")).status, 429);
});
