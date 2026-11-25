import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import request from "supertest";
import bcrypt from "bcrypt";
import { createApp } from "../src/app.js";
import { School } from "../src/models/School.js";
import { User } from "../src/models/User.js";
import { SchoolClass } from "../src/models/SchoolClass.js";
import { Subject } from "../src/models/Subject.js";
import { Staff } from "../src/models/Staff.js";
import { initializeSchoolConfiguration } from "../src/services/schoolConfiguration.js";

const config = {
  NODE_ENV: "test",
  JWT_SECRET: "staff-test-secret-more-than-32-characters",
  FRONTEND_ORIGIN: "http://localhost:5173",
};
let mongo,
  app,
  agent,
  otherAgent,
  superAgent,
  school,
  otherSchool,
  user,
  firstClass,
  secondClass,
  inactiveClass,
  otherClass,
  firstSubject,
  secondSubject,
  inactiveSubject,
  otherSubject,
  foreignStaff,
  staffId,
  nonTeachingId;
const base = {
  employeeId: "BFIS-001",
  fullName: "Amina Adeyemi",
  email: "amina@staff.test",
  phone: "+234 801 234 5678",
  gender: "female",
  address: "10 Learning Avenue",
  dateOfBirth: "1990-04-15",
  employmentDate: "2026-09-01",
  department: "Primary",
  designation: "Class Teacher",
  employmentType: "full_time",
  category: "teaching",
};
const teacherInput = () => ({
  ...base,
  classIds: [firstClass.id, secondClass.id],
  subjectIds: [firstSubject.id, secondSubject.id],
});
const send = (client, method, path, body) =>
  client[method](`/api/school${path}`)
    .set("Origin", config.FRONTEND_ORIGIN)
    .send(body);
const write = (method, path, body) => send(agent, method, path, body);

