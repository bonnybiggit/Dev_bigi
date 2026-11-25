import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import request from "supertest";
import bcrypt from "bcrypt";
import { createApp } from "../src/app.js";
import { User } from "../src/models/User.js";
import { School } from "../src/models/School.js";
import { Staff } from "../src/models/Staff.js";
import { Student } from "../src/models/Student.js";
import { AcademicSession } from "../src/models/AcademicSession.js";
import { AcademicTerm } from "../src/models/AcademicTerm.js";
import { SchoolClass } from "../src/models/SchoolClass.js";
import { Subject } from "../src/models/Subject.js";
import { TeacherAssignment } from "../src/models/TeacherAssignment.js";
import { TeacherAudit } from "../src/models/TeacherAudit.js";
import { Attendance } from "../src/models/Attendance.js";
import { AttendanceAudit } from "../src/models/AttendanceAudit.js";
import { Examination } from "../src/models/Examination.js";
import {
  Result,
  ResultRevision,
  ExaminationAudit,
} from "../src/models/Result.js";
const config = {
  NODE_ENV: "test",
  JWT_SECRET: "assignment-test-secret-more-than-32-characters",
  FRONTEND_ORIGIN: "http://localhost:5173",
};
let mongo,
  app,
  adminAgent,
  foreignAgent,
  agentA,
  agentB,
  school,
  otherSchool,
  admin,
  teacherA,
  teacherB,
  foreignTeacher,
  ambiguous,
  userA,
  userB,
  session,
  term,
  secondTerm,
  nextSession,
  nextTerm,
  c4,
  c5,
  foreignClass,
  math4,
  english4,
  music4,
  english5,
  science5,
  foreignSubject,
  alice,
  bob,
  silverStudent,
  foreignStudent,
  exam4,
  exam5,
  wrongTermExam,
  nextExam,
  mathRow,
  englishRow,
  english5Row,
  leadRow,
  transferred,
  copied,
  attendanceId,
  historicalResult;
const base = "/api/school/teacher-assignments";
const write = (agent, method, path, input) =>
  agent[method](path).set("Origin", config.FRONTEND_ORIGIN).send(input);
