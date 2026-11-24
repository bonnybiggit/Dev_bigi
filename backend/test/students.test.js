import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import request from "supertest";
import bcrypt from "bcrypt";
import { createApp } from "../src/app.js";
import { Student } from "../src/models/Student.js";
import { User } from "../src/models/User.js";
import { School } from "../src/models/School.js";
import { AcademicSession } from "../src/models/AcademicSession.js";
import { SchoolClass } from "../src/models/SchoolClass.js";
import { initializeSchoolConfiguration } from "../src/services/schoolConfiguration.js";
const config = {
  NODE_ENV: "test",
  JWT_SECRET: "student-test-secret-more-than-32-characters",
  FRONTEND_ORIGIN: "http://localhost:5173",
};
let mongo,
  app,
  agent,
  otherAgent,
  superAgent,
  school,
  otherSchool,
  admin,
  session,
  inactiveSession,
  otherSession,
  schoolClass,
  noArmClass,
  inactiveClass,
  otherClass,
  foreignStudent,
  studentId,
  secondStudentId;
const base = {
  admissionNumber: "BFIS-001",
  firstName: "Amina",
  middleName: "Bola",
  lastName: "Adeyemi",
  dateOfBirth: "2020-04-15",
  gender: "female",
  address: "10 Learning Avenue",
  admissionDate: "2026-09-01",
  previousSchool: "Little Stars School",
  admissionStatus: "pending",
};
const input = () => ({
  ...base,
  sessionId: session.id,
  classId: schoolClass.id,
  arm: "A",
});
const send = (client, method, path, body) =>
  client[method](`/api/school${path}`)
    .set("Origin", config.FRONTEND_ORIGIN)
    .send(body);
