import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import request from "supertest";
import bcrypt from "bcrypt";
import { createApp } from "../src/app.js";
import { School } from "../src/models/School.js";
import { User } from "../src/models/User.js";
import { AcademicSession } from "../src/models/AcademicSession.js";
import { AcademicTerm } from "../src/models/AcademicTerm.js";
import { SchoolClass } from "../src/models/SchoolClass.js";
import { Subject } from "../src/models/Subject.js";
import { initializeSchoolConfiguration } from "../src/services/schoolConfiguration.js";

const config = {
  NODE_ENV: "test",
  JWT_SECRET: "academic-test-secret-more-than-32-characters",
  FRONTEND_ORIGIN: "http://localhost:5173",
};
let mongo,
  app,
  agent,
  otherAgent,
  superAgent,
  school,
  otherSchool,
  sessionId,
  nextSessionId,
  termId,
  secondTermId,
  classId,
  secondClassId,
  subjectId,
  foreignSession,
  foreignClass,
  foreignTerm,
  foreignSubject;
const send = (client, method, path, input) =>
  client[method](`/api/school${path}`)
    .set("Origin", config.FRONTEND_ORIGIN)
    .send(input);
const write = (method, path, input) => send(agent, method, path, input);
const firstSession = {
  name: "2026/2027",
  startDate: "2026-09-01",
  endDate: "2027-07-31",
};
const nextSession = {
  name: "2027/2028",
  startDate: "2027-09-01",
  endDate: "2028-07-31",
};
const firstTerm = () => ({
  name: "First Term",
  sessionId,
  startDate: "2026-09-01",
  endDate: "2026-12-18",
});
before(
  async () => {
    mongo = await MongoMemoryReplSet.create({
      replSet: { count: 1 },
      instanceOpts: [{ launchTimeout: 60000 }],
    });
    await mongoose.connect(mongo.getUri());
    await Promise.all([User, School].map((Model) => Model.init()));
    await initializeSchoolConfiguration();
    const passwordHash = await bcrypt.hash("Test-password-123!", 4);
    const owner = await User.create({
      name: "Platform Admin",
      email: "owner@academic.test",
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
    await User.create({
      name: "School Admin",
      email: "school@academic.test",
      role: "school_admin",
      schoolId: school._id,
      passwordHash,
    });
    await User.create({
      name: "Other Admin",
      email: "other@academic.test",
      role: "school_admin",
      schoolId: otherSchool._id,
      passwordHash,
    });
    app = createApp(config);
    agent = request.agent(app);
    otherAgent = request.agent(app);
    superAgent = request.agent(app);
    for (const [client, email, path] of [
      [agent, "school@academic.test", "/school-login"],
      [otherAgent, "other@academic.test", "/school-login"],
      [superAgent, "owner@academic.test", "/login"],
    ]) {
      assert.equal(
        (
          await client
            .post(`/api/auth${path}`)
            .set("Origin", config.FRONTEND_ORIGIN)
            .send({ email, password: "Test-password-123!" })
        ).status,
        200,
      );
    }
    foreignSession = await AcademicSession.create({
      ...firstSession,
      schoolId: otherSchool._id,
    });
    foreignTerm = await AcademicTerm.create({
      ...firstTerm(),
      sessionId: foreignSession.id,
      schoolId: otherSchool._id,
    });
    foreignClass = await SchoolClass.create({
      name: "Primary 1",
      arms: ["A"],
      capacity: 30,
      schoolId: otherSchool._id,
    });
    foreignSubject = await Subject.create({
      name: "English",
      classId: foreignClass.id,
      schoolId: otherSchool._id,
    });
  },
  { timeout: 900000 },
);
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

test("school profile access and updates are scoped and exclude platform settings", async () => {
  const profile = (await agent.get("/api/school/profile")).body.profile;
  assert.equal(profile.name, school.name);
  assert.equal(profile.createdBy, undefined);
  assert.equal(profile.status, undefined);
  const input = {
    ...profile,
    address: "10 Learning Avenue, Lagos",
    phone: "+234 801 234 5678",
    email: "office@bright.test",
    logoUrl: "https://example.test/logo.png",
  };
  assert.equal((await write("put", "/profile", input)).status, 200);
  assert.equal(
    (await agent.get("/api/school/profile")).body.profile.address,
    input.address,
  );
  assert.equal(
    (await otherAgent.get("/api/school/profile")).body.profile.address,
    "",
  );
  for (const extra of [
    { status: "suspended" },
    { schoolId: otherSchool.id },
    { createdBy: new mongoose.Types.ObjectId().toString() },
    { configurationRevision: 50 },
  ])
    assert.equal(
      (await write("put", "/profile", { ...input, ...extra })).status,
      400,
    );
  assert.equal(
    (
      await write("put", "/profile", {
        ...input,
        logoUrl: "javascript:alert(1)",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await write("put", "/profile", {
        ...input,
        logoUrl: "https://user:password@example.test/logo.png",
      })
    ).status,
    400,
  );
  assert.equal(
    (await write("put", "/profile", { ...input, email: "invalid" })).status,
    400,
  );
});

test("academic sessions create inactive and reject invalid, duplicate and overlapping dates", async () => {
  const res = await write("post", "/sessions", firstSession);
  assert.equal(res.status, 201);
  sessionId = res.body.record._id;
  assert.equal(res.body.record.status, "inactive");
  assert.equal(res.body.record.schoolId, school.id);
  assert.equal(
    (
      await write("post", "/sessions", {
        ...nextSession,
        name: firstSession.name,
      })
    ).status,
    409,
  );
  assert.equal(
    (await write("post", "/sessions", { ...firstSession, name: "Overlapping" }))
      .status,
    409,
  );
  assert.equal(
    (
      await write("post", "/sessions", {
        name: "Boundary",
        startDate: firstSession.endDate,
        endDate: "2027-08-20",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await write("post", "/sessions", {
        ...nextSession,
        startDate: "2027-02-30",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await write("post", "/sessions", {
        ...nextSession,
        endDate: "2027-08-01",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await write("post", "/sessions", {
        ...nextSession,
        schoolId: otherSchool.id,
      })
    ).status,
    400,
  );
  const next = await write("post", "/sessions", nextSession);
  assert.equal(next.status, 201);
  nextSessionId = next.body.record._id;
  assert.equal(
    (await agent.get("/api/school/sessions")).body.records.length,
    2,
  );
});

test("session activation requires explicit replacement confirmation and preserves one active session", async () => {
  assert.equal(
    (
      await write("patch", `/sessions/${sessionId}/status`, {
        status: "active",
      })
    ).status,
    200,
  );
  const conflict = await write("patch", `/sessions/${nextSessionId}/status`, {
    status: "active",
  });
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.code, "ACTIVE_REPLACEMENT_REQUIRED");
  assert.equal((await AcademicSession.findById(sessionId)).status, "active");
  const switched = await write("patch", `/sessions/${nextSessionId}/status`, {
    status: "active",
    confirmSwitch: true,
  });
  assert.equal(switched.status, 200);
  assert.equal((await AcademicSession.findById(sessionId)).status, "inactive");
  assert.equal(
    await AcademicSession.countDocuments({
      schoolId: school._id,
      status: "active",
    }),
    1,
  );
});

test("term creation validates parent dates, duplicates and overlap", async () => {
  const res = await write("post", "/terms", firstTerm());
  assert.equal(res.status, 201);
  termId = res.body.record._id;
  assert.equal((await write("post", "/terms", firstTerm())).status, 409);
  assert.equal(
    (
      await write("post", "/terms", {
        ...firstTerm(),
        name: "Second Term",
        startDate: "2026-08-01",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await write("post", "/terms", {
        ...firstTerm(),
        name: "Second Term",
        endDate: "2027-08-01",
      })
    ).status,
    400,
  );
  assert.equal(
    (await write("post", "/terms", { ...firstTerm(), name: "Second Term" }))
      .status,
    409,
  );
  assert.equal(
    (await write("post", "/terms", { ...firstTerm(), name: "Fourth Term" }))
      .status,
    400,
  );
  const second = await write("post", "/terms", {
    sessionId,
    name: "Second Term",
    startDate: "2027-01-05",
    endDate: "2027-04-01",
  });
  assert.equal(second.status, 201);
  secondTermId = second.body.record._id;
  assert.equal(
    (
      await write("post", "/terms", {
        sessionId,
        name: "Third Term",
        startDate: "2027-04-20",
        endDate: "2027-07-30",
      })
    ).status,
    201,
  );
});

test("term activation is unique per session and replacement requires confirmation", async () => {
  assert.equal(
    (await write("patch", `/terms/${termId}/status`, { status: "active" }))
      .status,
    200,
  );
  assert.equal(
    (
      await write("patch", `/terms/${secondTermId}/status`, {
        status: "active",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await write("patch", `/terms/${secondTermId}/status`, {
        status: "active",
        confirmSwitch: true,
      })
    ).status,
    200,
  );
  assert.equal((await AcademicTerm.findById(termId)).status, "inactive");
  assert.equal(
    await AcademicTerm.countDocuments({
      schoolId: school._id,
      sessionId,
      status: "active",
    }),
    1,
  );
});

test("session and term edits preserve date integrity and cannot move terms to a different parent", async () => {
  assert.equal(
    (
      await write("put", `/sessions/${sessionId}`, {
        ...firstSession,
        endDate: "2027-03-01",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await write("put", `/sessions/${sessionId}`, {
        ...firstSession,
        name: "2026/2027 Academic Year",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await write("put", `/sessions/${sessionId}`, {
        ...firstSession,
        endDate: "2027-10-01",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await write("put", `/terms/${termId}`, {
        ...firstTerm(),
        endDate: "2026-12-17",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await write("put", `/terms/${termId}`, {
        ...firstTerm(),
        sessionId: nextSessionId,
      })
    ).status,
    400,
  );
});

test("classes support nursery/primary names, multiple arms and validated capacity", async () => {
  const res = await write("post", "/classes", {
    name: "Nursery 1",
    arms: ["a", "B", "C"],
    capacity: 90,
  });
  assert.equal(res.status, 201);
  classId = res.body.record._id;
  assert.deepEqual(res.body.record.arms, ["A", "B", "C"]);
  assert.equal(
    (await write("post", "/classes", { name: "nursery 1", capacity: 90 }))
      .status,
    409,
  );
  assert.equal(
    (
      await write("post", "/classes", {
        name: "Nursery 2",
        arms: ["a", "A"],
        capacity: 30,
      })
    ).status,
    400,
  );
  assert.equal(
    (await write("post", "/classes", { name: "Nursery 2", capacity: 0 }))
      .status,
    400,
  );
  assert.equal(
    (await write("post", "/classes", { name: "Nursery 2", capacity: 2.5 }))
      .status,
    400,
  );
  const second = await write("post", "/classes", {
    name: "Primary 1",
    arms: ["A"],
    capacity: 30,
  });
  assert.equal(second.status, 201);
  secondClassId = second.body.record._id;
  assert.equal(
    (
      await write("put", `/classes/${classId}`, {
        name: "Nursery 1",
        arms: ["A", "B"],
        capacity: 60,
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await write("put", `/classes/${classId}`, {
        name: "primary 1",
        arms: [],
        capacity: 60,
      })
    ).status,
    409,
  );
});

test("subjects are linked to own active class, unique within class, and support editing", async () => {
  const input = {
    name: "English",
    classId,
    code: "ENG",
    description: "Reading and communication",
  };
  const res = await write("post", "/subjects", input);
  assert.equal(res.status, 201);
  subjectId = res.body.record._id;
  assert.equal(
    (await write("post", "/subjects", { ...input, name: "english" })).status,
    409,
  );
  assert.equal(
    (await write("post", "/subjects", { ...input, classId: secondClassId }))
      .status,
    201,
  );
  assert.equal(
    (
      await write("put", `/subjects/${subjectId}`, {
        ...input,
        description: "Updated description",
      })
    ).status,
    200,
  );
  assert.equal(
    (await agent.get("/api/school/subjects")).body.records.length,
    2,
  );
});

test("class and subject deactivation is safe; deletion never removes linked data", async () => {
  // A future student record must survive too; no student module/API is introduced.
  const students = mongoose.connection.collection("students");
  const student = await students.insertOne({
    schoolId: school._id,
    classId: new mongoose.Types.ObjectId(classId),
  });
  assert.equal((await write("delete", `/classes/${classId}`)).status, 405);
  assert.equal(
    (await write("patch", `/classes/${classId}/status`, { status: "inactive" }))
      .status,
    200,
  );
  assert.equal(
    (await write("post", "/subjects", { name: "Mathematics", classId })).status,
    409,
  );
  assert.equal(
    (
      await write("patch", `/subjects/${subjectId}/status`, {
        status: "inactive",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await write("patch", `/subjects/${subjectId}/status`, {
        status: "active",
      })
    ).status,
    409,
  );
  assert.equal(
    (await write("patch", `/classes/${classId}/status`, { status: "active" }))
      .status,
    200,
  );
  assert.equal(
    (
      await write("patch", `/subjects/${subjectId}/status`, {
        status: "active",
      })
    ).status,
    200,
  );
  assert.equal((await write("delete", `/subjects/${subjectId}`)).status, 405);
  assert.ok(await Subject.findById(subjectId));
  assert.ok(
    await students.findOne({ _id: student.insertedId, schoolId: school._id }),
  );
  assert.ok(await SchoolClass.findById(classId));
});

test("all lists and writes enforce tenant isolation, including parent references and status changes", async () => {
  const foreign = [
    ["sessions", foreignSession, firstSession],
    ["terms", foreignTerm, { ...firstTerm(), sessionId: foreignSession.id }],
    ["classes", foreignClass, { name: "Primary 1", arms: ["A"], capacity: 30 }],
    ["subjects", foreignSubject, { name: "English", classId: foreignClass.id }],
  ];
  for (const [path, record, input] of foreign) {
    const list = await agent.get(`/api/school/${path}`);
    assert.equal(list.status, 200);
    assert.equal(
      list.body.records.some((item) => item._id === record.id),
      false,
    );
    assert.equal(
      (await write("put", `/${path}/${record.id}`, input)).status,
      404,
    );
    assert.equal(
      (
        await write("patch", `/${path}/${record.id}/status`, {
          status: "active",
        })
      ).status,
      404,
    );
    assert.equal(
      (await agent.get(`/api/school/${path}?schoolId=${otherSchool.id}`))
        .status,
      400,
    );
  }
  assert.equal(
    (
      await write("post", "/terms", {
        ...firstTerm(),
        sessionId: foreignSession.id,
      })
    ).status,
    404,
  );
  assert.equal(
    (
      await write("post", "/subjects", {
        name: "Foreign Class",
        classId: foreignClass.id,
      })
    ).status,
    404,
  );
  assert.equal(
    (await write("delete", `/classes/${foreignClass.id}`)).status,
    404,
  );
  assert.equal(
    (
      await write("post", "/subjects", {
        name: "Injected",
        classId,
        schoolId: otherSchool.id,
      })
    ).status,
    400,
  );
});

test("concurrent overlapping session creation allows only one request to succeed", async () => {
  const results = await Promise.all(
    ["Concurrent A", "Concurrent B"].map((name) =>
      write("post", "/sessions", {
        name,
        startDate: "2030-09-01",
        endDate: "2031-07-31",
      }),
    ),
  );
  assert.deepEqual(results.map((item) => item.status).sort(), [201, 409]);
});

test("existing roles, suspended accounts and first-login restrictions remain enforced", async () => {
  for (const path of ["profile", "sessions", "terms", "classes", "subjects"]) {
    assert.equal((await request(app).get(`/api/school/${path}`)).status, 401);
    assert.equal((await superAgent.get(`/api/school/${path}`)).status, 403);
  }
  assert.equal((await superAgent.get("/api/schools")).status, 200);
  assert.equal((await agent.get("/api/schools")).status, 403);
  await User.updateOne(
    { email: "school@academic.test" },
    { mustChangePassword: true },
  );
  assert.equal(
    (await agent.get("/api/school/sessions")).body.code,
    "PASSWORD_CHANGE_REQUIRED",
  );
  await User.updateOne(
    { email: "school@academic.test" },
    { mustChangePassword: false },
  );
  await School.findByIdAndUpdate(school.id, { status: "suspended" });
  assert.equal((await agent.get("/api/school/profile")).status, 403);
});