const create = (input) => write(adminAgent, "post", base, input);
const input = (changes = {}) => ({
  staffId: teacherA.id,
  sessionId: session.id,
  termId: term.id,
  classId: c4.id,
  arm: "GOLD",
  kind: "teaching",
  subjectIds: [math4.id],
  status: "active",
  reason: "Approved teaching allocation",
  ...changes,
});
async function login(which = "A") {
  const agent = which === "A" ? agentA : agentB;
  const user = which === "A" ? userA : userB;
  return write(agent, "post", "/api/auth/teacher-login", {
    email: user.email,
    password: "Teacher-password-123!",
  });
}
const studentBody = (person, changes = {}) => ({
  firstName: person.firstName,
  middleName: "",
  lastName: person.lastName,
  admissionNumber: person.admissionNumber,
  dateOfBirth: "2020-01-01",
  gender: "not_specified",
  address: "Private address",
  previousSchool: "",
  admissionDate: "2026-09-01",
  admissionStatus: "admitted",
  sessionId: session.id,
  classId: c4.id,
  arm: "GOLD",
  ...changes,
});
const attendanceInput = () => ({
  sessionId: session.id,
  classId: c4.id,
  arm: "GOLD",
  date: "2026-10-01",
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
        Staff,
        Student,
        AcademicSession,
        AcademicTerm,
        SchoolClass,
        Subject,
        TeacherAssignment,
        TeacherAudit,
        Attendance,
        AttendanceAudit,
        Examination,
        Result,
        ResultRevision,
        ExaminationAudit,
      ].map((m) => m.init()),
    );
    const passwordHash = await bcrypt.hash("Teacher-password-123!", 4);
    const owner = await User.create({
      name: "Owner",
      email: "owner@assignments.test",
      role: "super_admin",
      passwordHash,
    });
    [school, otherSchool] = await School.create(
      ["Assignment School", "Other School"].map((name) => ({
        name,
        city: "Lagos",
        country: "Nigeria",
        schoolType: "Primary",
        createdBy: owner._id,
      })),
    );
    admin = await User.create({
      name: "Administrator",
      email: "admin@assignments.test",
      schoolId: school._id,
      role: "school_admin",
      passwordHash,
    });
    const foreignAdmin = await User.create({
      name: "Other Admin",
      email: "other-admin@assignments.test",
      schoolId: otherSchool._id,
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
    nextSession = await AcademicSession.create({
      schoolId: school._id,
      name: "2027/2028",
      startDate: "2027-09-01",
      endDate: "2028-07-31",
      status: "inactive",
    });
    term = await AcademicTerm.create({
      schoolId: school._id,
      sessionId: session._id,
      name: "First Term",
      startDate: "2026-09-01",
      endDate: "2026-12-18",
      status: "active",
    });
    secondTerm = await AcademicTerm.create({
      schoolId: school._id,
      sessionId: session._id,
      name: "Second Term",
      startDate: "2027-01-01",
      endDate: "2027-04-01",
    });
    nextTerm = await AcademicTerm.create({
      schoolId: school._id,
      sessionId: nextSession._id,
      name: "First Term",
      startDate: "2027-09-01",
      endDate: "2027-12-18",
    });
    [c4, c5] = await SchoolClass.create(
      ["Primary 4", "Primary 5"].map((name) => ({
        schoolId: school._id,
        name,
        arms: ["GOLD", "SILVER"],
        capacity: 40,
      })),
    );
    foreignClass = await SchoolClass.create({
      schoolId: otherSchool._id,
      name: "Foreign class",
      capacity: 40,
      arms: ["GOLD"],
    });
    [math4, english4, music4, english5, science5] = await Subject.create(
      [
        { name: "Mathematics", classId: c4._id },
        { name: "English", classId: c4._id },
        { name: "Music", classId: c4._id },
        { name: "English", classId: c5._id },
        { name: "Science", classId: c5._id },
      ].map((v) => ({ ...v, schoolId: school._id })),
    );
    foreignSubject = await Subject.create({
      schoolId: otherSchool._id,
      classId: foreignClass._id,
      name: "Foreign subject",
    });
    const staff = (name, id, email) => ({
      schoolId: school._id,
      fullName: name,
      employeeId: id,
      email,
      phone: "08012345678",
      employmentDate: "2020-01-01",
      department: "Primary",
      designation: "Teacher",
      employmentType: "full_time",
      category: "teaching",
      createdBy: admin._id,
      updatedBy: admin._id,
    });
    teacherA = await Staff.create({
      ...staff("Teacher Ada", "T-A", "ada@assignments.test"),
      classIds: [c4._id, c5._id],
      subjectIds: [math4._id, english5._id],
    });
    teacherB = await Staff.create(
      staff("Teacher Bola", "T-B", "bola@assignments.test"),
    );
    foreignTeacher = await Staff.create({
      ...staff("Foreign Teacher", "T-F", "foreign@assignments.test"),
      schoolId: otherSchool._id,
      createdBy: foreignAdmin._id,
      updatedBy: foreignAdmin._id,
    });
    ambiguous = await Staff.create({
      ...staff("Legacy review", "T-LEGACY", "legacy@assignments.test"),
      classIds: [c4._id],
      subjectIds: [foreignSubject._id],
    });
    userA = await User.create({
      name: teacherA.fullName,
      email: teacherA.email,
      schoolId: school._id,
      staffId: teacherA._id,
      role: "teacher",
      passwordHash,
    });
    userB = await User.create({
      name: teacherB.fullName,
      email: teacherB.email,
      schoolId: school._id,
      staffId: teacherB._id,
      role: "teacher",
      passwordHash,
    });
    const student = (name, admissionNumber, changes = {}) => ({
      schoolId: school._id,
      firstName: name,
      lastName: "Student",
      admissionNumber,
      dateOfBirth: "2020-01-01",
      gender: "not_specified",
      address: "Private address",
      admissionDate: "2026-09-01",
      admissionStatus: "admitted",
      sessionId: session._id,
      classId: c4._id,
      arm: "GOLD",
      createdBy: admin._id,
      updatedBy: admin._id,
      ...changes,
    });
    [alice, bob, silverStudent, , , foreignStudent] = await Student.create([
      student("Alice", "A-1"),
      student("Bob", "B-1"),
      student("Silver", "S-1", { arm: "SILVER" }),
      student("Class Five", "C5-1", { classId: c5._id, arm: "SILVER" }),
      student("Other Arm", "C5-G", { classId: c5._id }),
      student("Foreign", "F-1", {
        schoolId: otherSchool._id,
        classId: foreignClass._id,
      }),
    ]);
    const exam = (name, cls, subjects, changes = {}) => ({
      schoolId: school._id,
      name,
      sessionId: session._id,
      termId: term._id,
      classId: cls._id,
      sessionName: session.name,
      termName: term.name,
      className: cls.name,
      termStartDate: term.startDate,
      termEndDate: term.endDate,
      subjects: subjects.map((s) => ({ subjectId: s._id, name: s.name })),
      components: [
        { key: "ca", name: "CA", maxMarks: 40, weight: 40 },
        { key: "exam", name: "Exam", maxMarks: 60, weight: 60 },
      ],
      totalMarks: 100,
      gradingScale: [{ minPercent: 0, grade: "A", remark: "Recorded" }],
      ...changes,
    });
    [exam4, exam5, wrongTermExam, nextExam] = await Examination.create([
      exam("Class 4 exam", c4, [math4, english4]),
      exam("Class 5 exam", c5, [english5, science5]),
      exam("Second term exam", c4, [math4], { termId: secondTerm._id }),
      exam("Next year exam", c4, [english4], {
        sessionId: nextSession._id,
        termId: nextTerm._id,
      }),
    ]);
    app = createApp(config);
    adminAgent = request.agent(app);
    foreignAgent = request.agent(app);
    agentA = request.agent(app);
    agentB = request.agent(app);
    for (const [agent, user] of [
      [adminAgent, admin],
      [foreignAgent, foreignAdmin],
    ])
      assert.equal(
        (
          await write(agent, "post", "/api/auth/school-login", {
            email: user.email,
            password: "Teacher-password-123!",
          })
        ).status,
        200,
      );
    assert.equal((await login()).status, 200);
  },
  { timeout: 120000 },
);
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

