import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import request from "supertest";
import bcrypt from "bcrypt";
import { createApp } from "../src/app.js";
import { Attendance } from "../src/models/Attendance.js";
import { AttendanceAudit } from "../src/models/AttendanceAudit.js";
import { Student } from "../src/models/Student.js";
import { Staff } from "../src/models/Staff.js";
import { School } from "../src/models/School.js";
import { User } from "../src/models/User.js";
import { AcademicSession } from "../src/models/AcademicSession.js";
import { SchoolClass } from "../src/models/SchoolClass.js";
import { initializeSchoolConfiguration } from "../src/services/schoolConfiguration.js";
import { attendanceToday } from "../src/validation/attendance.js";

const config = {
  NODE_ENV: "test",
  JWT_SECRET: "attendance-test-secret-more-than-32-characters",
  FRONTEND_ORIGIN: "http://localhost:5173",
};
const addDays = (date, days) => {
  const value = new Date(date);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};
const today = attendanceToday();
const lastMonday = new Date(today);
lastMonday.setUTCDate(
  lastMonday.getUTCDate() - ((lastMonday.getUTCDay() + 6) % 7) - 7,
);
const date = lastMonday.toISOString().slice(0, 10),
  secondDate = addDays(date, 1),
  thirdDate = addDays(date, 2),
  future = addDays(today, 1);
let mongo,
  app,
  agent,
  editorAgent,
  superAgent,
  school,
  otherSchool,
  admin,
  editor,
  session,
  otherSession,
  schoolClass,
  otherClass,
  students,
  staff,
  foreignStudent,
  foreignStaff,
  inactiveStudent,
  inactiveStaff,
  futureStudent,
  futureStaff,
  recordId,
  foreignRecord;
const send = (client, method, path, input) =>
  client[method](`/api/school/attendance${path}`)
    .set("Origin", config.FRONTEND_ORIGIN)
    .send(input);
const write = (kind, input, client = agent) =>
  send(client, "put", `/${kind}`, input);
const context = (day = date) => ({
  date: day,
  sessionId: session.id,
  classId: schoolClass.id,
  arm: "A",
});
const entry = (person, status, revision = 0) => ({
  personId: person.id,
  status,
  revision,
});
const roster = (kind, input) =>
  agent.get(`/api/school/attendance/${kind}/roster`).query(input);
