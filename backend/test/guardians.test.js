import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import request from "supertest";
import bcrypt from "bcrypt";
import { createApp } from "../src/app.js";
import { Guardian } from "../src/models/Guardian.js";
import { StudentGuardian } from "../src/models/StudentGuardian.js";
import { Student } from "../src/models/Student.js";
import { School } from "../src/models/School.js";
import { User } from "../src/models/User.js";
import { AcademicSession } from "../src/models/AcademicSession.js";
import { SchoolClass } from "../src/models/SchoolClass.js";
import { initializeSchoolConfiguration } from "../src/services/schoolConfiguration.js";

const config = {
  NODE_ENV: "test",
  JWT_SECRET: "guardian-test-secret-more-than-32-characters",
  FRONTEND_ORIGIN: "http://localhost:5173",
};
const fullInput = {
  fullName: "Amina Adeyemi",
  email: "AMINA@guardian.test",
  primaryPhone: "+234 801 234 5678",
  alternativePhone: "+234 802 234 5678",
  address: "10 Learning Avenue",
  occupation: "Engineer",
  gender: "female",
  emergencyContactName: "Bola Adeyemi",
  emergencyContactPhone: "+234 803 234 5678",
  emergencyContactRelationship: "Sibling",
};
let mongo,
  app,
  agent,
  otherAgent,
  superAgent,
  school,
  otherSchool,
  admin,
  studentA,
  studentB,
  archivedStudent,
  foreignStudent,
  foreignGuardian,
  guardianA,
  guardianB,
  guardianC;
const send = (client, method, path, body) =>
  client[method](`/api/school${path}`)
    .set("Origin", config.FRONTEND_ORIGIN)
    .send(body);
const write = (method, path, body) => send(agent, method, path, body);
const pair = (guardian, student) =>
  `/guardians/${guardian}/students/${student}`;