test("legacy assignments remain compatible and ambiguous records are flagged without generated records", async () => {
  const response = await agentA.get("/api/teacher/dashboard");
  assert.equal(response.status, 200);
  assert.equal(response.body.stats.students, 5);
  const review = await adminAgent.get(base + "/legacy-review");
  assert.equal(review.status, 200);
  assert.ok(
    review.body.records
      .find((r) => r._id === ambiguous.id)
      .issues.some((v) => v.includes("ambiguous")),
  );
  assert.equal(await TeacherAssignment.countDocuments(), 0);
  assert.equal((await create(input())).status, 409);
});

test("assignment routes reject unauthenticated teachers and foreign administrators", async () => {
  assert.equal((await request(app).get(base)).status, 401);
  assert.equal((await agentA.get(base)).status, 403);
  assert.equal(
    (await write(agentA, "post", base, input({ adoptLegacy: true }))).status,
    403,
  );
  assert.equal(
    (await write(foreignAgent, "post", base, input({ adoptLegacy: true })))
      .status,
    400,
  );
  const injected = await create({
    ...input({ adoptLegacy: true }),
    schoolId: otherSchool.id,
  });
  assert.equal(injected.status, 400);
});

test("multiple subjects save atomically with explicit adoption and unique student counts", async () => {
  const result = await create(
    input({ subjectIds: [math4.id, english4.id], adoptLegacy: true }),
  );
  assert.equal(result.status, 201, JSON.stringify(result.body));
  [mathRow, englishRow] = result.body.records;
  const retained = await Staff.findById(teacherA._id);
  assert.equal(retained.assignmentMode, "explicit");
  assert.equal(retained.classIds.length, 2);
  assert.equal(retained.subjectIds.length, 2);
  assert.equal(
    await TeacherAudit.countDocuments({
      staffId: teacherA._id,
      action: "legacy_adopted",
    }),
    1,
  );
  assert.equal((await agentA.get("/api/teacher/dashboard")).status, 401);
  // Fresh app instances isolate the existing production IP limiter across repeated test logins.
  app = createApp(config);
  agentA = request.agent(app);
  agentB = request.agent(app);
  assert.equal((await login()).status, 200);
  const d = (await agentA.get("/api/teacher/dashboard")).body;
  assert.equal(d.stats.classArmGroups, 1);
  assert.equal(d.stats.subjects, 2);
  assert.equal(d.stats.students, 2);
  assert.equal(d.stats.teachingAssignments, 2);
  assert.equal(d.stats.attendancePermissions, 0);
  assert.equal((await create(input())).status, 409);
  assert.equal(await TeacherAssignment.countDocuments(), 2);
});

test("class, arm, subject, term, inactive-staff and cross-school validation is atomic", async () => {
  for (const change of [
    { arm: "UNKNOWN" },
    { classId: foreignClass.id },
    { subjectIds: [english5.id] },
    { subjectIds: [foreignSubject.id] },
    { termId: nextTerm.id },
    { staffId: foreignTeacher.id },
  ])
    assert.equal((await create(input(change))).status, 400);
  await Staff.updateOne({ _id: teacherB._id }, { status: "inactive" });
  assert.equal(
    (await create(input({ staffId: teacherB.id, adoptLegacy: true }))).status,
    400,
  );
  await Staff.updateOne({ _id: teacherB._id }, { status: "active" });
  assert.equal(
    (await create(input({ subjectIds: [music4.id, english5.id] }))).status,
    400,
  );
  assert.equal(
    await TeacherAssignment.countDocuments({ subjectId: music4._id }),
    0,
  );
  assert.equal((await Staff.findById(teacherB._id)).assignmentMode, "legacy");
});

