import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import request from "supertest";
import bcrypt from "bcrypt";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createApp } from "../src/app.js";
import { User } from "../src/models/User.js";
import { School } from "../src/models/School.js";
import { Student } from "../src/models/Student.js";
import { Guardian } from "../src/models/Guardian.js";
import { StudentGuardian } from "../src/models/StudentGuardian.js";
import { Staff } from "../src/models/Staff.js";
import { TeacherAssignment } from "../src/models/TeacherAssignment.js";
import { AcademicSession } from "../src/models/AcademicSession.js";
import { AcademicTerm } from "../src/models/AcademicTerm.js";
import { SchoolClass } from "../src/models/SchoolClass.js";
import { Subject } from "../src/models/Subject.js";
import {
  AdmissionApplication,
  AdmissionAudit,
  DocumentCounter,
  ReferenceReservation,
  IssuedDocument,
  StudentMedical,
  initialiseAdmissions,
} from "../src/models/Admissions.js";
import { issueYear } from "../src/services/admissionCommon.js";
const config = {
  NODE_ENV: "test",
  JWT_SECRET: "admissions-tests-secret-over-32-characters",
  FRONTEND_ORIGIN: "http://localhost:5173",
};
let mongo,
  app,
  agent,
  foreignAgent,
  teacherAgent,
  studentAgent,
  school,
  otherSchool,
  admin,
  schoolSession,
  term,
  foreignSession,
  schoolClass,
  foreignClass,
  guardian,
  foreignGuardian,
  teaching,
  nonTeaching,
  legacyStudent,
  application,
  spare,
  enrolled,
  secondChild,
  thirdChild,
  enrolPayload,
  usersBefore,
  studentsBefore,
  originalDocument,
  concurrentApplications;
const url = "/api/school/";
const write = (method, path, body, client = agent) =>
  client[method](url + path)
    .set("Origin", config.FRONTEND_ORIGIN)
    .send(body);
const create = (extra = {}, client = agent) =>
  write(
    "post",
    "applications",
    {
      requestKey: randomUUID(),
      sessionId: schoolSession.id,
      classId: schoolClass.id,
      arm: "GOLD",
      ...extra,
    },
    client,
  );
const read = async (id) =>
  (await agent.get(url + `applications/${id}`)).body.application;