before(
  async () => {
    mongo = await MongoMemoryReplSet.create({
      replSet: { count: 1 },
      instanceOpts: [{ launchTimeout: 60000 }],
    });
    await mongoose.connect(mongo.getUri());
    await Promise.all([
      Guardian.init(),
      StudentGuardian.init(),
      Student.init(),
      User.init(),
      School.init(),
      initializeSchoolConfiguration(),
    ]);
    const passwordHash = await bcrypt.hash("Test-password-123!", 4);
    const owner = await User.create({
      name: "Platform Admin",
      email: "owner@guardian.test",
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
      email: "school@guardian.test",
      role: "school_admin",
      schoolId: school._id,
      passwordHash,
    });
    const otherAdmin = await User.create({
      name: "Other Admin",
      email: "other@guardian.test",
      role: "school_admin",
      schoolId: otherSchool._id,
      passwordHash,
    });
    const createStudents = async (schoolId, userId, names) => {
      const session = await AcademicSession.create({
        schoolId,
        name: "2026/2027",
        startDate: "2026-09-01",
        endDate: "2027-07-31",
        status: "active",
      });
      const schoolClass = await SchoolClass.create({
        schoolId,
        name: "Primary 1",
        arms: ["A"],
        capacity: 30,
      });
      return Student.create(
        names.map((firstName, index) => ({
          schoolId,
          admissionNumber: `BFIS-${index}`,
          firstName,
          lastName: "Adeyemi",
          dateOfBirth: "2020-04-15",
          gender: "not_specified",
          address: "Student private address",
          admissionDate: "2026-09-01",
          sessionId: session._id,
          classId: schoolClass._id,
          arm: "A",
          admissionStatus: "admitted",
          createdBy: userId,
          updatedBy: userId,
        })),
      );
    };
    [studentA, studentB, archivedStudent] = await createStudents(
      school._id,
      admin._id,
      ["Ada", "Bola", "Chidi"],
    );
    await Student.findByIdAndUpdate(archivedStudent.id, { status: "archived" });
    [foreignStudent] = await createStudents(otherSchool._id, otherAdmin._id, [
      "Foreign",
    ]);
    foreignGuardian = await Guardian.create({
      ...fullInput,
      schoolId: otherSchool._id,
      createdBy: otherAdmin._id,
      updatedBy: otherAdmin._id,
    });
    await StudentGuardian.create({
      schoolId: otherSchool._id,
      guardianId: foreignGuardian._id,
      studentId: foreignStudent._id,
      relationship: "mother",
      createdBy: otherAdmin._id,
      updatedBy: otherAdmin._id,
    });
    app = createApp(config);
    agent = request.agent(app);
    otherAgent = request.agent(app);
    superAgent = request.agent(app);
    for (const [client, email, path] of [
      [agent, admin.email, "/school-login"],
      [otherAgent, otherAdmin.email, "/school-login"],
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

test("guardian creation stores complete optional contact details without creating login accounts", async () => {
  const res = await write("post", "/guardians", fullInput);
  assert.equal(res.status, 201);
  guardianA = res.body.record._id;
  assert.equal(res.body.record.email, fullInput.email.toLowerCase());
  assert.equal(
    res.body.record.emergencyContactPhone,
    fullInput.emergencyContactPhone,
  );
  assert.equal(res.body.record.status, "active");
  assert.equal(res.body.record.schoolId, undefined);
  assert.equal(res.body.record.createdBy, undefined);
  assert.equal(
    (await Guardian.findById(guardianA)).schoolId.toString(),
    school.id,
  );
  assert.equal(await User.countDocuments(), 3);
  const second = await write("post", "/guardians", {
    fullName: "Baba Adebayo",
    primaryPhone: "+234 809 111 2222",
    address: "20 Learning Avenue",
  });
  assert.equal(second.status, 201);
  guardianB = second.body.record._id;
  assert.equal(second.body.record.email, "");
  const third = await write("post", "/guardians", {
    fullName: "Unlinked Contact",
    primaryPhone: "+234 807 333 4444",
    address: "30 Learning Avenue",
  });
  assert.equal(third.status, 201);
  guardianC = third.body.record._id;
});

test("guardian inputs validate phone/email/contact fields and reject tenant, role and status injection", async () => {
  for (const extra of [
    { fullName: "" },
    { email: "bad" },
    { primaryPhone: "invalid" },
    { alternativePhone: "invalid" },
    { address: "" },
    { gender: "invalid" },
    { emergencyContactPhone: "" },
    { emergencyContactName: "" },
    { schoolId: otherSchool.id },
    { role: "super_admin" },
    { status: "inactive" },
    { createdBy: admin.id },
    { password: "Unwanted-account-password" },
  ])
    assert.equal(
      (await write("post", "/guardians", { ...fullInput, ...extra })).status,
      400,
    );
  const res = await write("put", `/guardians/${guardianA}`, {
    ...fullInput,
    occupation: "Senior Engineer",
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.record.occupation, "Senior Engineer");
  assert.equal(res.body.record.status, "active");
  assert.equal(
    (await Guardian.findById(guardianA)).updatedBy.toString(),
    admin.id,
  );
});

test("one guardian links to multiple students and multiple guardians link to one student", async () => {
  assert.equal(
    (
      await write("post", pair(guardianA, studentA.id), {
        relationship: "mother",
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await write("post", pair(guardianA, studentB.id), {
        relationship: "guardian",
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await write("post", pair(guardianB, studentA.id), {
        relationship: "father",
      })
    ).status,
    201,
  );
  const children = await agent.get(
    `/api/school/guardians/${guardianA}/students`,
  );
  assert.equal(children.status, 200);
  assert.equal(children.body.records.length, 2);
  assert.equal(
    children.body.records.some((link) => link.record._id === studentA.id),
    true,
  );
  const guardians = await agent.get(
    `/api/school/students/${studentA.id}/guardians`,
  );
  assert.equal(guardians.status, 200);
  assert.equal(guardians.body.records.length, 2);
  assert.deepEqual(
    guardians.body.records.map((link) => link.relationship).sort(),
    ["father", "mother"],
  );
});

test("duplicate links, invalid relationships and concurrent duplicate requests are rejected", async () => {
  assert.equal(
    (
      await write("post", pair(guardianA, studentA.id), {
        relationship: "other",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await write("post", pair(guardianB, studentB.id), {
        relationship: "cousin",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await write("post", pair(guardianB, studentB.id), {
        relationship: "other",
        schoolId: otherSchool.id,
      })
    ).status,
    400,
  );
  const results = await Promise.all(
    [1, 2].map(() =>
      write("post", pair(guardianB, studentB.id), { relationship: "other" }),
    ),
  );
  assert.deepEqual(results.map((item) => item.status).sort(), [201, 409]);
  assert.equal(
    await StudentGuardian.countDocuments({
      schoolId: school._id,
      guardianId: guardianB,
      studentId: studentB._id,
    }),
    1,
  );
  assert.equal(
    (
      await write("put", pair(guardianB, studentB.id), {
        relationship: "guardian",
      })
    ).status,
    200,
  );
});

test("guardian search, status/linkage filters and pagination are school-scoped", async () => {
  assert.equal(
    (await agent.get("/api/school/guardians?search=Amina")).body.total,
    1,
  );
  assert.equal(
    (await agent.get("/api/school/guardians?search=amina%40guardian.test")).body
      .total,
    1,
  );
  assert.equal(
    (await agent.get("/api/school/guardians?search=801")).body.total,
    1,
  );
  assert.equal(
    (await agent.get("/api/school/guardians?search=802")).body.total,
    1,
  );
  assert.equal(
    (await agent.get("/api/school/guardians?search=.*")).body.total,
    0,
  );
  assert.equal(
    (await agent.get("/api/school/guardians?status=active&linkage=linked")).body
      .total,
    2,
  );
  assert.equal(
    (await agent.get("/api/school/guardians?linkage=unlinked")).body.total,
    1,
  );
  const first = await agent.get("/api/school/guardians?limit=1"),
    second = await agent.get("/api/school/guardians?limit=1&page=2");
  assert.equal(first.body.total, 3);
  assert.notEqual(first.body.records[0]._id, second.body.records[0]._id);
  for (const query of [
    "page=0",
    "limit=100",
    "status=unknown",
    "linkage=unknown",
    `schoolId=${otherSchool.id}`,
  ])
    assert.equal(
      (await agent.get(`/api/school/guardians?${query}`)).status,
      400,
    );
});

test("lists and relationship responses omit unnecessary personal information", async () => {
  const list = await agent.get("/api/school/guardians");
  for (const record of list.body.records)
    for (const field of [
      "address",
      "occupation",
      "gender",
      "alternativePhone",
      "emergencyContactName",
      "emergencyContactPhone",
      "emergencyContactRelationship",
      "createdBy",
      "updatedBy",
      "schoolId",
      "__v",
    ])
      assert.equal(record[field], undefined);
  const children = (
    await agent.get(`/api/school/guardians/${guardianA}/students`)
  ).body.records;
  assert.equal(children[0].record.dateOfBirth, undefined);
  assert.equal(children[0].record.address, undefined);
  const guardians = (
    await agent.get(`/api/school/students/${studentA.id}/guardians`)
  ).body.records;
  assert.equal(guardians[0].record.address, undefined);
  assert.equal(guardians[0].record.emergencyContactName, undefined);
  assert.equal(
    (await agent.get(`/api/school/guardians/${guardianA}`)).body.record.address,
    fullInput.address,
  );
});

test("guardian statistics reflect real profiles, links and unique linked students in one school", async () => {
  assert.deepEqual((await agent.get("/api/school/guardians/stats")).body, {
    totalGuardians: 3,
    activeGuardians: 3,
    inactiveGuardians: 0,
    linkedStudents: 2,
    relationships: 4,
  });
  assert.deepEqual((await otherAgent.get("/api/school/guardians/stats")).body, {
    totalGuardians: 1,
    activeGuardians: 1,
    inactiveGuardians: 0,
    linkedStudents: 1,
    relationships: 1,
  });
});

test("relationship removal is soft and relinking restores the original record safely", async () => {
  const original = await StudentGuardian.findOne({
    schoolId: school._id,
    guardianId: guardianA,
    studentId: studentB._id,
  });
  assert.equal(
    (await write("delete", pair(guardianA, studentB.id))).status,
    204,
  );
  assert.equal(
    (await agent.get(`/api/school/guardians/${guardianA}/students`)).body
      .records.length,
    1,
  );
  const removed = await StudentGuardian.findById(original.id);
  assert.equal(removed.isActive, false);
  assert.ok(removed.removedAt);
  assert.equal(
    (await agent.get("/api/school/guardians/stats")).body.relationships,
    3,
  );
  assert.equal(
    (
      await write("put", pair(guardianA, studentB.id), {
        relationship: "other",
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await write("post", pair(guardianA, studentB.id), {
        relationship: "other",
      })
    ).status,
    201,
  );
  const restored = await StudentGuardian.findById(original.id);
  assert.equal(restored.isActive, true);
  assert.equal(restored.relationship, "other");
  assert.equal(
    await StudentGuardian.countDocuments({
      schoolId: school._id,
      guardianId: guardianA,
      studentId: studentB._id,
    }),
    1,
  );
});

test("profile deactivation retains links, blocks new links, and edits cannot reactivate it", async () => {
  assert.equal(
    (
      await write("patch", `/guardians/${guardianA}/status`, {
        status: "inactive",
      })
    ).status,
    200,
  );
  assert.equal(
    (await agent.get(`/api/school/guardians/${guardianA}/students`)).body
      .records.length,
    2,
  );
  assert.equal(
    (
      await agent.get(`/api/school/students/${studentA.id}/guardians`)
    ).body.records.find((link) => link.guardianId === guardianA).record.status,
    "inactive",
  );
  assert.equal(
    (await write("put", `/guardians/${guardianA}`, fullInput)).body.record
      .status,
    "inactive",
  );
  assert.equal(
    (await agent.get("/api/school/guardians?status=inactive")).body.total,
    1,
  );
  assert.equal(
    (
      await write("patch", `/guardians/${guardianC}/status`, {
        status: "inactive",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await write("post", pair(guardianC, studentA.id), {
        relationship: "guardian",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await write("patch", `/guardians/${guardianC}/status`, {
        status: "active",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await write("patch", `/guardians/${guardianA}/status`, {
        status: "active",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await write("patch", `/guardians/${guardianA}/status`, {
        status: "deleted",
      })
    ).status,
    400,
  );
  assert.equal((await write("delete", `/guardians/${guardianA}`)).status, 405);
  assert.ok(await Guardian.findById(guardianA));
  assert.ok(await Student.findById(studentA.id));
});

test("archived students cannot receive new relationships or edits; safe removal is permitted", async () => {
  assert.equal(
    (
      await write("post", pair(guardianC, archivedStudent.id), {
        relationship: "guardian",
      })
    ).status,
    409,
  );
  await Student.findByIdAndUpdate(studentB.id, { status: "archived" });
  assert.equal(
    (
      await write("put", pair(guardianA, studentB.id), {
        relationship: "father",
      })
    ).status,
    409,
  );
  assert.equal(
    (await write("delete", pair(guardianA, studentB.id))).status,
    204,
  );
  assert.equal((await Student.findById(studentB.id)).status, "archived");
});

test("every guardian and relationship endpoint enforces school ownership", async () => {
  assert.equal(
    (await agent.get(`/api/school/guardians/${foreignGuardian.id}`)).status,
    404,
  );
  assert.equal(
    (await write("put", `/guardians/${foreignGuardian.id}`, fullInput)).status,
    404,
  );
  assert.equal(
    (
      await write("patch", `/guardians/${foreignGuardian.id}/status`, {
        status: "inactive",
      })
    ).status,
    404,
  );
  assert.equal(
    (await write("delete", `/guardians/${foreignGuardian.id}`)).status,
    404,
  );
  assert.equal(
    (await agent.get(`/api/school/guardians/${foreignGuardian.id}/students`))
      .status,
    404,
  );
  assert.equal(
    (await agent.get(`/api/school/students/${foreignStudent.id}/guardians`))
      .status,
    404,
  );
  for (const method of ["post", "put", "delete"]) {
    const body = method === "delete" ? undefined : { relationship: "other" };
    assert.equal(
      (await write(method, pair(guardianA, foreignStudent.id), body)).status,
      404,
    );
    assert.equal(
      (await write(method, pair(foreignGuardian.id, studentA.id), body)).status,
      404,
    );
  }
  assert.equal((await agent.get("/api/school/guardians/invalid")).status, 400);
  assert.equal(
    (await agent.get("/api/school/guardians/000000000000000000000000")).status,
    404,
  );
  assert.equal((await Guardian.findById(foreignGuardian.id)).status, "active");
});

test("guardian operations require school_admin, completed password setup and active access", async () => {
  for (const client of [request(app), superAgent]) {
    const status = client === superAgent ? 403 : 401;
    for (const path of [
      "/guardians",
      "/guardians/stats",
      `/guardians/${guardianA}`,
      `/guardians/${guardianA}/students`,
      `/students/${studentA.id}/guardians`,
    ])
      assert.equal((await client.get(`/api/school${path}`)).status, status);
    for (const [method, path, body] of [
      ["post", "/guardians", fullInput],
      ["put", `/guardians/${guardianA}`, fullInput],
      ["patch", `/guardians/${guardianA}/status`, { status: "inactive" }],
      ["delete", `/guardians/${guardianA}`],
      ["post", pair(guardianA, studentA.id), { relationship: "other" }],
      ["put", pair(guardianA, studentA.id), { relationship: "other" }],
      ["delete", pair(guardianA, studentA.id)],
    ])
      assert.equal((await send(client, method, path, body)).status, status);
  }
  await User.findByIdAndUpdate(admin.id, { mustChangePassword: true });
  assert.equal(
    (await agent.get("/api/school/guardians")).body.code,
    "PASSWORD_CHANGE_REQUIRED",
  );
  await User.findByIdAndUpdate(admin.id, {
    mustChangePassword: false,
    isActive: false,
  });
  assert.equal((await agent.get("/api/school/guardians")).status, 401);
  await User.findByIdAndUpdate(admin.id, { isActive: true });
  await School.findByIdAndUpdate(school.id, { status: "suspended" });
  assert.equal((await agent.get("/api/school/guardians")).status, 403);
  assert.equal((await superAgent.get("/api/schools")).status, 200);
});