test("multiple class-arm groups retrieve only current eligible enrolments and support arm filters", async () => {
  const result = await create(
    input({ classId: c5.id, arm: "SILVER", subjectIds: [english5.id] }),
  );
  assert.equal(result.status, 201);
  english5Row = result.body.records[0];
  await login();
  const d = (await agentA.get("/api/teacher/dashboard")).body;
  assert.equal(d.stats.classArmGroups, 2);
  assert.equal(d.stats.subjects, 3);
  assert.equal(d.stats.students, 3);
  const c = (await agentA.get("/api/teacher/context")).body;
  assert.equal(c.groups.length, 2);
  assert.equal(c.groups.find((g) => g.classId === c4.id).subjectIds.length, 2);
  assert.equal((await agentA.get("/api/teacher/students")).body.total, 3);
  assert.equal(
    (
      await agentA
        .get("/api/teacher/students")
        .query({ classId: c4.id, arm: "SILVER" })
    ).status,
    403,
  );
  assert.equal(
    (await agentA.get(`/api/teacher/students/${silverStudent.id}`)).status,
    404,
  );
  assert.equal(
    (await agentA.get(`/api/teacher/students/${foreignStudent.id}`)).status,
    404,
  );
  assert.equal(
    (await agentA.get("/api/teacher/students").query({ search: "Alice" })).body
      .total,
    1,
  );
  assert.equal(
    (await agentA.get("/api/teacher/students").query({ search: ".*" })).body
      .total,
    0,
  );
  await Student.updateOne({ _id: alice._id }, { status: "inactive" });
  assert.equal(
    (await agentA.get("/api/teacher/students").query({ search: "Alice" })).body
      .total,
    0,
  );
  assert.equal(
    (await agentA.get("/api/teacher/students/" + alice.id)).status,
    404,
  );
  await Student.updateOne({ _id: alice._id }, { status: "active" });
});

test("student subject teacher names honour explicit arms rather than retained legacy arrays", async () => {
  const passwordHash = await bcrypt.hash("Student-password-123!", 4);
  const local = createApp(config);
  for (const person of [alice, silverStudent]) {
    await User.create({
      name: person.firstName,
      email: "student-" + person.id + "@portal.invalid",
      schoolId: school._id,
      studentId: person._id,
      role: "student",
      passwordHash,
    });
    const agent = request.agent(local);
    assert.equal(
      (
        await write(agent, "post", "/api/auth/student-login", {
          schoolId: school.id,
          admissionNumber: person.admissionNumber,
          password: "Student-password-123!",
        })
      ).status,
      200,
    );
    const subjects = (await agent.get("/api/student/subjects")).body.records;
    assert.deepEqual(
      subjects.find((s) => s._id === math4.id).teachers,
      person.id === alice.id ? [teacherA.fullName] : [],
    );
  }
});

test("examinations enforce subject, arm and period on reads, bulk score writes and history", async () => {
  const response = await agentA
    .get(`/api/school/examinations/${exam4.id}/sheet`)
    .query({ subjectId: math4.id, arm: "GOLD" });
  assert.equal(response.status, 200);
  assert.equal(response.body.total, 2);
  assert.equal(
    (
      await agentA
        .get(`/api/school/examinations/${exam4.id}/sheet`)
        .query({ subjectId: math4.id, arm: "SILVER" })
    ).status,
    403,
  );
  assert.equal(
    (await agentA.get(`/api/school/examinations/${wrongTermExam.id}`)).status,
    404,
  );
  assert.equal(
    (await agentA.get(`/api/school/examinations/${nextExam.id}`)).status,
    404,
  );
  assert.equal(
    (
      await agentA
        .get(`/api/school/examinations/${exam5.id}/sheet`)
        .query({ subjectId: science5.id, arm: "SILVER" })
    ).status,
    403,
  );
  assert.equal(
    (
      await write(
        agentA,
        "put",
        `/api/school/examinations/${exam4.id}/scores`,
        {
          subjectId: english4.id,
          arm: "SILVER",
          entries: [
            { studentId: silverStudent.id, scores: { ca: 20, exam: 40 } },
          ],
        },
      )
    ).status,
    403,
  );
  const saved = await write(
    agentA,
    "put",
    `/api/school/examinations/${exam4.id}/scores`,
    {
      subjectId: math4.id,
      arm: "GOLD",
      entries: [alice, bob].map((s) => ({
        studentId: s.id,
        scores: { ca: 30, exam: 50 },
      })),
    },
  );
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(
    (
      await write(
        adminAgent,
        "put",
        "/api/school/examinations/" + exam4.id + "/scores",
        {
          subjectId: math4.id,
          arm: "SILVER",
          entries: [
            { studentId: silverStudent.id, scores: { ca: 20, exam: 40 } },
          ],
        },
      )
    ).status,
    200,
  );
  const hiddenResult = await Result.findOne({
    studentId: silverStudent._id,
    subjectId: math4._id,
  });
  assert.equal(
    (
      await agentA.get(
        "/api/school/examinations/" +
          exam4.id +
          "/results/" +
          hiddenResult.id +
          "/history",
      )
    ).status,
    403,
  );
  assert.equal(
    (await agentA.get("/api/teacher/dashboard")).body.stats.results,
    2,
  );
  historicalResult = await Result.findOne({
    studentId: bob._id,
    subjectId: math4._id,
  });
});