const status = async (
  a,
  next,
  reason = "Administrator reviewed this decision",
) => {
  const current = await read(a._id);
  return write("post", `applications/${a._id}/status`, {
    revision: current.revision,
    status: next,
    reason,
  });
};
const matchedGuardian = () => ({
  guardianId: guardian.id,
  fullName: guardian.fullName,
  primaryPhone: guardian.primaryPhone,
  verified: true,
  createNewConfirmed: false,
  relationship: "mother",
});
const draft = (a, changes = {}) => ({
  revision: a.revision,
  sessionId: schoolSession.id,
  classId: schoolClass.id,
  arm: "GOLD",
  student: {
    firstName: "Ada",
    middleName: "",
    lastName: "Applicant",
    dateOfBirth: "2020-01-01",
    gender: "female",
    address: "Private applicant address",
    nationality: "Nigerian",
    previousSchool: "Previous primary school",
  },
  guardians: [matchedGuardian()],
  receivedDocuments: [],
  ...changes,
});
async function ready(a, changes = {}) {
  const saved = await write(
    "put",
    `applications/${a._id}`,
    draft(await read(a._id), changes),
  );
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  for (const next of ["form_received", "under_review", "approved"]) {
    const result = await status(a, next);
    assert.equal(result.status, 200, JSON.stringify(result.body));
  }
  return read(a._id);
}
const enrolBody = (a) => ({
  revision: a.revision,
  admissionDate: "2026-10-01",
  classId: schoolClass.id,
  arm: "GOLD",
});
const studentBody = (record, changes = {}) => ({
  firstName: record.firstName,
  middleName: record.middleName || "",
  lastName: record.lastName,
  admissionNumber: record.admissionNumber,
  dateOfBirth: "2020-01-01",
  gender: record.gender || "not_specified",
  address: "Private applicant address",
  previousSchool: "",
  admissionDate: "2026-10-01",
  admissionStatus: "admitted",
  sessionId: schoolSession.id,
  classId: schoolClass.id,
  arm: "GOLD",
  ...changes,
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
        Guardian,
        StudentGuardian,
        Staff,
        TeacherAssignment,
        AcademicSession,
        AcademicTerm,
        SchoolClass,
        Subject,
      ].map((m) => m.init()),
    );
    await initialiseAdmissions();
    const passwordHash = await bcrypt.hash("Test-password-123!", 4);
    const owner = await User.create({
      name: "Owner",
      email: "owner@admissions.test",
      role: "super_admin",
      passwordHash,
    });
    [school, otherSchool] = await School.create(
      ["Admission School", "Other School"].map((name, i) => ({
        name,
        documentPrefix: i ? "OTHER" : "BFIS",
        city: "Lagos",
        country: "Nigeria",
        address: "School address",
        phone: "08012345678",
        email: `school${i}@admissions.test`,
        schoolType: "Primary",
        createdBy: owner._id,
      })),
    );
    admin = await User.create({
      name: "School Admin",
      email: "admin@admissions.test",
      role: "school_admin",
      schoolId: school._id,
      passwordHash,
    });
    const otherAdmin = await User.create({
      name: "Other Admin",
      email: "other@admissions.test",
      role: "school_admin",
      schoolId: otherSchool._id,
      passwordHash,
    });
    [schoolSession, foreignSession] = await AcademicSession.create(
      [school, otherSchool].map((s) => ({
        schoolId: s._id,
        name: "2026/2027",
        startDate: "2026-09-01",
        endDate: "2027-07-31",
        status: "active",
      })),
    );
    term = await AcademicTerm.create({
      schoolId: school._id,
      sessionId: schoolSession._id,
      name: "First Term",
      startDate: "2026-09-01",
      endDate: "2026-12-18",
      status: "active",
    });
    [schoolClass, foreignClass] = await SchoolClass.create(
      [school, otherSchool].map((s) => ({
        schoolId: s._id,
        name: "Primary 1",
        arms: ["GOLD", "SILVER"],
        capacity: 100,
      })),
    );
    const subject = await Subject.create({
      schoolId: school._id,
      classId: schoolClass._id,
      name: "Mathematics",
    });
    const staffBase = {
      schoolId: school._id,
      phone: "08012345678",
      address: "Staff address",
      employmentDate: "2020-01-01",
      department: "Primary",
      designation: "Teacher",
      employmentType: "full_time",
      createdBy: admin._id,
      updatedBy: admin._id,
    };
    teaching = await Staff.create({
      ...staffBase,
      fullName: "Assigned Teacher",
      employeeId: "T-LEGACY",
      email: "teacher@admissions.test",
      category: "teaching",
      assignmentMode: "explicit",
    });
    nonTeaching = await Staff.create({
      ...staffBase,
      fullName: "Office Staff",
      employeeId: "ST-LEGACY",
      email: "staff@admissions.test",
      category: "non_teaching",
    });
    await TeacherAssignment.create({
      schoolId: school._id,
      staffId: teaching._id,
      sessionId: schoolSession._id,
      termId: term._id,
      classId: schoolClass._id,
      arm: "GOLD",
      subjectId: subject._id,
      kind: "teaching",
      createdBy: admin._id,
      updatedBy: admin._id,
    });
    const teacher = await User.create({
      name: teaching.fullName,
      email: teaching.email,
      schoolId: school._id,
      staffId: teaching._id,
      role: "teacher",
      passwordHash,
    });
    legacyStudent = await Student.create({
      schoolId: school._id,
      admissionNumber: `BFIS/STD/${issueYear()}/0001`,
      firstName: "Existing",
      lastName: "Student",
      dateOfBirth: "2020-01-01",
      gender: "not_specified",
      address: "Private address",
      admissionDate: "2026-09-01",
      sessionId: schoolSession._id,
      classId: schoolClass._id,
      arm: "GOLD",
      admissionStatus: "admitted",
      createdBy: admin._id,
      updatedBy: admin._id,
    });
    await User.create({
      name: "Existing student",
      email: `student-${legacyStudent.id}@portal.invalid`,
      schoolId: school._id,
      studentId: legacyStudent._id,
      role: "student",
      passwordHash,
    });
    [guardian, foreignGuardian] = await Guardian.create(
      [school, otherSchool].map((s, i) => ({
        schoolId: s._id,
        fullName: i ? "Foreign Parent" : "Verified Parent",
        primaryPhone: "08011112222",
        alternativePhone: "08022223333",
        address: "Guardian address",
        email: "",
        occupation: "Trader",
        createdBy: i ? otherAdmin._id : admin._id,
        updatedBy: i ? otherAdmin._id : admin._id,
      })),
    );
    app = createApp(config);
    agent = request.agent(app);
    foreignAgent = request.agent(app);
    teacherAgent = request.agent(app);
    studentAgent = request.agent(app);
    for (const [client, person, route] of [
      [agent, admin, "school-login"],
      [foreignAgent, otherAdmin, "school-login"],
      [teacherAgent, teacher, "teacher-login"],
    ])
      assert.equal(
        (
          await client
            .post(`/api/auth/${route}`)
            .set("Origin", config.FRONTEND_ORIGIN)
            .send({ email: person.email, password: "Test-password-123!" })
        ).status,
        200,
      );
    assert.equal(
      (
        await studentAgent
          .post("/api/auth/student-login")
          .set("Origin", config.FRONTEND_ORIGIN)
          .send({
            schoolId: school.id,
            admissionNumber: legacyStudent.admissionNumber,
            password: "Test-password-123!",
          })
      ).status,
      200,
    );
    usersBefore = await User.countDocuments();
    studentsBefore = await Student.countDocuments();
  },
  { timeout: 120000 },
);
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