before(
  async () => {
    mongo = await MongoMemoryReplSet.create({
      replSet: { count: 1 },
      instanceOpts: [{ launchTimeout: 60000 }],
    });
    await mongoose.connect(mongo.getUri());
    await Promise.all([
      User.init(),
      School.init(),
      Staff.init(),
      initializeSchoolConfiguration(),
    ]);
    const passwordHash = await bcrypt.hash("Test-password-123!", 4);
    const owner = await User.create({
      name: "Platform Admin",
      email: "owner@staff.test",
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
    user = await User.create({
      name: "School Admin",
      email: "school@staff.test",
      role: "school_admin",
      schoolId: school._id,
      passwordHash,
    });
    const otherUser = await User.create({
      name: "Other Admin",
      email: "other@staff.test",
      role: "school_admin",
      schoolId: otherSchool._id,
      passwordHash,
    });
    [firstClass, secondClass, inactiveClass, otherClass] =
      await SchoolClass.create([
        { name: "Primary 1", schoolId: school._id, capacity: 30 },
        { name: "Primary 2", schoolId: school._id, capacity: 30 },
        {
          name: "Nursery 1",
          schoolId: school._id,
          capacity: 30,
          status: "inactive",
        },
        { name: "Primary 1", schoolId: otherSchool._id, capacity: 30 },
      ]);
    [firstSubject, secondSubject, inactiveSubject, otherSubject] =
      await Subject.create([
        { name: "English", classId: firstClass._id, schoolId: school._id },
        { name: "Mathematics", classId: secondClass._id, schoolId: school._id },
        {
          name: "Reading",
          classId: firstClass._id,
          schoolId: school._id,
          status: "inactive",
        },
        { name: "English", classId: otherClass._id, schoolId: otherSchool._id },
      ]);
    foreignStaff = await Staff.create({
      ...base,
      schoolId: otherSchool._id,
      classIds: [otherClass._id],
      subjectIds: [otherSubject._id],
      createdBy: otherUser._id,
      updatedBy: otherUser._id,
    });
    app = createApp(config);
    agent = request.agent(app);
    otherAgent = request.agent(app);
    superAgent = request.agent(app);
    for (const [client, email, path] of [
      [agent, user.email, "/school-login"],
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

test("school administrator creates a teaching profile and assigned academic records", async () => {
  const res = await write("post", "/staff", teacherInput());
  assert.equal(res.status, 201);
  staffId = res.body.record._id;
  assert.equal(res.body.record.schoolId, school.id);
  assert.equal(res.body.record.status, "active");
  assert.equal(res.body.record.fullName, base.fullName);
  assert.deepEqual(res.body.record.classIds, [firstClass.id, secondClass.id]);
  assert.deepEqual(res.body.record.subjectIds, [
    firstSubject.id,
    secondSubject.id,
  ]);
  assert.equal(res.body.record.createdBy, user.id);
  assert.equal(res.body.record.dateOfBirth.slice(0, 10), base.dateOfBirth);
  assert.equal(await User.countDocuments(), 3); // Staff records never create login accounts.
});

test("non-teaching staff and unassigned teachers are supported", async () => {
  const res = await write("post", "/staff", {
    ...base,
    employeeId: "NON-001",
    fullName: "Office Administrator",
    email: "office@staff.test",
    category: "non_teaching",
    department: "Administration",
    designation: "Office Manager",
    employmentType: "contract",
    dateOfBirth: "",
  });
  assert.equal(res.status, 201);
  nonTeachingId = res.body.record._id;
  assert.equal(res.body.record.dateOfBirth, null);
  assert.deepEqual(res.body.record.classIds, []);
  assert.equal(
    (
      await write("post", "/staff", {
        ...base,
        employeeId: "BFIS-002",
        fullName: "Bola Teacher",
        email: "bola@staff.test",
        employmentType: "part_time",
      })
    ).status,
    201,
  );
});

test("employee ID is case-insensitively unique within a school but reusable across schools", async () => {
  assert.equal(
    (
      await write("post", "/staff", {
        ...teacherInput(),
        employeeId: "bfis-001",
      })
    ).status,
    409,
  );
  assert.ok(await Staff.findById(foreignStaff.id));
  assert.equal(
    (
      await write("put", `/staff/${nonTeachingId}`, {
        ...base,
        employeeId: "BFIS-001",
        category: "non_teaching",
      })
    ).status,
    409,
  );
});

test("staff input validates all fields, dates, references and privileged-field injection", async () => {
  for (const extra of [
    { fullName: "" },
    { email: "invalid" },
    { phone: "abcd" },
    { employeeId: "bad id" },
    { gender: "invalid" },
    { category: "invalid" },
    { employmentType: "invalid" },
    { dateOfBirth: "2026-02-30" },
    { employmentDate: "invalid" },
    { dateOfBirth: "2099-01-01" },
    { dateOfBirth: "2026-10-01" },
    { schoolId: otherSchool.id },
    { role: "super_admin" },
    { status: "inactive" },
    { createdBy: user.id },
    { classIds: ["bad-id"] },
    { classIds: [firstClass.id, firstClass.id] },
  ])
    assert.equal(
      (
        await write("post", "/staff", {
          ...teacherInput(),
          employeeId: "VALIDATE",
          ...extra,
        })
      ).status,
      400,
    );
  assert.equal(
    (
      await write("post", "/staff", {
        ...teacherInput(),
        employeeId: "VALIDATE",
        category: "non_teaching",
      })
    ).status,
    400,
  );
});

test("new teaching assignments require active same-school classes and matching subjects", async () => {
  for (const assignments of [
    { classIds: [otherClass.id], subjectIds: [] },
    { classIds: [firstClass.id], subjectIds: [otherSubject.id] },
    { classIds: [inactiveClass.id], subjectIds: [] },
    { classIds: [firstClass.id], subjectIds: [inactiveSubject.id] },
    { classIds: [firstClass.id], subjectIds: [secondSubject.id] },
    { classIds: ["000000000000000000000000"], subjectIds: [] },
  ])
    assert.equal(
      (
        await write("post", "/staff", {
          ...base,
          employeeId: "ASSIGN",
          ...assignments,
        })
      ).status,
      400,
    );
});

test("view and edit preserve employee identity, status and audit fields", async () => {
  assert.equal(
    (await agent.get(`/api/school/staff/${staffId}`)).body.record.fullName,
    base.fullName,
  );
  const res = await write("put", `/staff/${staffId}`, {
    ...teacherInput(),
    phone: "+234 809 999 9999",
    address: "Updated address",
  });
  assert.equal(res.status, 200);
  assert.equal(res.body.record.phone, "+234 809 999 9999");
  assert.equal(res.body.record.updatedBy, user.id);
  assert.equal(res.body.record.status, "active");
  assert.equal(res.body.record.createdBy, user.id);
});

test("staff search, category/status/employment/department filters and pagination use database data", async () => {
  assert.equal(
    (await agent.get("/api/school/staff?search=amina")).body.total,
    1,
  );
  assert.equal(
    (await agent.get("/api/school/staff?search=BFIS-001")).body.total,
    1,
  );
  assert.equal((await agent.get("/api/school/staff?search=.*")).body.total, 0);
  assert.equal(
    (await agent.get("/api/school/staff?category=teaching")).body.total,
    2,
  );
  assert.equal(
    (
      await agent.get(
        "/api/school/staff?category=non_teaching&employmentType=contract",
      )
    ).body.total,
    1,
  );
  assert.equal(
    (await agent.get("/api/school/staff?department=primary&status=active")).body
      .total,
    2,
  );
  const first = await agent.get("/api/school/staff?page=1&limit=1"),
    second = await agent.get("/api/school/staff?page=2&limit=1");
  assert.equal(first.body.total, 3);
  assert.equal(first.body.records.length, 1);
  assert.notEqual(first.body.records[0]._id, second.body.records[0]._id);
  assert.equal((await agent.get("/api/school/staff?limit=100")).status, 400);
  assert.equal((await agent.get("/api/school/staff?page=0")).status, 400);
  assert.equal(
    (await agent.get("/api/school/staff?status=invalid")).status,
    400,
  );
  assert.equal(
    (await agent.get("/api/school/staff?schoolId=" + otherSchool.id)).status,
    400,
  );
});

test("staff statistics count only the authenticated school", async () => {
  assert.deepEqual((await agent.get("/api/school/staff/stats")).body, {
    totalStaff: 3,
    teachingStaff: 2,
    nonTeachingStaff: 1,
    activeStaff: 3,
    inactiveStaff: 0,
  });
  assert.equal(
    (await otherAgent.get("/api/school/staff/stats")).body.totalStaff,
    1,
  );
});

test("deactivation preserves profiles, assignments and future module references; deletion is blocked", async () => {
  const references = mongoose.connection.collection("reference_fixtures");
  const reference = await references.insertOne({
    schoolId: school._id,
    staffId: new mongoose.Types.ObjectId(staffId),
  });
  assert.equal(
    (await write("patch", `/staff/${staffId}/status`, { status: "inactive" }))
      .status,
    200,
  );
  assert.equal(
    (await agent.get("/api/school/staff?status=inactive")).body.total,
    1,
  );
  const stats = (await agent.get("/api/school/staff/stats")).body;
  assert.equal(stats.activeStaff, 2);
  assert.equal(stats.inactiveStaff, 1);
  assert.equal((await write("delete", `/staff/${staffId}`)).status, 405);
  assert.ok(await references.findOne({ _id: reference.insertedId }));
  assert.deepEqual(
    (await agent.get(`/api/school/staff/${staffId}`)).body.record.subjectIds,
    [firstSubject.id, secondSubject.id],
  );
  assert.equal((await write("post", "/staff", teacherInput())).status, 409);
  const edited = await write("put", `/staff/${staffId}`, teacherInput());
  assert.equal(edited.status, 200);
  assert.equal(edited.body.record.status, "inactive");
  assert.equal(
    (await write("patch", `/staff/${staffId}/status`, { status: "active" }))
      .status,
    200,
  );
  assert.equal(
    (await write("patch", `/staff/${staffId}/status`, { status: "deleted" }))
      .status,
    400,
  );
});

test("existing inactive assignments can be retained during profile edits but not newly assigned", async () => {
  assert.equal(
    (
      await write("patch", `/classes/${firstClass.id}/status`, {
        status: "inactive",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await write("put", `/staff/${staffId}`, {
        ...teacherInput(),
        designation: "Senior Teacher",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await write("post", "/staff", {
        ...teacherInput(),
        employeeId: "NEW-INACTIVE",
      })
    ).status,
    400,
  );
  const additionalSubject = await Subject.create({
    name: "Science",
    classId: firstClass._id,
    schoolId: school._id,
  });
  assert.equal(
    (
      await write("put", `/staff/${staffId}`, {
        ...teacherInput(),
        subjectIds: [...teacherInput().subjectIds, additionalSubject.id],
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await write("patch", `/classes/${firstClass.id}/status`, {
        status: "active",
      })
    ).status,
    200,
  );
});

test("every staff endpoint isolates tenants and prevents editing foreign records", async () => {
  assert.equal(
    (await agent.get(`/api/school/staff/${foreignStaff.id}`)).status,
    404,
  );
  assert.equal(
    (await write("put", `/staff/${foreignStaff.id}`, teacherInput())).status,
    404,
  );
  assert.equal(
    (
      await write("patch", `/staff/${foreignStaff.id}/status`, {
        status: "inactive",
      })
    ).status,
    404,
  );
  assert.equal(
    (await write("delete", `/staff/${foreignStaff.id}`)).status,
    404,
  );
  assert.equal(
    (await agent.get("/api/school/staff")).body.records.some(
      (record) => record._id === foreignStaff.id,
    ),
    false,
  );
  assert.equal((await Staff.findById(foreignStaff.id)).status, "active");
  assert.equal((await agent.get("/api/school/staff/bad")).status, 400);
  assert.equal(
    (await agent.get("/api/school/staff/000000000000000000000000")).status,
    404,
  );
});

test("concurrent duplicate employee ID creation produces one record", async () => {
  const res = await Promise.all(
    [1, 2].map(() =>
      write("post", "/staff", { ...base, employeeId: "CONCURRENT" }),
    ),
  );
  assert.deepEqual(res.map((record) => record.status).sort(), [201, 409]);
  assert.equal(
    await Staff.countDocuments({
      schoolId: school._id,
      employeeId: "CONCURRENT",
    }),
    1,
  );
});

test("only active school administrators with completed password setup can manage staff", async () => {
  for (const client of [request(app), superAgent]) {
    const status = client === superAgent ? 403 : 401;
    assert.equal((await client.get("/api/school/staff")).status, status);
    assert.equal((await client.get("/api/school/staff/stats")).status, status);
    assert.equal(
      (await send(client, "post", "/staff", teacherInput())).status,
      status,
    );
    assert.equal(
      (await send(client, "put", `/staff/${staffId}`, teacherInput())).status,
      status,
    );
    assert.equal(
      (
        await send(client, "patch", `/staff/${staffId}/status`, {
          status: "inactive",
        })
      ).status,
      status,
    );
    assert.equal(
      (await send(client, "delete", `/staff/${staffId}`)).status,
      status,
    );
  }
  await User.findByIdAndUpdate(user.id, { mustChangePassword: true });
  assert.equal(
    (await agent.get("/api/school/staff")).body.code,
    "PASSWORD_CHANGE_REQUIRED",
  );
  await User.findByIdAndUpdate(user.id, { mustChangePassword: false });
  await School.findByIdAndUpdate(school.id, { status: "suspended" });
  assert.equal((await agent.get("/api/school/staff")).status, 403);
  assert.equal((await superAgent.get("/api/schools")).status, 200);
});