test("lead class teacher appointments are unique and grant no implicit subject or attendance access", async () => {
  const result = await create(
    input({ kind: "class_teacher", arm: "SILVER", subjectIds: [] }),
  );
  assert.equal(result.status, 201);
  leadRow = result.body.records[0];
  const conflicting = await create(
    input({
      staffId: teacherB.id,
      kind: "class_teacher",
      arm: "SILVER",
      subjectIds: [],
      adoptLegacy: true,
    }),
  );
  assert.equal(conflicting.status, 409);
  assert.equal(
    (
      await create(
        input({
          staffId: teacherB.id,
          kind: "class_teacher",
          arm: "SILVER",
          subjectIds: [],
          termId: null,
          adoptLegacy: true,
        }),
      )
    ).status,
    409,
  );
  await login();
  const d = (await agentA.get("/api/teacher/dashboard")).body;
  assert.equal(d.stats.classTeacherResponsibilities, 1);
  assert.equal(d.stats.students, 4);
  assert.equal(
    (
      await agentA
        .get(`/api/school/examinations/${exam4.id}/sheet`)
        .query({ subjectId: math4.id, arm: "SILVER" })
    ).status,
    403,
  );
  assert.equal(
    (
      await agentA
        .get("/api/teacher/attendance/student/roster")
        .query({ ...attendanceInput(), arm: "SILVER" })
    ).status,
    403,
  );
});