const report = (input) =>
  agent.get("/api/school/attendance/reports").query(input);
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
      Student.init(),
      Attendance.init(),
      AttendanceAudit.init(),
      initializeSchoolConfiguration(),
    ]);
    const passwordHash = await bcrypt.hash("Test-password-123!", 4);
    const owner = await User.create({
      name: "Platform Admin",
      email: "owner@attendance.test",
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
      name: "Attendance Admin",
      email: "school@attendance.test",
      role: "school_admin",
      schoolId: school._id,
      passwordHash,
    });
    editor = await User.create({
      name: "Correction Admin",
      email: "editor@attendance.test",
      role: "school_admin",
      schoolId: school._id,
      passwordHash,
    });
    [session, otherSession] = await AcademicSession.create(
      [school, otherSchool].map((item) => ({
        schoolId: item._id,
        name: "Current academic session",
        startDate: `${Number(today.slice(0, 4)) - 1}-01-01`,
        endDate: `${Number(today.slice(0, 4)) + 1}-12-31`,
        status: "active",
      })),
    );
    [schoolClass, otherClass] = await SchoolClass.create(
      [school, otherSchool].map((item) => ({
        schoolId: item._id,
        name: "Primary 1",
        arms: ["A", "B", "C"],
        inactiveArms: ["C"],
        capacity: 50,
      })),
    );
    const studentData = {
      schoolId: school._id,
      dateOfBirth: "2015-04-15",
      gender: "not_specified",
      address: "Private student address",
      admissionDate: "2020-01-01",
      sessionId: session._id,
      classId: schoolClass._id,
      arm: "A",
      admissionStatus: "admitted",
      createdBy: admin._id,
      updatedBy: admin._id,
    };
    students = await Student.create(
      ["Alice", "Bola", "Chidi", "Dara"].map((firstName, index) => ({
        ...studentData,
        firstName,
        lastName: "Test",
        admissionNumber: `ST-${index}`,
      })),
    );
    inactiveStudent = await Student.create({
      ...studentData,
      firstName: "Inactive",
      lastName: "Student",
      admissionNumber: "INACTIVE",
      status: "inactive",
    });
    await Student.create({
      ...studentData,
      firstName: "Archived",
      lastName: "Student",
      admissionNumber: "ARCHIVED",
      status: "archived",
    });
    futureStudent = await Student.create({
      ...studentData,
      firstName: "Future",
      lastName: "Student",
      admissionNumber: "FUTURE",
      admissionDate: future,
    });
    foreignStudent = await Student.create({
      ...studentData,
      schoolId: otherSchool._id,
      firstName: "Foreign",
      lastName: "Student",
      admissionNumber: "FOREIGN",
      sessionId: otherSession._id,
      classId: otherClass._id,
    });
    const staffData = {
      schoolId: school._id,
      email: "contact@attendance.test",
      phone: "+234 801 234 5678",
      department: "School",
      designation: "Staff member",
      employmentDate: "2020-01-01",
      employmentType: "full_time",
      createdBy: admin._id,
      updatedBy: admin._id,
    };
    staff = await Staff.create([
      {
        ...staffData,
        fullName: "Teaching Staff",
        employeeId: "T1",
        category: "teaching",
      },
      {
        ...staffData,
        fullName: "Office Staff",
        employeeId: "N1",
        category: "non_teaching",
      },
    ]);
    inactiveStaff = await Staff.create({
      ...staffData,
      fullName: "Inactive Staff",
      employeeId: "I1",
      category: "teaching",
      status: "inactive",
    });
    futureStaff = await Staff.create({
      ...staffData,
      fullName: "Future Staff",
      employeeId: "F1",
      category: "teaching",
      employmentDate: future,
    });
    foreignStaff = await Staff.create({
      ...staffData,
      schoolId: otherSchool._id,
      fullName: "Foreign Staff",
      employeeId: "FOREIGN",
      category: "teaching",
    });
    foreignRecord = await Attendance.create({
      schoolId: otherSchool._id,
      kind: "staff",
      personId: foreignStaff._id,
      date,
      personName: foreignStaff.fullName,
      identifier: foreignStaff.employeeId,
      category: "teaching",
      status: "present",
      createdBy: admin._id,
      updatedBy: admin._id,
      createdByName: admin.name,
      updatedByName: admin.name,
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

test("student/staff rosters contain eligible real people without fabricated absences or personal data", async () => {
  const res = await roster("student", context());
  assert.equal(res.status, 200);
  assert.equal(res.body.total, 4);
  assert.equal(res.body.summary.expected, 4);
  assert.equal(res.body.summary.unmarked, 4);
  assert.equal(res.body.summary.absent, 0);
  assert.equal(res.body.summary.attendancePercentage, null);
  assert.equal(res.body.records[0].address, undefined);
  assert.equal(res.body.records[0].dateOfBirth, undefined);
  const staffRes = await roster("staff", { date });
  assert.equal(staffRes.body.total, 2);
  assert.equal(staffRes.body.summary.unmarked, 2);
  assert.equal(
    (await roster("staff", { date, category: "non_teaching" })).body.total,
    1,
  );
  assert.equal(
    (await roster("student", { ...context(), search: "Alice", limit: 1 })).body
      .total,
    1,
  );
});

test("bulk student and staff attendance records all supported statuses and creation audit", async () => {
  const statuses = ["present", "absent", "late", "excused"];
  assert.equal(
    (
      await write("student", {
        ...context(),
        entries: students.map((person, index) =>
          entry(person, statuses[index]),
        ),
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await write("staff", {
        date,
        entries: [entry(staff[0], "present"), entry(staff[1], "absent")],
      })
    ).status,
    200,
  );
  const record = await Attendance.findOne({
    schoolId: school._id,
    kind: "student",
    personId: students[0]._id,
    date: new Date(date),
  });
  recordId = record.id;
  assert.equal(record.revision, 1);
  assert.equal(record.createdBy.toString(), admin.id);
  assert.equal(record.updatedByName, admin.name);
  assert.ok(record.createdAt);
  assert.equal(record.personName, "Alice Test");
  const audit = await AttendanceAudit.findOne({
    schoolId: school._id,
    attendanceId: record._id,
  });
  assert.equal(audit.previousStatus, null);
  assert.equal(audit.status, "present");
  assert.equal(audit.actorId.toString(), admin.id);
});

test("duplicate batch entries, duplicate creates and direct database duplicates are prevented", async () => {
  assert.equal(
    (
      await write("student", {
        ...context(),
        entries: [entry(students[0], "present")],
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await write("student", {
        ...context(thirdDate),
        entries: [entry(students[0], "present"), entry(students[0], "absent")],
      })
    ).status,
    400,
  );
  assert.equal(
    (await write("staff", { date, entries: [entry(staff[0], "present")] }))
      .status,
    409,
  );
  const copy = (await Attendance.findById(recordId)).toObject();
  delete copy._id;
  await assert.rejects(
    Attendance.create(copy),
    (error) => error.code === 11000,
  );
  assert.equal(
    await Attendance.countDocuments({
      schoolId: school._id,
      kind: "student",
      personId: students[0]._id,
      date: new Date(date),
    }),
    1,
  );
});

test("daily roster statistics distinguish present, absent, late, excused and unmarked", async () => {
  const res = await roster("student", context());
  assert.deepEqual(res.body.summary, {
    present: 1,
    absent: 1,
    late: 1,
    excused: 1,
    totalRecorded: 4,
    attendancePercentage: 66.67,
    expected: 4,
    unmarked: 0,
  });
  const staffRes = await roster("staff", { date });
  assert.equal(staffRes.body.summary.present, 1);
  assert.equal(staffRes.body.summary.absent, 1);
  assert.equal(staffRes.body.summary.attendancePercentage, 50);
  assert.equal(
    (
      await write("student", {
        ...context(secondDate),
        entries: [entry(students[0], "present"), entry(students[1], "absent")],
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await write("staff", {
        date: secondDate,
        entries: [entry(staff[0], "late"), entry(staff[1], "excused")],
      })
    ).status,
    200,
  );
  const partial = await roster("student", context(secondDate));
  assert.equal(partial.body.summary.expected, 4);
  assert.equal(partial.body.summary.unmarked, 2);
  assert.equal(partial.body.summary.absent, 1);
});

test("daily, weekly, monthly and custom reports calculate percentages from recorded observations", async () => {
  const daily = await report({ kind: "student", period: "daily", date });
  assert.equal(daily.status, 200);
  assert.equal(daily.body.total, 4);
  assert.equal(daily.body.summary.attendancePercentage, 66.67);
  const weekly = await report({ kind: "student", period: "weekly", date });
  assert.equal(weekly.body.total, 6);
  assert.equal(weekly.body.range.from, date);
  assert.equal(weekly.body.summary.attendancePercentage, 60);
  assert.equal(weekly.body.daily.length, 2);
  const monthly = await report({ kind: "student", period: "monthly", date });
  assert.equal(monthly.status, 200);
  assert.equal(
    monthly.body.total,
    date.slice(0, 7) === secondDate.slice(0, 7) ? 6 : 4,
  );
  const custom = await report({
    kind: "staff",
    period: "custom",
    from: date,
    to: secondDate,
  });
  assert.equal(custom.body.total, 4);
  assert.equal(custom.body.summary.attendancePercentage, 66.67);
  assert.equal(custom.body.summary.excused, 1);
  const empty = await report({
    kind: "student",
    period: "daily",
    date: thirdDate,
  });
  assert.equal(empty.body.summary.totalRecorded, 0);
  assert.equal(empty.body.summary.attendancePercentage, null);
});

test("class/arm/category reports, individual histories, search and pagination are correctly scoped", async () => {
  const common = {
    kind: "student",
    period: "weekly",
    date,
    sessionId: session.id,
    classId: schoolClass.id,
    arm: "A",
  };
  assert.equal((await report(common)).body.total, 6);
  assert.equal((await report({ ...common, arm: "B" })).body.total, 0);
  assert.equal((await report({ ...common, search: "Alice" })).body.total, 2);
  assert.equal((await report({ ...common, search: ".*" })).body.total, 0);
  const first = await report({ ...common, limit: 2 }),
    second = await report({ ...common, limit: 2, page: 2 });
  assert.equal(first.body.records.length, 2);
  assert.equal(first.body.total, 6);
  assert.notEqual(first.body.records[0]._id, second.body.records[0]._id);
  const studentHistory = await agent
    .get(`/api/school/attendance/student/history/${students[0].id}`)
    .query({ period: "weekly", date });
  assert.equal(studentHistory.body.total, 2);
  assert.equal(studentHistory.body.summary.attendancePercentage, 100);
  const staffHistory = await agent
    .get(`/api/school/attendance/staff/history/${staff[0].id}`)
    .query({ period: "weekly", date });
  assert.equal(staffHistory.body.total, 2);
  assert.equal(staffHistory.body.summary.attendancePercentage, 100);
  const staffCategory = await report({
    kind: "staff",
    period: "weekly",
    date,
    category: "non_teaching",
  });
  assert.equal(staffCategory.body.total, 2);
  assert.equal(staffCategory.body.summary.attendancePercentage, 0);
});

test("corrections require current revision and reason, preserve creation metadata and append audit", async () => {
  const body = { ...context(), entries: [entry(students[0], "late", 1)] };
  assert.equal((await write("student", body)).status, 400);
  assert.equal(
    (
      await write(
        "student",
        { ...body, correctionReason: "Arrival reviewed" },
        editorAgent,
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await write("student", {
        ...body,
        correctionReason: "Stale browser update",
      })
    ).status,
    409,
  );
  const record = await Attendance.findById(recordId);
  assert.equal(record.revision, 2);
  assert.equal(record.createdBy.toString(), admin.id);
  assert.equal(record.updatedBy.toString(), editor.id);
  assert.equal(record.status, "late");
  const audits = await agent
    .get(`/api/school/attendance/records/${recordId}/audit`)
    .query({ limit: 1 });
  assert.equal(audits.body.total, 2);
  assert.equal(audits.body.records[0].actorName, editor.name);
  assert.equal(audits.body.records[0].previousStatus, "present");
  assert.equal(audits.body.records[0].reason, "Arrival reviewed");
  assert.ok(audits.body.records[0].createdAt);
  assert.equal(audits.body.records[0].schoolId, undefined);
  assert.equal(
    (
      await write("student", {
        ...context(),
        entries: [entry(students[0], "late", 2)],
      })
    ).status,
    200,
  );
  assert.equal(
    await AttendanceAudit.countDocuments({
      schoolId: school._id,
      attendanceId: recordId,
    }),
    2,
  );
  assert.equal(
    (
      await write(
        "staff",
        {
          date,
          entries: [entry(staff[0], "late", 1)],
          correctionReason: "Sign-in reviewed",
        },
        editorAgent,
      )
    ).status,
    200,
  );
});

test("validation blocks future dates, invalid dates/statuses, inactive people and wrong placement", async () => {
  for (const extra of [
    { date: future },
    { date: "2026-02-30" },
    { sessionId: otherSession.id },
    { classId: otherClass.id },
    { arm: "Z" },
    { arm: "C" },
    { arm: "" },
    { schoolId: otherSchool.id },
    { createdBy: editor.id },
  ])
    assert.equal(
      (
        await write("student", {
          ...context(thirdDate),
          entries: [entry(students[2], "present")],
          ...extra,
        })
      ).status,
      400,
    );
  for (const person of [inactiveStudent, futureStudent, foreignStudent])
    assert.equal(
      (
        await write("student", {
          ...context(thirdDate),
          entries: [entry(person, "present")],
        })
      ).status,
      400,
    );
  for (const person of [inactiveStaff, futureStaff, foreignStaff])
    assert.equal(
      (
        await write("staff", {
          date: thirdDate,
          entries: [entry(person, "present")],
        })
      ).status,
      400,
    );
  assert.equal(
    (
      await write("staff", {
        date: future,
        entries: [entry(staff[0], "present")],
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await write("student", {
        ...context(thirdDate),
        entries: [{ personId: students[2].id, status: "unknown" }],
      })
    ).status,
    400,
  );
});

test("bulk save is atomic and concurrent creates cannot produce duplicate records/audits", async () => {
  assert.equal(
    (
      await write("student", {
        ...context(thirdDate),
        entries: [
          entry(students[2], "present"),
          entry(foreignStudent, "absent"),
        ],
      })
    ).status,
    400,
  );
  assert.equal(
    await Attendance.countDocuments({
      schoolId: school._id,
      date: new Date(thirdDate),
    }),
    0,
  );
  const results = await Promise.all(
    [1, 2].map(() =>
      write("student", {
        ...context(thirdDate),
        entries: [entry(students[2], "present")],
      }),
    ),
  );
  assert.deepEqual(results.map((item) => item.status).sort(), [200, 409]);
  const record = await Attendance.findOne({
    schoolId: school._id,
    kind: "student",
    personId: students[2]._id,
    date: new Date(thirdDate),
  });
  assert.equal(
    await AttendanceAudit.countDocuments({
      schoolId: school._id,
      attendanceId: record._id,
    }),
    1,
  );
});

test("historical placement is immutable and remains correctable after transfer or academic deactivation", async () => {
  await Student.findByIdAndUpdate(students[0].id, {
    arm: "B",
    firstName: "Renamed",
  });
  assert.equal(
    (
      await write("student", {
        ...context(),
        arm: "B",
        entries: [entry(students[0], "present")],
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await write("student", {
        ...context(),
        entries: [entry(students[0], "excused", 2)],
        correctionReason: "Review after transfer",
      })
    ).status,
    200,
  );
  await SchoolClass.findByIdAndUpdate(schoolClass.id, { status: "inactive" });
  assert.equal(
    (
      await write("student", {
        ...context(),
        entries: [entry(students[0], "present", 3)],
        correctionReason: "Historical correction",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await write("student", {
        ...context(thirdDate),
        entries: [entry(students[3], "present")],
      })
    ).status,
    400,
  );
  await SchoolClass.findByIdAndUpdate(schoolClass.id, { status: "active" });
  const record = await Attendance.findById(recordId);
  assert.equal(record.arm, "A");
  assert.equal(record.personName, "Alice Test");
  assert.equal(record.revision, 4);
  await Student.findByIdAndUpdate(students[0].id, { status: "inactive" });
  assert.equal(
    (
      await write("student", {
        ...context(),
        entries: [entry(students[0], "absent", 4)],
        correctionReason: "Inactive person attempt",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await report({
        kind: "student",
        period: "daily",
        date,
        personId: students[0].id,
      })
    ).body.total,
    1,
  );
});

test("reports, histories, audit and deletion enforce tenant scope and retain all attendance", async () => {
  for (const extra of [
    { personId: foreignStudent.id },
    { classId: otherClass.id },
    { sessionId: otherSession.id },
  ])
    assert.equal(
      (await report({ kind: "student", period: "daily", date, ...extra }))
        .status,
      404,
    );
  assert.equal(
    (
      await agent
        .get(`/api/school/attendance/staff/history/${foreignStaff.id}`)
        .query({ period: "daily", date })
    ).status,
    404,
  );
  assert.equal(
    (
      await agent.get(
        `/api/school/attendance/records/${foreignRecord.id}/audit`,
      )
    ).status,
    404,
  );
  assert.equal(
    (await send(agent, "delete", `/records/${foreignRecord.id}`)).status,
    404,
  );
  assert.equal(
    (await send(agent, "delete", `/records/${recordId}`)).status,
    405,
  );
  assert.ok(await Attendance.findById(recordId));
  assert.equal(
    await AttendanceAudit.countDocuments({
      schoolId: school._id,
      attendanceId: recordId,
    }),
    4,
  );
  const allStaff = await report({ kind: "staff", period: "daily", date });
  assert.equal(allStaff.body.total, 2);
  assert.equal(
    allStaff.body.records.some((record) => record._id === foreignRecord.id),
    false,
  );
  for (const query of [
    { date: future },
    { kind: "staff", classId: schoolClass.id },
    { arm: "A" },
    { from: date, to: addDays(date, -1), period: "custom" },
    { schoolId: otherSchool.id },
    { page: 0 },
  ])
    assert.equal(
      (await report({ kind: "student", period: "daily", date, ...query }))
        .status,
      400,
    );
});

test("attendance requires authorised school administrators and existing account/school permissions", async () => {
  for (const client of [request(app), superAgent]) {
    const status = client === superAgent ? 403 : 401;
    assert.equal(
      (
        await client
          .get("/api/school/attendance/student/roster")
          .query(context())
      ).status,
      status,
    );
    assert.equal(
      (
        await client
          .get("/api/school/attendance/reports")
          .query({ kind: "student", period: "daily", date })
      ).status,
      status,
    );
    assert.equal(
      (await client.get(`/api/school/attendance/records/${recordId}/audit`))
        .status,
      status,
    );
    assert.equal(
      (
        await write(
          "staff",
          { date, entries: [entry(staff[0], "present")] },
          client,
        )
      ).status,
      status,
    );
  }
  await User.findByIdAndUpdate(admin.id, { mustChangePassword: true });
  assert.equal(
    (await roster("staff", { date })).body.code,
    "PASSWORD_CHANGE_REQUIRED",
  );
  await User.findByIdAndUpdate(admin.id, {
    mustChangePassword: false,
    isActive: false,
  });
  assert.equal((await roster("staff", { date })).status, 401);
  await User.findByIdAndUpdate(admin.id, { isActive: true });
  await School.findByIdAndUpdate(school.id, { status: "suspended" });
  assert.equal((await roster("staff", { date })).status, 403);
  assert.equal((await superAgent.get("/api/schools")).status, 200);
});