test("eleven generic templates are authorised, branded and untracked", async () => {
  const c = await agent.get(url + "forms/catalog");
  assert.equal(c.status, 200);
  assert.equal(c.body.types.length, 11);
  for (const t of c.body.types) {
    const r = await agent.get(url + `forms/templates/${t.type}`);
    assert.equal(r.status, 200);
    assert.equal(r.body.document.generic, true);
    assert.equal(r.body.document.reference, undefined);
    assert.equal(r.body.document.snapshot.school.name, school.name);
    assert.deepEqual(r.body.document.snapshot.student, {});
  }
  assert.equal(await ReferenceReservation.countDocuments(), 0);
  assert.equal(await IssuedDocument.countDocuments(), 0);
});
test("application generation reserves a reference without a student or account", async () => {
  const r = await create();
  assert.equal(r.status, 201, JSON.stringify(r.body));
  application = r.body.application;
  assert.equal(application.reference, `BFIS/APP/${issueYear()}/0001`);
  assert.equal(application.status, "awaiting_form");
  assert.notEqual(application._id, application.reference);
  assert.equal(await Student.countDocuments(), studentsBefore);
  assert.equal(await User.countDocuments(), usersBefore);
  originalDocument = await IssuedDocument.findById(application.documentId);
  assert.equal(originalDocument.reference, application.reference);
  assert.equal(originalDocument.templateVersion, 1);
});
test("concurrent generation produces unique database-backed application numbers", async () => {
  const results = await Promise.all(Array.from({ length: 8 }, () => create()));
  assert.ok(
    results.every((r) => r.status === 201),
    JSON.stringify(results.map((r) => r.body)),
  );
  concurrentApplications = results.map((r) => r.body.application);
  spare = concurrentApplications[0];
  assert.equal(new Set(concurrentApplications.map((a) => a.reference)).size, 8);
  assert.equal(
    (
      await DocumentCounter.findOne({
        schoolId: school._id,
        kind: "APP",
        year: issueYear(),
      })
    ).sequence,
    9,
  );
});
test("generation retries are idempotent and reject changed input or client numbers", async () => {
  const input = {
    requestKey: randomUUID(),
    sessionId: schoolSession.id,
    classId: schoolClass.id,
    arm: "GOLD",
  };
  const rs = await Promise.all([
    write("post", "applications", input),
    write("post", "applications", input),
  ]);
  assert.deepEqual(rs.map((r) => r.status).sort(), [200, 201]);
  assert.equal(rs[0].body.application._id, rs[1].body.application._id);
  assert.equal(
    (await write("post", "applications", { ...input, arm: "SILVER" })).status,
    409,
  );
  assert.equal((await create({ reference: "CLIENT/APP/1" })).status, 400);
});
test("numbering and application scope are isolated by school", async () => {
  const r = await create(
    { sessionId: foreignSession.id, classId: foreignClass.id },
    foreignAgent,
  );
  assert.equal(r.status, 201);
  assert.equal(r.body.application.reference, `OTHER/APP/${issueYear()}/0001`);
  for (const path of [
    `applications/${application._id}`,
    `documents/${application.documentId}`,
  ])
    assert.equal((await foreignAgent.get(url + path)).status, 404);
  for (const change of [
    { sessionId: foreignSession.id },
    { classId: foreignClass.id },
    { arm: "INVALID" },
  ])
    assert.equal((await create(change)).status, 400);
});
test("prefix and checklist changes never reset counters or renumber issued forms", async () => {
  const settings = {
    prefix: "NEW",
    privacyNotice:
      "The updated school notice covers admission administration and student safety. Contact the school for details.",
    checklist: ["Birth certificate", "School-required document"],
  };
  assert.equal((await write("put", "forms/settings", settings)).status, 200);
  const doc = await write("post", "documents", {
    requestKey: randomUUID(),
    type: "teacher_registration",
  });
  assert.equal(doc.status, 201);
  assert.equal(doc.body.document.reference, `NEW/TCH/${issueYear()}/0001`);
  const next = await create();
  assert.equal(next.status, 201);
  assert.match(next.body.application.reference, /^NEW\/APP\//);
  assert.notEqual(next.body.application.reference.split("/").at(-1), "0001");
  const r = await write(
    "post",
    `documents/${application.documentId}/prepare-print`,
    { prefill: true },
  );
  assert.equal(r.status, 200);
  assert.equal(r.body.document.reference, application.reference);
  assert.equal(
    r.body.document.snapshot.privacyNotice,
    originalDocument.snapshot.privacyNotice,
  );
  assert.deepEqual(
    r.body.document.snapshot.checklist,
    originalDocument.snapshot.checklist,
  );
  assert.equal(
    (await write("put", "forms/settings", { ...settings, prefix: "BFIS" }))
      .status,
    200,
  );
});

test("incomplete drafts save without workflow changes and reject stale or injected fields", async () => {
  const partial = draft(application, {
    student: { firstName: "Ada" },
    guardians: [],
  });
  const r = await write("put", `applications/${application._id}`, partial);
  assert.equal(r.status, 200);
  application = r.body.application;
  assert.equal(application.status, "awaiting_form");
  assert.equal(await Student.countDocuments(), studentsBefore);
  assert.equal(
    (await write("put", `applications/${application._id}`, partial)).status,
    409,
  );
  for (const change of [
    { medical: { conditions: "Private" } },
    { reference: "EDITED" },
  ])
    assert.equal(
      (
        await write("put", `applications/${application._id}`, {
          ...draft(application),
          ...change,
        })
      ).status,
      400,
    );
});
test("status transitions require valid workflow and decision reasons", async () => {
  assert.equal((await status(application, "approved")).status, 409);
  assert.equal((await status(application, "enrolled")).status, 400);
  assert.equal((await status(application, "form_received")).status, 200);
  assert.equal((await status(application, "under_review")).status, 200);
  assert.equal((await status(application, "approved", "")).status, 400);
  assert.equal((await status(application, "approved")).status, 400);
});
test("medical records are separate, restricted and revision checked", async () => {
  const input = {
    revision: 0,
    allergies: "Sensitive allergy",
    conditions: "Relevant confidential condition",
    safetyInstructions: "Guardian instructions",
    emergencyName: "Emergency Adult",
    emergencyPhone: "08099998888",
    emergencyRelationship: "Aunt",
    reason: "Returned safety form verified",
  };
  assert.equal(
    (await write("put", `applications/${application._id}/medical`, input))
      .status,
    200,
  );
  assert.equal(
    (await write("put", `applications/${application._id}/medical`, input))
      .status,
    409,
  );
  assert.equal(
    (await agent.get(url + `applications/${application._id}/medical`)).body
      .record.allergies,
    input.allergies,
  );
  for (const path of ["applications", `applications/${application._id}`])
    assert.equal(
      JSON.stringify((await agent.get(url + path)).body).includes(
        "Sensitive allergy",
      ),
      false,
    );
  for (const client of [teacherAgent, studentAgent])
    for (const path of [
      `applications/${application._id}/medical`,
      `forms/students/${legacyStudent.id}/medical`,
    ])
      assert.equal((await client.get(url + path)).status, 403);
  assert.equal(
    (await foreignAgent.get(url + `applications/${application._id}/medical`))
      .status,
    404,
  );
});
test("approval is separate from enrolment and requires explicit guardian verification", async () => {
  let current = await read(application._id);
  assert.equal(
    (
      await write(
        "put",
        `applications/${application._id}`,
        draft(current, {
          guardians: [{ ...matchedGuardian(), verified: false }],
        }),
      )
    ).status,
    200,
  );
  assert.equal((await status(application, "approved")).status, 200);
  current = await read(application._id);
  assert.equal(await Student.countDocuments(), studentsBefore);
  assert.equal(
    (
      await write(
        "post",
        `applications/${application._id}/enrol`,
        enrolBody(current),
      )
    ).status,
    400,
  );
  await status(application, "under_review");
  assert.equal(
    (
      await write(
        "put",
        `applications/${application._id}`,
        draft(await read(application._id)),
      )
    ).status,
    200,
  );
  assert.equal((await status(application, "approved")).status, 200);
  application = await read(application._id);
});
test("invalid conversion rolls back student, guardian and admission number allocation", async () => {
  spare = await ready(spare, {
    student: {
      firstName: "Incomplete",
      lastName: "Applicant",
      dateOfBirth: "",
      gender: "not_specified",
      address: "Valid address",
    },
    guardians: [
      {
        fullName: "New Guardian",
        primaryPhone: "invalid",
        address: "Valid address",
        relationship: "guardian",
        verified: true,
        createNewConfirmed: true,
      },
    ],
  });
  assert.equal(
    (await write("post", `applications/${spare._id}/enrol`, enrolBody(spare)))
      .status,
    400,
  );
  assert.equal(await Student.countDocuments(), studentsBefore);
  assert.equal(
    await ReferenceReservation.countDocuments({
      schoolId: school._id,
      kind: "STD",
    }),
    0,
  );
  await status(spare, "under_review");
  await write(
    "put",
    `applications/${spare._id}`,
    draft(await read(spare._id), {
      guardians: [
        {
          fullName: "New Guardian",
          primaryPhone: "invalid",
          address: "Valid address",
          relationship: "guardian",
          verified: true,
          createNewConfirmed: true,
        },
      ],
    }),
  );
  await status(spare, "approved");
  spare = await read(spare._id);
  assert.equal(
    (await write("post", `applications/${spare._id}/enrol`, enrolBody(spare)))
      .status,
    400,
  );
  assert.equal(await Student.countDocuments(), studentsBefore);
  assert.equal(await Guardian.countDocuments({ schoolId: school._id }), 1);
  assert.equal(
    await ReferenceReservation.countDocuments({
      schoolId: school._id,
      kind: "STD",
    }),
    0,
  );
});
test("concurrent enrolment is idempotent and preserves existing permanent identifiers", async () => {
  enrolPayload = enrolBody(application);
  const rs = await Promise.all([
    write("post", `applications/${application._id}/enrol`, enrolPayload),
    write("post", `applications/${application._id}/enrol`, enrolPayload),
  ]);
  assert.deepEqual(
    rs.map((r) => r.status).sort(),
    [200, 201],
    JSON.stringify(rs.map((r) => r.body)),
  );
  enrolled = rs[0].body.student;
  assert.equal(enrolled.admissionNumber, `BFIS/STD/${issueYear()}/0002`);
  assert.equal(enrolled.applicationReference, application.reference);
  assert.equal(enrolled.applicationId, application._id);
  assert.equal(
    await Student.countDocuments({ applicationId: application._id }),
    1,
  );
  assert.equal(await User.countDocuments(), usersBefore);
  assert.equal(await Guardian.countDocuments({ schoolId: school._id }), 1);
  assert.equal(
    await StudentGuardian.countDocuments({
      schoolId: school._id,
      studentId: enrolled._id,
      guardianId: guardian._id,
      isActive: true,
    }),
    1,
  );
  assert.equal((await read(application._id)).status, "enrolled");
  assert.equal(
    await AdmissionAudit.countDocuments({
      applicationId: application._id,
      action: "application_enrolled",
    }),
    1,
  );
  assert.equal(
    (
      await StudentMedical.findOne({ applicationId: application._id })
    ).studentId.toString(),
    enrolled._id,
  );
  assert.equal(
    (
      await write("post", `applications/${application._id}/enrol`, {
        ...enrolPayload,
        arm: "SILVER",
      })
    ).status,
    409,
  );
});
test("new application enrolment automatically appears in authorised teacher groups", async () => {
  const r = await teacherAgent
    .get("/api/teacher/students")
    .query({ search: "Ada" });
  assert.equal(r.status, 200);
  assert.equal(r.body.total, 1);
  assert.equal(r.body.records[0]._id, enrolled._id);
  assert.equal(r.body.records[0].medical, undefined);
  assert.equal(
    (await teacherAgent.get("/api/teacher/dashboard")).body.stats.students,
    2,
  );
});
test("a verified guardian links to multiple children without duplicate guardian records", async () => {
  const a = (await create()).body.application;
  const approved = await ready(a, {
    student: { ...draft(a).student, firstName: "Bola" },
  });
  const r = await write(
    "post",
    `applications/${a._id}/enrol`,
    enrolBody(approved),
  );
  assert.equal(r.status, 201, JSON.stringify(r.body));
  secondChild = r.body.student;
  assert.equal(await Guardian.countDocuments({ schoolId: school._id }), 1);
  assert.equal(
    await StudentGuardian.countDocuments({
      schoolId: school._id,
      guardianId: guardian._id,
      isActive: true,
    }),
    2,
  );
  const doc = await write("post", "documents", {
    requestKey: randomUUID(),
    type: "guardian_registration",
    guardianId: guardian.id,
    prefill: true,
  });
  assert.equal(doc.status, 201);
  assert.equal(doc.body.document.snapshot.children.length, 2);
});
test("shared phone numbers never automatically merge explicitly verified different guardians", async () => {
  const a = (await create()).body.application;
  const approved = await ready(a, {
    student: { ...draft(a).student, firstName: "Chidi" },
    guardians: [
      {
        fullName: "Different Adult",
        primaryPhone: guardian.primaryPhone,
        address: "Different household",
        relationship: "father",
        verified: true,
        createNewConfirmed: true,
      },
    ],
  });
  const r = await write(
    "post",
    `applications/${a._id}/enrol`,
    enrolBody(approved),
  );
  assert.equal(r.status, 201);
  thirdChild = r.body.student;
  assert.equal(
    await Guardian.countDocuments({
      schoolId: school._id,
      primaryPhone: guardian.primaryPhone,
    }),
    2,
  );
  assert.equal(
    (await Guardian.findById(guardian._id)).fullName,
    "Verified Parent",
  );
});
test("application and student search include original reference, admission number and guardian identity", async () => {
  assert.equal(
    (await agent.get(url + "students").query({ search: application.reference }))
      .body.records[0]._id,
    enrolled._id,
  );
  assert.equal(
    (
      await agent
        .get(url + "applications")
        .query({ search: enrolled.admissionNumber })
    ).body.records[0]._id,
    application._id,
  );
  assert.ok(
    (
      await agent.get(url + "applications").query({ search: "Ada Applicant" })
    ).body.records.some((a) => a._id === application._id),
  );
  assert.equal(
    (
      await agent
        .get(url + "applications")
        .query({ search: "Verified Parent", status: "enrolled" })
    ).body.total,
    2,
  );
  assert.equal(
    (await agent.get(url + "students").query({ search: guardian.primaryPhone }))
      .body.total,
    3,
  );
  assert.equal(
    (await agent.get(url + "students").query({ applicationStatus: "enrolled" }))
      .body.total,
    3,
  );
  const r = await agent.get(url + "applications").query({
    status: "enrolled",
    sessionId: schoolSession.id,
    classId: schoolClass.id,
    arm: "GOLD",
    limit: 2,
  });
  assert.equal(r.body.records.length, 2);
  assert.equal(r.body.total, 3);
  assert.equal(
    (await agent.get(url + "applications").query({ search: ".*" })).body.total,
    0,
  );
});
test("reprinting keeps the original reference, issue date and sequence and records no physical proof", async () => {
  const before = await DocumentCounter.findOne({
    schoolId: school._id,
    kind: "APP",
    year: issueYear(),
  });
  const r = await write(
    "post",
    `documents/${application.documentId}/prepare-print`,
    { prefill: true, includeMedical: false },
  );
  assert.equal(r.status, 200);
  assert.equal(r.body.document.reference, application.reference);
  assert.equal(
    r.body.document.createdAt,
    new Date(originalDocument.createdAt).toISOString(),
  );
  assert.equal(r.body.document.snapshot.medical, undefined);
  assert.equal(
    r.body.document.snapshot.student.admissionNumber,
    enrolled.admissionNumber,
  );
  assert.equal(r.body.physicalPrintConfirmed, false);
  const m = await write(
    "post",
    `documents/${application.documentId}/prepare-print`,
    { prefill: true, includeMedical: true },
  );
  assert.equal(m.status, 200);
  assert.equal(m.body.document.snapshot.medical.allergies, "Sensitive allergy");
  assert.equal(
    (await DocumentCounter.findById(before._id)).sequence,
    before.sequence,
  );
  const history = await agent.get(
    url + `documents/${application.documentId}/history`,
  );
  assert.ok(
    history.body.records.some((e) => e.action === "document_reprint_requested"),
  );
  assert.ok(
    history.body.records
      .filter((e) => e.action.includes("print_requested"))
      .every((e) => e.details.physicalPrintConfirmed === false),
  );
});

test("staff, assignment, administrator and student forms prefill safe existing data without granting rights", async () => {
  for (const [type, source] of [
    ["teacher_registration", { staffId: teaching.id }],
    ["staff_registration", { staffId: nonTeaching.id }],
    ["administrator_registration", { administratorId: admin.id }],
    [
      "teacher_assignment",
      { staffId: teaching.id, sessionId: schoolSession.id },
    ],
    ["student_transfer", { studentId: enrolled._id }],
    ["student_withdrawal", { studentId: enrolled._id }],
    ["student_clearance", { studentId: enrolled._id }],
    ["admission_acceptance", { applicationId: application._id }],
  ]) {
    const r = await write("post", "documents", {
      requestKey: randomUUID(),
      type,
      prefill: true,
      ...source,
    });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    assert.equal(JSON.stringify(r.body).includes("passwordHash"), false);
    assert.equal(r.body.document.snapshot.medical, undefined);
    if (type === "teacher_assignment") {
      assert.equal(r.body.document.snapshot.assignments.length, 1);
      assert.equal(r.body.document.snapshot.assignments[0].arm, "GOLD");
    }
  }
  const offer = await write("post", "documents", {
    requestKey: randomUUID(),
    type: "admission_acceptance",
    applicationId: spare._id,
    prefill: true,
  });
  assert.equal(offer.status, 201);
  assert.equal(await User.countDocuments(), usersBefore);
  assert.equal((await Staff.findById(teaching._id)).employeeId, "T-LEGACY");
});
test("medical document inclusion is explicit and forbidden on unrelated form types", async () => {
  const blank = await write("post", "documents", {
    requestKey: randomUUID(),
    type: "medical_emergency",
    studentId: enrolled._id,
    prefill: true,
    includeMedical: false,
  });
  assert.equal(blank.status, 201);
  assert.equal(blank.body.document.snapshot.medical, undefined);
  const filled = await write("post", "documents", {
    requestKey: randomUUID(),
    type: "medical_emergency",
    studentId: enrolled._id,
    prefill: true,
    includeMedical: true,
  });
  assert.equal(filled.status, 201);
  assert.equal(
    filled.body.document.snapshot.medical.allergies,
    "Sensitive allergy",
  );
  assert.equal(
    (
      await write("post", "documents", {
        requestKey: randomUUID(),
        type: "guardian_registration",
        studentId: enrolled._id,
        prefill: true,
        includeMedical: true,
      })
    ).status,
    400,
  );
});
test("cancelled, withdrawn and rejected applications retain references and cannot enrol", async () => {
  for (const next of ["cancelled", "withdrawn", "rejected"]) {
    let a = (await create()).body.application;
    if (next === "rejected") {
      a = await ready(a);
      await status(a, "under_review");
    }
    assert.equal((await status(a, next)).status, 200);
    assert.equal(
      (
        await write(
          "post",
          `applications/${a._id}/enrol`,
          enrolBody(await read(a._id)),
        )
      ).status,
      409,
    );
    assert.ok(
      await ReferenceReservation.exists({
        schoolId: school._id,
        reference: a.reference,
      }),
    );
    assert.equal(
      (await agent.get(url + `documents/${a.documentId}`)).body.document
        .applicationStatus,
      next,
    );
    assert.equal(
      (await write("delete", `applications/${a._id}`, {})).status,
      405,
    );
  }
  const next = await create();
  assert.ok(
    !concurrentApplications.some(
      (a) => a.reference === next.body.application.reference,
    ),
  );
});
test("unique immutable document references remain reserved after cancellation", async () => {
  const r = await write("post", "documents", {
    requestKey: randomUUID(),
    type: "staff_registration",
  });
  assert.equal(r.status, 201);
  const doc = r.body.document;
  assert.equal(
    (
      await write("post", `documents/${doc._id}/cancel`, {
        revision: doc.revision,
        reason: "Issued in error",
      })
    ).status,
    200,
  );
  assert.ok(
    await ReferenceReservation.exists({
      schoolId: school._id,
      reference: doc.reference,
    }),
  );
  const record = await IssuedDocument.findById(doc._id);
  record.reference = "CHANGED";
  await record.save();
  assert.equal(
    (await IssuedDocument.findById(doc._id)).reference,
    doc.reference,
  );
  await assert.rejects(
    IssuedDocument.create({
      schoolId: school._id,
      reference: doc.reference,
      type: "staff_registration",
      requestKey: randomUUID(),
      fingerprint: "unique",
      snapshot: {},
      issuedBy: admin._id,
    }),
    (e) => e.code === 11000,
  );
  assert.equal(
    (
      await write("post", "documents", {
        requestKey: randomUUID(),
        type: "staff_registration",
        reference: "CLIENT",
      })
    ).status,
    400,
  );
  assert.ok(
    (await agent.get(url + `documents/${doc._id}/history`)).body.records.some(
      (e) => e.action === "document_cancelled",
    ),
  );
});
test("permanent admission numbers are locked while direct registration stays compatible", async () => {
  assert.equal(
    (
      await write(
        "put",
        `students/${enrolled._id}`,
        studentBody(enrolled, { admissionNumber: "RENAMED" }),
      )
    ).status,
    409,
  );
  const r = await write(
    "post",
    "students",
    studentBody(legacyStudent, {
      admissionNumber: "MANUAL-NEW",
      firstName: "Direct Registration",
    }),
  );
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.record.applicationId, undefined);
  assert.equal(await User.countDocuments(), usersBefore);
  assert.equal(
    (await Student.findById(legacyStudent._id)).admissionNumber,
    `BFIS/STD/${issueYear()}/0001`,
  );
  assert.ok(await Student.exists({ _id: secondChild._id }));
  assert.ok(await Student.exists({ _id: thirdChild._id }));
});
test("admissions statistics and workflow history are database-backed and retained", async () => {
  const r = await agent.get(url + "applications/dashboard");
  assert.equal(r.status, 200);
  assert.equal(
    r.body.stats.total,
    await AdmissionApplication.countDocuments({ schoolId: school._id }),
  );
  assert.equal(r.body.stats.enrolled, 3);
  const h = await agent.get(url + `applications/${application._id}/history`);
  assert.equal(h.status, 200);
  assert.ok(h.body.records.some((e) => e.action === "application_enrolled"));
  assert.ok(h.body.records.every((e) => e.actorId?._id === admin.id));
  assert.equal(
    (
      await write(
        "put",
        `applications/${application._id}`,
        draft(await read(application._id)),
      )
    ).status,
    409,
  );
});
test("roles, school ownership, CSRF and suspended schools protect document operations", async () => {
  for (const client of [teacherAgent, studentAgent])
    for (const path of [
      "forms/catalog",
      "documents",
      "applications",
      `documents/${application.documentId}`,
    ])
      assert.equal((await client.get(url + path)).status, 403);
  assert.equal((await request(app).get(url + "forms/catalog")).status, 401);
  assert.equal(
    (
      await write("post", "documents", {
        requestKey: randomUUID(),
        type: "guardian_registration",
        guardianId: foreignGuardian.id,
        prefill: true,
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await write("post", "documents", {
        requestKey: randomUUID(),
        type: "student_application",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await agent
        .post(url + "applications")
        .send({ requestKey: randomUUID(), sessionId: schoolSession.id })
    ).status,
    403,
  );
  assert.equal(
    (
      await write("post", "applications", {
        requestKey: randomUUID(),
        sessionId: schoolSession.id,
        role: "super_admin",
      })
    ).status,
    400,
  );
  await School.updateOne({ _id: school._id }, { status: "suspended" });
  assert.equal((await create()).status, 403);
  assert.equal(
    (await agent.get(url + `documents/${application.documentId}`)).status,
    403,
  );
  await School.updateOne({ _id: school._id }, { status: "active" });
});