test("explicit attendance grants preserve duplicate and correction/audit protections", async () => {
  const permission = {
    staffId: teacherA.id,
    sessionId: session.id,
    termId: term.id,
    classId: c4.id,
    arm: "GOLD",
    enabled: true,
    reason: "Attendance authorised by administrator",
  };
  assert.equal(
    (
      await agentA
        .get("/api/teacher/attendance/student/roster")
        .query(attendanceInput())
    ).status,
    403,
  );
  assert.equal(
    (
      await write(
        adminAgent,
        "put",
        `/api/school/staff/${teacherA.id}/attendance-grants`,
        { grants: [] },
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await write(adminAgent, "post", base + "/attendance", {
        ...permission,
        termId: secondTerm.id,
      })
    ).status,
    400,
  );
  assert.equal(
    (await write(adminAgent, "post", base + "/attendance", permission)).status,
    200,
  );
  assert.equal(
    (await write(adminAgent, "post", base + "/attendance", permission)).status,
    409,
  );
  await login();
  assert.equal(
    (
      await agentA
        .get("/api/teacher/attendance/student/roster")
        .query(attendanceInput())
    ).status,
    200,
  );
  const entries = [alice, bob].map((s) => ({
    personId: s.id,
    status: "present",
    revision: 0,
  }));
  assert.equal(
    (
      await write(agentA, "put", "/api/teacher/attendance/student", {
        ...attendanceInput(),
        entries,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await write(agentA, "put", "/api/teacher/attendance/student", {
        ...attendanceInput(),
        entries,
      })
    ).status,
    409,
  );
  const record = await Attendance.findOne({ personId: alice._id });
  attendanceId = record.id;
  const correction = {
    ...attendanceInput(),
    entries: [
      { personId: alice.id, status: "late", revision: record.revision },
    ],
  };
  assert.equal(
    (await write(agentA, "put", "/api/teacher/attendance/student", correction))
      .status,
    400,
  );
  assert.equal(
    (
      await write(agentA, "put", "/api/teacher/attendance/student", {
        ...correction,
        correctionReason: "Arrival time verified",
      })
    ).status,
    200,
  );
  assert.equal(
    (await agentA.get(`/api/teacher/attendance/records/${attendanceId}/audit`))
      .body.total,
    2,
  );
  assert.equal(
    (
      await agentA
        .get("/api/teacher/attendance/student/roster")
        .query({ ...attendanceInput(), classId: c5.id, arm: "SILVER" })
    ).status,
    403,
  );
  assert.equal(
    (
      await agentA
        .get("/api/teacher/attendance/student/roster")
        .query({ ...attendanceInput(), sessionId: nextSession.id })
    ).status,
    403,
  );
});

test("student transfers update current visibility and preserve authorised historical scores and attendance", async () => {
  const result = await write(
    adminAgent,
    "put",
    `/api/school/students/${bob.id}`,
    studentBody(bob, { classId: c5.id, arm: "GOLD" }),
  );
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(
    (await agentA.get(`/api/teacher/students/${bob.id}`)).status,
    404,
  );
  assert.equal(
    (await agentA.get("/api/teacher/dashboard")).body.stats.students,
    3,
  );
  const sheet = await agentA
    .get(`/api/school/examinations/${exam4.id}/sheet`)
    .query({ subjectId: math4.id, arm: "GOLD" });
  assert.equal(sheet.status, 200);
  assert.equal(
    sheet.body.records.find((r) => r.studentId === bob.id).editable,
    false,
  );
  const history = await agentA
    .get(`/api/teacher/attendance/student/history/${bob.id}`)
    .query(attendanceInput());
  assert.equal(history.status, 200, JSON.stringify(history.body));
  assert.equal(history.body.total, 1);
  assert.equal(
    String((await Result.findById(historicalResult._id)).studentId),
    bob.id,
  );
});

test("newly enrolled students appear automatically without per-student assignments", async () => {
  const result = await write(
    adminAgent,
    "post",
    "/api/school/students",
    studentBody(alice, {
      firstName: "New Enrolment",
      admissionNumber: "NEW-1",
    }),
  );
  assert.equal(result.status, 201, JSON.stringify(result.body));
  assert.equal(
    (
      await agentA
        .get("/api/teacher/students")
        .query({ search: "New Enrolment" })
    ).body.total,
    1,
  );
  assert.equal(
    (await agentA.get("/api/teacher/dashboard")).body.stats.students,
    4,
  );
});

test("revision-checked edits change only the exact arm relationship and retain audit history", async () => {
  const result = await write(adminAgent, "put", `${base}/${englishRow._id}`, {
    ...input({
      subjectIds: [english4.id],
      arm: "SILVER",
      reason: "Move English teaching to Silver",
    }),
    revision: englishRow.revision,
  });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  englishRow = result.body.record;
  assert.equal(
    (
      await write(adminAgent, "put", `${base}/${englishRow._id}`, {
        ...input({ subjectIds: [english4.id] }),
        revision: 1,
      })
    ).status,
    409,
  );
  app = createApp(config);
  agentA = request.agent(app);
  agentB = request.agent(app);
  await login();
  assert.equal(
    (
      await agentA
        .get(`/api/school/examinations/${exam4.id}/sheet`)
        .query({ subjectId: english4.id, arm: "SILVER" })
    ).status,
    200,
  );
  assert.equal(
    (
      await agentA
        .get(`/api/school/examinations/${exam4.id}/sheet`)
        .query({ subjectId: english4.id, arm: "GOLD" })
    ).status,
    403,
  );
  const history = await adminAgent.get(`${base}/${englishRow._id}/history`);
  assert.equal(history.status, 200);
  assert.equal(history.body.total, 2);
  assert.equal(history.body.records[0].action, "assignment_updated");
  assert.equal(
    (await foreignAgent.get(`${base}/${englishRow._id}/history`)).status,
    404,
  );
});

test("revocation removes current access and does not fall back to retained legacy arrays or attendance grants", async () => {
  const result = await write(
    adminAgent,
    "post",
    `${base}/${mathRow._id}/deactivate`,
    { revision: mathRow.revision, reason: "Teaching allocation withdrawn" },
  );
  assert.equal(result.status, 200);
  assert.equal((await agentA.get("/api/teacher/dashboard")).status, 401);
  await login();
  assert.equal(
    (await agentA.get(`/api/teacher/students/${alice.id}`)).status,
    404,
  );
  assert.equal(
    (
      await agentA
        .get(`/api/school/examinations/${exam4.id}/sheet`)
        .query({ subjectId: math4.id, arm: "GOLD" })
    ).status,
    403,
  );
  assert.equal(
    (await agentA.get(`/api/teacher/attendance/records/${attendanceId}/audit`))
      .status,
    403,
  );
  assert.equal(await AttendanceAudit.countDocuments({ attendanceId }), 2);
  assert.ok(
    (await Staff.findById(teacherA._id)).classIds.some(
      (id) => String(id) === c4.id,
    ),
  );
  assert.equal(
    (await write(adminAgent, "delete", `${base}/${mathRow._id}`, {})).status,
    405,
  );
  assert.ok(await Result.exists({ _id: historicalResult._id }));
});

test("transfers preserve source records and audit both teachers without transferring attendance", async () => {
  const result = await write(
    adminAgent,
    "post",
    `${base}/${english5Row._id}/transfer`,
    {
      staffId: teacherB.id,
      adoptLegacy: true,
      revision: english5Row.revision,
      reason: "Teaching reassigned to Bola",
    },
  );
  assert.equal(result.status, 200, JSON.stringify(result.body));
  transferred = result.body.record;
  assert.equal(result.body.source.status, "inactive");
  assert.equal(transferred.sourceId, english5Row._id);
  await login();
  await login("B");
  assert.equal(
    (await agentA.get(`/api/school/examinations/${exam5.id}`)).status,
    404,
  );
  assert.equal(
    (
      await agentB
        .get(`/api/school/examinations/${exam5.id}/sheet`)
        .query({ subjectId: english5.id, arm: "SILVER" })
    ).status,
    200,
  );
  assert.equal(
    (await agentB.get("/api/teacher/dashboard")).body.stats.students,
    1,
  );
  assert.equal(
    (
      await agentB
        .get("/api/teacher/attendance/student/roster")
        .query({ ...attendanceInput(), classId: c5.id, arm: "SILVER" })
    ).status,
    403,
  );
  assert.equal(
    (
      await write(adminAgent, "post", `${base}/${transferred._id}/transfer`, {
        staffId: foreignTeacher.id,
        revision: 1,
        reason: "Invalid foreign transfer",
      })
    ).status,
    400,
  );
  assert.equal(
    await TeacherAudit.countDocuments({ action: "assignment_transferred" }),
    2,
  );
});

test("lead teacher reassignment retains the old appointment and never broadens scoring permissions", async () => {
  const result = await write(
    adminAgent,
    "post",
    `${base}/${leadRow._id}/transfer`,
    {
      staffId: teacherB.id,
      revision: leadRow.revision,
      reason: "Class teacher reassignment",
    },
  );
  assert.equal(result.status, 200);
  assert.equal(
    await TeacherAssignment.countDocuments({
      classId: c4._id,
      arm: "SILVER",
      kind: "class_teacher",
      status: "active",
    }),
    1,
  );
  await login("B");
  assert.equal(
    (await agentB.get("/api/teacher/dashboard")).body.stats
      .classTeacherResponsibilities,
    1,
  );
  assert.equal(
    (await agentB.get(`/api/school/examinations/${exam4.id}`)).status,
    404,
  );
});

test("period copying is explicit, duplicate-safe and never overwrites historical or attendance records", async () => {
  await login();
  assert.equal(
    (await agentA.get(`/api/school/examinations/${nextExam.id}`)).status,
    404,
  );
  const payload = {
    ids: [englishRow._id, transferred._id],
    sessionId: nextSession.id,
    termId: nextTerm.id,
    reason: "Reviewed next-year teaching plan",
  };
  const result = await write(
    adminAgent,
    "post",
    base + "/copy-period",
    payload,
  );
  assert.equal(result.status, 201, JSON.stringify(result.body));
  copied = result.body.records;
  assert.equal(copied.length, 2);
  assert.ok(copied.every((r) => r.sourceId));
  assert.equal(
    (await write(adminAgent, "post", base + "/copy-period", payload)).status,
    409,
  );
  assert.equal(
    await TeacherAssignment.countDocuments({ sessionId: nextSession._id }),
    2,
  );
  assert.equal(await Attendance.countDocuments({ personId: alice._id }), 1);
  assert.ok(await Result.exists({ _id: historicalResult._id }));
  assert.equal((await Staff.findById(teacherB._id)).attendanceGrants.length, 0);
  await login();
  assert.equal(
    (await agentA.get("/api/teacher/context")).body.groups.every(
      (g) => g.sessionId === session.id,
    ),
    true,
  );
});

test("academic transitions use only explicitly copied assignments and new valid enrolments", async () => {
  await AcademicSession.updateOne({ _id: session._id }, { status: "inactive" });
  await AcademicSession.updateOne(
    { _id: nextSession._id },
    { status: "active" },
  );
  await AcademicTerm.updateOne({ _id: nextTerm._id }, { status: "active" });
  const c = (await agentA.get("/api/teacher/context")).body;
  assert.equal(c.groups.length, 1);
  assert.equal(c.groups[0].sessionId, nextSession.id);
  assert.equal(c.groups[0].arm, "SILVER");
  assert.equal((await agentA.get("/api/teacher/students")).body.total, 0);
  await Student.create({
    ...(await Student.findById(silverStudent._id)).toObject(),
    _id: new mongoose.Types.ObjectId(),
    admissionNumber: "NEXT-1",
    sessionId: nextSession._id,
    admissionDate: "2027-09-01",
  });
  assert.equal(
    (await agentA.get("/api/teacher/dashboard")).body.stats.students,
    1,
  );
  await login("B");
  assert.equal(
    (await agentB.get("/api/teacher/dashboard")).body.stats
      .classTeacherResponsibilities,
    0,
  );
  assert.equal(
    (
      await agentA
        .get(`/api/school/examinations/${exam4.id}/sheet`)
        .query({ subjectId: english4.id, arm: "SILVER" })
    ).status,
    200,
  );
});

test("overlapping lead appointments and session-wide teaching duplicates are prevented under concurrency", async () => {
  const appointment = input({
    sessionId: nextSession.id,
    termId: nextTerm.id,
    kind: "class_teacher",
    subjectIds: [],
    arm: "GOLD",
  });
  const outcomes = await Promise.all([
    create(appointment),
    create({ ...appointment, staffId: teacherB.id }),
  ]);
  assert.deepEqual(outcomes.map((r) => r.status).sort(), [201, 409]);
  assert.equal((await create({ ...appointment, termId: null })).status, 409);
  assert.equal(
    (
      await create(
        input({
          sessionId: nextSession.id,
          termId: null,
          arm: "SILVER",
          subjectIds: [english4.id],
        }),
      )
    ).status,
    409,
  );
  assert.equal(
    await TeacherAssignment.countDocuments({
      sessionId: nextSession._id,
      classId: c4._id,
      arm: "GOLD",
      kind: "class_teacher",
      status: "active",
    }),
    1,
  );
});

test("assignment lists filter by school, teacher, subject, class, period and status", async () => {
  await login();
  const result = await adminAgent.get(base).query({
    staffId: teacherA.id,
    subjectId: english4.id,
    classId: c4.id,
    sessionId: nextSession.id,
    termId: nextTerm.id,
    status: "active",
    search: "T-A",
    limit: 1,
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.total, 1);
  assert.equal(
    result.body.records[0]._id,
    copied.find((r) => r.staffId === teacherA.id)._id,
  );
  assert.equal((await foreignAgent.get(base)).body.total, 0);
  assert.equal(
    (await adminAgent.get(base + "/legacy-review")).body.records.some(
      (r) => r._id === teacherA.id,
    ),
    false,
  );
  assert.equal((await agentA.get(base)).status, 403);
});

test("adopted ambiguous legacy arrays remain read-only history without blocking profile maintenance", async () => {
  const created = await create(
    input({
      staffId: ambiguous.id,
      sessionId: nextSession.id,
      termId: nextTerm.id,
      classId: c5.id,
      arm: "GOLD",
      subjectIds: [science5.id],
      adoptLegacy: true,
    }),
  );
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const payload = {
    employeeId: ambiguous.employeeId,
    fullName: ambiguous.fullName,
    email: ambiguous.email,
    phone: ambiguous.phone,
    gender: "not_specified",
    address: "",
    dateOfBirth: null,
    employmentDate: "2020-01-01",
    department: "Primary",
    designation: "Senior Teacher",
    employmentType: "full_time",
    category: "teaching",
    classIds: ambiguous.classIds.map(String),
    subjectIds: ambiguous.subjectIds.map(String),
  };
  assert.equal(
    (
      await write(
        adminAgent,
        "put",
        "/api/school/staff/" + ambiguous.id,
        payload,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await write(adminAgent, "put", "/api/school/staff/" + ambiguous.id, {
        ...payload,
        subjectIds: [],
      })
    ).status,
    409,
  );
  const retained = await Staff.findById(ambiguous._id);
  assert.equal(String(retained.subjectIds[0]), foreignSubject.id);
  assert.equal(retained.designation, "Senior Teacher");
});