const write = (method, path, body) => send(agent, method, path, body);
before(
  async () => {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(mongo.getUri());
    await Promise.all([
      User.init(),
      School.init(),
      Student.init(),
      initializeSchoolConfiguration(),
    ]);
    const passwordHash = await bcrypt.hash("Test-password-123!", 4);
    const owner = await User.create({
      name: "Platform Admin",
      email: "owner@students.test",
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
      name: "School Admin",
      email: "school@students.test",
      role: "school_admin",
      schoolId: school._id,
      passwordHash,
    });
    const otherUser = await User.create({
      name: "Other Admin",
      email: "other@students.test",
      role: "school_admin",
      schoolId: otherSchool._id,
      passwordHash,
    });
    [session, inactiveSession, otherSession] = await AcademicSession.create([
      {
        name: "2026/2027",
        schoolId: school._id,
        startDate: "2026-09-01",
        endDate: "2027-07-31",
        status: "active",
      },
      {
        name: "2027/2028",
        schoolId: school._id,
        startDate: "2027-09-01",
        endDate: "2028-07-31",
      },
      {
        name: "2026/2027",
        schoolId: otherSchool._id,
        startDate: "2026-09-01",
        endDate: "2027-07-31",
        status: "active",
      },
    ]);
    [schoolClass, noArmClass, inactiveClass, otherClass] =
      await SchoolClass.create([
        {
          name: "Primary 1",
          schoolId: school._id,
          arms: ["A", "B", "C"],
          inactiveArms: ["C"],
          capacity: 90,
        },
        { name: "Nursery 1", schoolId: school._id, arms: [], capacity: 30 },
        {
          name: "Primary 2",
          schoolId: school._id,
          arms: ["A"],
          capacity: 30,
          status: "inactive",
        },
        {
          name: "Primary 1",
          schoolId: otherSchool._id,
          arms: ["A"],
          capacity: 30,
        },
      ]);
    foreignStudent = await Student.create({
      ...base,
      schoolId: otherSchool._id,
      sessionId: otherSession._id,
      classId: otherClass._id,
      arm: "A",
      createdBy: otherUser._id,
      updatedBy: otherUser._id,
    });
    app = createApp(config);
    agent = request.agent(app);
    otherAgent = request.agent(app);
    superAgent = request.agent(app);
    for (const [client, email, path] of [
      [agent, admin.email, "/school-login"],
      [otherAgent, otherUser.email, "/school-login"],
      [superAgent, owner.email, "/login"],
    ])
      assert.equal(
        (
          await client
            .post(`/api/auth${path}`)
            .set("Origin", config.FRONTEND_ORIGIN)
            .send({ email, password: "Test-password-123!" })
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

test("student registration persists profile and valid placement without creating accounts", async () => {
  const res = await write("post", "/students", input());
  assert.equal(res.status, 201);
  studentId = res.body.record._id;
  assert.equal(res.body.record.admissionNumber, base.admissionNumber);
  assert.equal(res.body.record.status, "active");
  assert.equal(res.body.record.firstName, base.firstName);
  assert.equal(res.body.record.sessionId, session.id);
  assert.equal(res.body.record.arm, "A");
  assert.equal(res.body.record.dateOfBirth.slice(0, 10), base.dateOfBirth);
  assert.equal(res.body.record.address, base.address);
  assert.equal(res.body.record.schoolId, undefined);
  assert.equal(res.body.record.createdBy, undefined);
  assert.equal(res.body.record.__v, undefined);
  assert.equal(
    (await Student.findById(studentId)).schoolId.toString(),
    school.id,
  );
  assert.equal(await User.countDocuments(), 3);
});

test("admission numbers are normalized and unique per school, including concurrent creation", async () => {
  assert.equal(
    (
      await write("post", "/students", {
        ...input(),
        admissionNumber: "bfis-001",
      })
    ).status,
    409,
  );
  assert.ok(await Student.findById(foreignStudent.id));
  const results = await Promise.all(
    [1, 2].map(() =>
      write("post", "/students", {
        ...input(),
        admissionNumber: "CONCURRENT",
        firstName: "Chidi",
        middleName: "",
      }),
    ),
  );
  assert.deepEqual(results.map((item) => item.status).sort(), [201, 409]);
  secondStudentId = results.find((item) => item.status === 201).body.record._id;
});

test("registration validates required fields, dates, admission state and rejects privileged fields", async () => {
  for (const extra of [
    { firstName: "" },
    { lastName: "" },
    { admissionNumber: "bad number" },
    { dateOfBirth: "2020-02-30" },
    { dateOfBirth: "2099-01-01" },
    { dateOfBirth: "2026-10-01" },
    { admissionDate: "invalid" },
    { gender: "invalid" },
    { address: "" },
    { admissionStatus: "unknown" },
    { sessionId: "bad-id" },
    { schoolId: otherSchool.id },
    { role: "super_admin" },
    { status: "archived" },
    { createdBy: admin.id },
    { photoUrl: "https://example.test/student.jpg" },
  ])
    assert.equal(
      (
        await write("post", "/students", {
          ...input(),
          admissionNumber: "VALIDATE",
          ...extra,
        })
      ).status,
      400,
    );
});

test("academic placement rejects inactive, missing and foreign references and invalid arms", async () => {
  for (const extra of [
    { sessionId: inactiveSession.id },
    { classId: inactiveClass.id },
    { sessionId: otherSession.id },
    { classId: otherClass.id },
    { sessionId: "000000000000000000000000" },
    { arm: "Z" },
    { arm: "C" },
    { arm: "" },
    { classId: noArmClass.id, arm: "A" },
  ])
    assert.equal(
      (
        await write("post", "/students", {
          ...input(),
          admissionNumber: "PLACEMENT",
          ...extra,
        })
      ).status,
      400,
    );
  assert.equal(
    (
      await write("post", "/students", {
        ...input(),
        admissionNumber: "NO-ARM",
        firstName: "David",
        middleName: "",
        classId: noArmClass.id,
        arm: "",
      })
    ).status,
    201,
  );
});

test("student editing updates personal details and valid placement while retaining audit and status", async () => {
  const res = await write("put", `/students/${studentId}`, {
    ...input(),
    middleName: "",
    address: "Updated address",
    arm: "b",
    admissionStatus: "admitted",
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.record.middleName, "");
  assert.equal(res.body.record.arm, "B");
  assert.equal(res.body.record.admissionStatus, "admitted");
  assert.equal(
    (await Student.findById(studentId)).updatedBy.toString(),
    admin.id,
  );
  assert.equal(
    (await write("put", `/students/${secondStudentId}`, input())).status,
    409,
  );
  assert.equal(
    (
      await write("put", `/students/${studentId}`, {
        ...input(),
        classId: otherClass.id,
      })
    ).status,
    400,
  );
});

test("search, placement/status filters and pagination are correct and list responses are minimal", async () => {
  assert.equal(
    (await agent.get("/api/school/students?search=Amina")).body.total,
    1,
  );
  assert.equal(
    (await agent.get("/api/school/students?search=Amina%20Adeyemi")).body.total,
    1,
  );
  assert.equal(
    (await agent.get("/api/school/students?search=BFIS-001")).body.total,
    1,
  );
  assert.equal(
    (await agent.get("/api/school/students?search=.*")).body.total,
    0,
  );
  assert.equal(
    (
      await agent.get(
        `/api/school/students?sessionId=${session.id}&classId=${schoolClass.id}&arm=B&status=active&admissionStatus=admitted`,
      )
    ).body.total,
    1,
  );
  assert.equal(
    (await agent.get(`/api/school/students?classId=${noArmClass.id}`)).body
      .total,
    1,
  );
  const first = await agent.get("/api/school/students?limit=1"),
    second = await agent.get("/api/school/students?limit=1&page=2");
  assert.equal(first.body.total, 3);
  assert.notEqual(first.body.records[0]._id, second.body.records[0]._id);
  for (const field of [
    "dateOfBirth",
    "address",
    "gender",
    "previousSchool",
    "admissionDate",
    "createdBy",
    "updatedBy",
    "schoolId",
    "__v",
  ])
    assert.equal(first.body.records[0][field], undefined);
  assert.equal(
    (await agent.get(`/api/school/students/${studentId}`)).body.record.address,
    "Updated address",
  );
  for (const query of [
    "limit=100",
    "page=0",
    "status=invalid",
    "arm=A",
    `classId=${noArmClass.id}&arm=A`,
    `schoolId=${otherSchool.id}`,
    `classId=${otherClass.id}`,
    `sessionId=${otherSession.id}`,
  ])
    assert.equal(
      (await agent.get(`/api/school/students?${query}`)).status,
      400,
    );
});

test("statistics reflect only the authenticated school and distinguish admission from student status", async () => {
  assert.deepEqual((await agent.get("/api/school/students/stats")).body, {
    totalStudents: 3,
    activeStudents: 3,
    inactiveStudents: 0,
    archivedStudents: 0,
    pendingAdmissions: 2,
  });
  assert.equal(
    (await otherAgent.get("/api/school/students/stats")).body.totalStudents,
    1,
  );
});

test("deactivation and archiving retain academic references and admission numbers; deletion is blocked", async () => {
  const refs = mongoose.connection.collection("academic_reference_fixtures");
  const reference = await refs.insertOne({
    schoolId: school._id,
    studentId: new mongoose.Types.ObjectId(studentId),
  });
  assert.equal(
    (
      await write("patch", `/students/${studentId}/status`, {
        status: "inactive",
      })
    ).status,
    200,
  );
  const edits = {
    ...input(),
    middleName: "",
    arm: "B",
    admissionStatus: "admitted",
  };
  assert.equal(
    (await write("put", `/students/${studentId}`, edits)).body.record.status,
    "inactive",
  );
  assert.equal(
    (
      await write("patch", `/students/${studentId}/status`, {
        status: "archived",
      })
    ).status,
    200,
  );
  assert.equal(
    (await write("put", `/students/${studentId}`, edits)).status,
    409,
  );
  assert.equal((await write("post", "/students", input())).status, 409);
  assert.equal((await write("delete", `/students/${studentId}`)).status, 405);
  assert.ok(
    await refs.findOne({ _id: reference.insertedId, schoolId: school._id }),
  );
  assert.equal(
    (await agent.get(`/api/school/students/${studentId}`)).body.record.arm,
    "B",
  );
  assert.equal(
    (await agent.get("/api/school/students?status=archived")).body.total,
    1,
  );
  assert.equal(
    (await agent.get("/api/school/students/stats")).body.archivedStudents,
    1,
  );
  assert.equal(
    (
      await write("patch", `/students/${studentId}/status`, {
        status: "active",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await write("patch", `/students/${studentId}/status`, {
        status: "inactive",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await write("patch", `/students/${studentId}/status`, {
        status: "active",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await write("patch", `/students/${studentId}/status`, {
        status: "deleted",
      })
    ).status,
    400,
  );
});

test("inactive arm settings are validated, preserved for older clients, and protect existing placements", async () => {
  const classInput = {
    name: schoolClass.name,
    capacity: schoolClass.capacity,
    arms: ["A", "B", "C"],
  };
  assert.equal(
    (
      await write("put", `/classes/${schoolClass.id}`, {
        ...classInput,
        inactiveArms: ["Z"],
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await write("put", `/classes/${schoolClass.id}`, {
        ...classInput,
        inactiveArms: ["B", "C"],
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await write("post", "/students", {
        ...input(),
        admissionNumber: "INACTIVE-ARM",
        arm: "B",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await write("put", `/students/${studentId}`, {
        ...input(),
        arm: "B",
        middleName: "",
        admissionStatus: "admitted",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await write("patch", `/students/${studentId}/status`, {
        status: "inactive",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await write("patch", `/students/${studentId}/status`, {
        status: "active",
      })
    ).status,
    400,
  );
  assert.equal(
    (await write("put", `/classes/${schoolClass.id}`, classInput)).status,
    200,
  );
  assert.deepEqual((await SchoolClass.findById(schoolClass.id)).inactiveArms, [
    "B",
    "C",
  ]);
  assert.equal(
    (
      await write("put", `/classes/${schoolClass.id}`, {
        ...classInput,
        arms: ["A", "C"],
        inactiveArms: ["C"],
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await write("put", `/classes/${schoolClass.id}`, {
        ...classInput,
        inactiveArms: ["C"],
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await write("patch", `/students/${studentId}/status`, {
        status: "active",
      })
    ).status,
    200,
  );
});

test("inactive sessions and classes block reassignment/activation while personal edits retain old placement", async () => {
  assert.equal(
    (
      await write("patch", `/classes/${schoolClass.id}/status`, {
        status: "inactive",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await write("put", `/students/${studentId}`, {
        ...input(),
        arm: "B",
        address: "Profile edit retained",
        admissionStatus: "admitted",
      })
    ).status,
    200,
  );
  assert.equal(
    (await write("put", `/students/${studentId}`, { ...input(), arm: "A" }))
      .status,
    400,
  );
  assert.equal(
    (
      await write("patch", `/classes/${schoolClass.id}/status`, {
        status: "active",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await write("patch", `/sessions/${session.id}/status`, {
        status: "inactive",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await write("put", `/students/${studentId}`, {
        ...input(),
        arm: "B",
        admissionStatus: "admitted",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await write("patch", `/students/${studentId}/status`, {
        status: "active",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await write("patch", `/sessions/${session.id}/status`, {
        status: "active",
      })
    ).status,
    200,
  );
});

test("all student endpoints enforce tenant isolation and reject unknown IDs", async () => {
  assert.equal(
    (await agent.get(`/api/school/students/${foreignStudent.id}`)).status,
    404,
  );
  assert.equal(
    (await write("put", `/students/${foreignStudent.id}`, input())).status,
    404,
  );
  assert.equal(
    (
      await write("patch", `/students/${foreignStudent.id}/status`, {
        status: "archived",
      })
    ).status,
    404,
  );
  assert.equal(
    (await write("delete", `/students/${foreignStudent.id}`)).status,
    404,
  );
  assert.equal(
    (await agent.get("/api/school/students")).body.records.some(
      (record) => record._id === foreignStudent.id,
    ),
    false,
  );
  assert.equal((await agent.get("/api/school/students/invalid")).status, 400);
  assert.equal(
    (await agent.get("/api/school/students/000000000000000000000000")).status,
    404,
  );
  assert.equal((await Student.findById(foreignStudent.id)).status, "active");
});

test("all student operations require school_admin, completed password setup, and active school access", async () => {
  for (const client of [request(app), superAgent]) {
    const status = client === superAgent ? 403 : 401;
    for (const path of [
      "/students",
      "/students/stats",
      `/students/${studentId}`,
    ])
      assert.equal((await client.get(`/api/school${path}`)).status, status);
    assert.equal(
      (await send(client, "post", "/students", input())).status,
      status,
    );
    assert.equal(
      (await send(client, "put", `/students/${studentId}`, input())).status,
      status,
    );
    assert.equal(
      (
        await send(client, "patch", `/students/${studentId}/status`, {
          status: "inactive",
        })
      ).status,
      status,
    );
    assert.equal(
      (await send(client, "delete", `/students/${studentId}`)).status,
      status,
    );
  }
  await User.findByIdAndUpdate(admin.id, { mustChangePassword: true });
  assert.equal(
    (await agent.get("/api/school/students")).body.code,
    "PASSWORD_CHANGE_REQUIRED",
  );
  await User.findByIdAndUpdate(admin.id, { mustChangePassword: false });
  await School.findByIdAndUpdate(school.id, { status: "suspended" });
  assert.equal((await agent.get("/api/school/students")).status, 403);
  assert.equal((await superAgent.get("/api/schools")).status, 200);
});
