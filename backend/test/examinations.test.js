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
import { TeacherAudit } from "../src/models/TeacherAudit.js";
import { Student } from "../src/models/Student.js";
import { AcademicSession } from "../src/models/AcademicSession.js";
import { AcademicTerm } from "../src/models/AcademicTerm.js";
import { SchoolClass } from "../src/models/SchoolClass.js";
import { Subject } from "../src/models/Subject.js";
import { Attendance } from "../src/models/Attendance.js";
import { Examination } from "../src/models/Examination.js";
import {
  Result,
  ResultRevision,
  ExaminationAudit,
  ResultComment,
  ReportCard,
} from "../src/models/Result.js";
import { initializeSchoolConfiguration } from "../src/services/schoolConfiguration.js";
import { calculateResult } from "../src/services/resultCalculations.js";

const config = {
  NODE_ENV: "test",
  JWT_SECRET: "examinations-test-secret-more-than-32-characters",
  FRONTEND_ORIGIN: "http://localhost:5173",
};
const components = [
  { key: "ca", name: "CA", maxMarks: 40, weight: 40 },
  { key: "exam", name: "Examination", maxMarks: 60, weight: 60 },
];
const gradingScale = [
  { minPercent: 70, grade: "A", remark: "Excellent" },
  { minPercent: 60, grade: "B", remark: "Good" },
  { minPercent: 0, grade: "F", remark: "Needs improvement" },
];
let mongo,
  app,
  agent,
  superAgent,
  teacherAgent,
  school,
  otherSchool,
  admin,
  session,
  term,
  wrongTerm,
  schoolClass,
  otherClass,
  maths,
  english,
  otherSubject,
  staff,
  nonTeaching,
  students,
  inactiveStudent,
  foreignStudent,
  foreignExam,
  unrelatedExam,
  exam,
  teacherUser,
  temporaryPassword,
  cloneId;
const staffPayload = () => ({
  fullName: "Subject Teacher",
  email: "teacher@exams.test",
  phone: "+234 801 234 5678",
  gender: "not_specified",
  address: "",
  dateOfBirth: null,
  employeeId: "TEACH-1",
  employmentDate: "2020-01-01",
  department: "Primary",
  designation: "Teacher",
  employmentType: "full_time",
  category: "teaching",
  classIds: [schoolClass.id],
  subjectIds: [maths.id],
});
const input = () => ({
  name: "End of term",
  sessionId: session.id,
  termId: term.id,
  classId: schoolClass.id,
  subjectIds: [maths.id, english.id],
  totalMarks: 100,
  components,
  gradingScale,
  positionsEnabled: true,
});
const send = (client, method, path, body) =>
  client[method](path).set("Origin", config.FRONTEND_ORIGIN).send(body);
const write = (method, suffix, body, client = agent) =>
  send(client, method, `/api/school/examinations${suffix}`, body);
const fetchExam = async () =>
  (await agent.get(`/api/school/examinations/${exam._id}`)).body.record;
const scoreEntries = (subjectId) => ({
  subjectId,
  arm: "A",
  entries: students.map((student, index) => ({
    studentId: student.id,
    scores:
      subjectId === maths.id
        ? [
            { ca: 30, exam: 50 },
            { ca: 35, exam: 45 },
            { ca: 20, exam: 40 },
          ][index]
        : [
            { ca: 40, exam: 40 },
            { ca: 40, exam: 40 },
            { ca: 25, exam: 35 },
          ][index],
    teacherComment:
      subjectId === maths.id ? "Consistent effort" : "Reading progress",
  })),
});
async function state(target, reason = "") {
  const current = await fetchExam();
  const res = await write("post", `/${exam._id}/state`, {
    state: target,
    reason,
    revision: current.revision,
  });
  if (res.status === 200) exam = res.body.record;
  return res;
}
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
        Attendance,
        Examination,
        Result,
        ResultRevision,
        ExaminationAudit,
        ResultComment,
        ReportCard,
      ].map((Model) => Model.init()),
    );
    await initializeSchoolConfiguration();
    const passwordHash = await bcrypt.hash("Test-password-123!", 4);
    const owner = await User.create({
      name: "Platform Admin",
      email: "owner@exams.test",
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
      name: "School Administrator",
      email: "admin@exams.test",
      role: "school_admin",
      schoolId: school._id,
      passwordHash,
    });
    session = await AcademicSession.create({
      schoolId: school._id,
      name: "2026/2027",
      startDate: "2026-09-01",
      endDate: "2027-07-31",
      status: "active",
    });
    const otherSession = await AcademicSession.create({
      schoolId: otherSchool._id,
      name: "2026/2027",
      startDate: "2026-09-01",
      endDate: "2027-07-31",
      status: "active",
    });
    const nextSession = await AcademicSession.create({
      schoolId: school._id,
      name: "2027/2028",
      startDate: "2027-09-01",
      endDate: "2028-07-31",
    });
    term = await AcademicTerm.create({
      schoolId: school._id,
      sessionId: session._id,
      name: "First Term",
      startDate: "2026-09-01",
      endDate: "2026-12-18",
    });
    wrongTerm = await AcademicTerm.create({
      schoolId: school._id,
      sessionId: nextSession._id,
      name: "First Term",
      startDate: "2027-09-01",
      endDate: "2027-12-18",
    });
    schoolClass = await SchoolClass.create({
      schoolId: school._id,
      name: "Primary 1",
      arms: ["A", "B"],
      capacity: 30,
    });
    otherClass = await SchoolClass.create({
      schoolId: school._id,
      name: "Primary 2",
      arms: ["A"],
      capacity: 30,
    });
    const foreignClass = await SchoolClass.create({
      schoolId: otherSchool._id,
      name: "Primary 1",
      arms: ["A"],
      capacity: 30,
    });
    [maths, english, otherSubject] = await Subject.create([
      { schoolId: school._id, classId: schoolClass._id, name: "Mathematics" },
      { schoolId: school._id, classId: schoolClass._id, name: "English" },
      { schoolId: school._id, classId: otherClass._id, name: "Science" },
    ]);
    staff = await Staff.create({
      ...staffPayload(),
      schoolId: school._id,
      createdBy: admin._id,
      updatedBy: admin._id,
    });
    nonTeaching = await Staff.create({
      ...staffPayload(),
      schoolId: school._id,
      employeeId: "NON-1",
      email: "office@exams.test",
      category: "non_teaching",
      classIds: [],
      subjectIds: [],
      createdBy: admin._id,
      updatedBy: admin._id,
    });
    const studentBase = {
      schoolId: school._id,
      dateOfBirth: "2020-04-15",
      gender: "not_specified",
      address: "Private student address",
      admissionDate: "2026-09-01",
      sessionId: session._id,
      classId: schoolClass._id,
      arm: "A",
      admissionStatus: "admitted",
      createdBy: admin._id,
      updatedBy: admin._id,
    };
    students = await Student.create(
      ["Alice", "Bola", "Chidi"].map((firstName, index) => ({
        ...studentBase,
        firstName,
        lastName: "Test",
        admissionNumber: `EX-${index}`,
      })),
    );
    inactiveStudent = await Student.create({
      ...studentBase,
      firstName: "Inactive",
      lastName: "Student",
      admissionNumber: "INACTIVE",
      status: "inactive",
    });
    foreignStudent = await Student.create({
      ...studentBase,
      schoolId: otherSchool._id,
      sessionId: otherSession._id,
      classId: foreignClass._id,
      firstName: "Foreign",
      lastName: "Student",
      admissionNumber: "FOREIGN",
    });
    const rawExam = {
      ...input(),
      subjects: [{ subjectId: maths._id, name: maths.name }],
      sessionName: session.name,
      termName: term.name,
      className: schoolClass.name,
      termStartDate: term.startDate,
      termEndDate: term.endDate,
    };
    delete rawExam.subjectIds;
    foreignExam = await Examination.create({
      ...rawExam,
      schoolId: otherSchool._id,
      sessionId: otherSession._id,
      classId: foreignClass._id,
      name: "Foreign exam",
    });
    unrelatedExam = await Examination.create({
      ...rawExam,
      schoolId: school._id,
      classId: otherClass._id,
      subjects: [{ subjectId: otherSubject._id, name: otherSubject.name }],
      name: "Other class exam",
    });
    await Attendance.create(
      ["present", "late", "absent", "excused"].map((status, index) => ({
        schoolId: school._id,
        kind: "student",
        personId: students[0]._id,
        date: `2026-11-${10 + index}`,
        sessionId: session._id,
        classId: schoolClass._id,
        arm: "A",
        personName: "Alice Test",
        identifier: students[0].admissionNumber,
        status,
        createdBy: admin._id,
        updatedBy: admin._id,
        createdByName: admin.name,
        updatedByName: admin.name,
      })),
    );
    app = createApp(config);
    agent = request.agent(app);
    superAgent = request.agent(app);
    teacherAgent = request.agent(app);
    for (const [client, email, path] of [
      [agent, admin.email, "/school-login"],
      [superAgent, owner.email, "/login"],
    ])
      assert.equal(
        (
          await send(client, "post", `/api/auth${path}`, {
            email,
            password: "Test-password-123!",
          })
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

test("examination setup validates periods, class subjects, weights and grading coverage", async () => {
  for (const extra of [
    { components: [{ ...components[0], weight: 30 }, components[1]] },
    { components: [{ ...components[0], key: "exam" }, components[1]] },
    { totalMarks: 0 },
    { gradingScale: [{ minPercent: 50, grade: "A", remark: "Good" }] },
    { gradingScale: [gradingScale[0], { ...gradingScale[2], minPercent: 70 }] },
    { subjectIds: [otherSubject.id] },
    { termId: wrongTerm.id },
    { schoolId: otherSchool.id },
  ])
    assert.equal(
      (await write("post", "", { ...input(), ...extra })).status,
      400,
    );
  const res = await write("post", "", input());
  assert.equal(res.status, 201);
  exam = res.body.record;
  assert.equal(exam.status, "draft");
  assert.equal(exam.components.length, 2);
  assert.equal(
    (await write("post", "", { ...input(), name: "end of term" })).status,
    409,
  );
  const edit = await write("put", `/${exam._id}`, {
    ...input(),
    revision: exam.revision,
  });
  assert.equal(edit.status, 200);
  exam = edit.body.record;
  assert.equal(exam.configRevision, 2);
  assert.equal((await state("submitted")).status, 409);
});

test("weighted score calculations normalize raw marks exactly and round consistently", () => {
  const calculated = calculateResult(
    {
      totalMarks: 200,
      components: [
        { key: "ca", maxMarks: 20, weight: 30 },
        { key: "exam", maxMarks: 80, weight: 70 },
      ],
      gradingScale,
    },
    { ca: 10, exam: 60 },
  );
  assert.equal(calculated.totalHundredths, 13500);
  assert.equal(calculated.percentHundredths, 6750);
  assert.equal(calculated.grade, "B");
  assert.equal(
    calculateResult(
      { totalMarks: 100, components, gradingScale },
      { ca: 0, exam: 0 },
    ).grade,
    "F",
  );
});

test("administrator provisions linked teacher login once with bcrypt and first-password enforcement", async () => {
  assert.equal(
    (
      await send(
        agent,
        "post",
        `/api/school/staff/${nonTeaching.id}/teacher-account`,
        {},
      )
    ).status,
    400,
  );
  const res = await send(
    agent,
    "post",
    `/api/school/staff/${staff.id}/teacher-account`,
    {},
  );
  assert.equal(res.status, 201);
  teacherUser = res.body.user;
  temporaryPassword = res.body.temporaryPassword;
  assert.equal(teacherUser.role, "teacher");
  assert.equal(teacherUser.staffId, staff.id);
  assert.match(temporaryPassword, /^[A-Za-z0-9_-]{32}$/);
  const user = await User.findById(teacherUser.id).select("+passwordHash");
  assert.equal(
    await bcrypt.compare(temporaryPassword, user.passwordHash),
    true,
  );
  assert.equal(
    (
      await send(
        agent,
        "post",
        `/api/school/staff/${staff.id}/teacher-account`,
        {},
      )
    ).status,
    409,
  );
  const view = await agent.get(`/api/school/staff/${staff.id}/teacher-account`);
  assert.equal(view.body.temporaryPassword, undefined);
  assert.equal(view.body.user.passwordHash, undefined);
  assert.equal(
    (
      await send(teacherAgent, "post", "/api/auth/teacher-login", {
        email: staff.email,
        password: temporaryPassword,
      })
    ).status,
    200,
  );
  assert.equal(
    (await teacherAgent.get("/api/school/examinations")).body.code,
    "PASSWORD_CHANGE_REQUIRED",
  );
  assert.equal(
    (
      await send(teacherAgent, "post", "/api/auth/change-password", {
        currentPassword: temporaryPassword,
        newPassword: "Teacher-password-123!",
      })
    ).status,
    200,
  );
  assert.equal(
    (await teacherAgent.get("/api/school/examinations")).status,
    200,
  );
});

test("teacher access is limited to assigned class/subjects and excludes completed operational modules", async () => {
  const detail = await teacherAgent.get(`/api/school/examinations/${exam._id}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.record.subjects.length, 1);
  assert.equal(detail.body.record.subjects[0].subjectId, maths.id);
  assert.equal(
    (await teacherAgent.get(`/api/school/examinations/${unrelatedExam.id}`))
      .status,
    404,
  );
  for (const path of [
    "/api/schools",
    "/api/school/students",
    "/api/school/staff",
    "/api/school/guardians",
    "/api/school/finance/reports",
    "/api/school/attendance/staff/roster?date=2026-11-10",
    "/api/school/classes",
  ])
    assert.equal((await teacherAgent.get(path)).status, 403);
  assert.equal((await write("post", "", input(), teacherAgent)).status, 403);
  assert.equal(
    (
      await write(
        "post",
        `/${exam._id}/state`,
        { state: "approved", revision: 1 },
        teacherAgent,
      )
    ).status,
    403,
  );
  assert.equal(
    (await teacherAgent.get(`/api/school/examinations/${exam._id}/summary`))
      .status,
    403,
  );
  assert.equal(
    (
      await write(
        "put",
        `/${exam._id}/scores`,
        scoreEntries(english.id),
        teacherAgent,
      )
    ).status,
    403,
  );
});

test("score sheet and bulk entry accept assigned students and produce backend totals/grades", async () => {
  const sheet = await teacherAgent
    .get(`/api/school/examinations/${exam._id}/sheet`)
    .query({ subjectId: maths.id, arm: "A" });
  assert.equal(sheet.status, 200);
  assert.equal(sheet.body.total, 3);
  assert.equal(sheet.body.records[0].address, undefined);
  const saved = await write(
    "put",
    `/${exam._id}/scores`,
    scoreEntries(maths.id),
    teacherAgent,
  );
  assert.equal(saved.status, 200);
  assert.equal(saved.body.changed, 3);
  const results = await Result.find({
    schoolId: school._id,
    examinationId: exam._id,
    subjectId: maths._id,
  }).sort({ admissionNumber: 1 });
  assert.deepEqual(
    results.map((row) => row.totalHundredths),
    [8000, 8000, 6000],
  );
  assert.deepEqual(
    results.map((row) => row.grade),
    ["A", "A", "B"],
  );
  assert.equal(results[0].createdBy.toString(), teacherUser.id);
  assert.equal(
    await ResultRevision.countDocuments({
      schoolId: school._id,
      examinationId: exam._id,
    }),
    3,
  );
  assert.equal(
    (
      await write(
        "put",
        `/${exam._id}/scores`,
        scoreEntries(maths.id),
        teacherAgent,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await write("put", `/${exam._id}`, {
        ...input(),
        revision: (await fetchExam()).revision,
      })
    ).status,
    409,
  );
});

test("score validation blocks maxima, missing components, precision, duplicate rows and invalid references", async () => {
  const one = {
    subjectId: maths.id,
    arm: "A",
    entries: [
      {
        studentId: students[0].id,
        scores: { ca: 30, exam: 50 },
        revision: 1,
        teacherComment: "Consistent effort",
      },
    ],
  };
  for (const scores of [
    { ca: 41, exam: 50 },
    { ca: -1, exam: 50 },
    { ca: 20.001, exam: 50 },
    { ca: 30 },
    { ca: 30, exam: 50, extra: 1 },
  ])
    assert.equal(
      (
        await write("put", `/${exam._id}/scores`, {
          ...one,
          entries: [{ ...one.entries[0], scores }],
        })
      ).status,
      400,
    );
  assert.equal(
    (
      await write("put", `/${exam._id}/scores`, {
        ...one,
        entries: [one.entries[0], one.entries[0]],
      })
    ).status,
    400,
  );
  for (const studentId of [inactiveStudent.id, foreignStudent.id])
    assert.equal(
      (
        await write("put", `/${exam._id}/scores`, {
          ...one,
          entries: [{ ...one.entries[0], studentId, revision: 0 }],
        })
      ).status,
      400,
    );
  assert.equal(
    (await write("put", `/${exam._id}/scores`, { ...one, arm: "Z" })).status,
    400,
  );
  assert.equal(
    (
      await write("put", `/${exam._id}/scores`, {
        ...one,
        schoolId: otherSchool.id,
      })
    ).status,
    400,
  );
  const noOp = await write("put", `/${exam._id}/scores`, one, teacherAgent);
  assert.equal(noOp.status, 200);
  assert.equal(noOp.body.changed, 0);
});

test("teachers submit their subject and cannot edit submitted results; complete cohort is required", async () => {
  assert.equal(
    (
      await write(
        "post",
        `/${exam._id}/submit-subject`,
        { subjectId: maths.id, arm: "A" },
        teacherAgent,
      )
    ).status,
    200,
  );
  const result = await Result.findOne({
    schoolId: school._id,
    examinationId: exam._id,
    studentId: students[0]._id,
    subjectId: maths._id,
  });
  assert.equal(
    (
      await write(
        "put",
        `/${exam._id}/scores`,
        {
          subjectId: maths.id,
          arm: "A",
          reason: "Teacher correction",
          entries: [
            {
              studentId: students[0].id,
              revision: result.revision,
              scores: { ca: 35, exam: 50 },
              teacherComment: "Consistent effort",
            },
          ],
        },
        teacherAgent,
      )
    ).status,
    403,
  );
  assert.equal((await state("submitted")).status, 409);
  assert.equal(
    (await write("put", `/${exam._id}/scores`, scoreEntries(english.id)))
      .status,
    200,
  );
  const otherResult = await Result.findOne({
    schoolId: school._id,
    examinationId: exam._id,
    subjectId: english._id,
  });
  assert.equal(
    (
      await teacherAgent.get(
        `/api/school/examinations/${exam._id}/results/${otherResult.id}/history`,
      )
    ).status,
    403,
  );
});

test("subject averages, overall averages and competition tied positions are correct", async () => {
  const summary = await agent.get(
    `/api/school/examinations/${exam._id}/summary`,
  );
  assert.equal(summary.status, 200);
  assert.equal(summary.body.total, 3);
  assert.deepEqual(
    summary.body.students.map((row) => row.averageHundredths),
    [8000, 8000, 6000],
  );
  assert.deepEqual(
    summary.body.students.map((row) => row.position),
    [1, 1, 3],
  );
  assert.equal(
    summary.body.subjects.every(
      (subject) => subject.averageHundredths === 7333,
    ),
    true,
  );
  assert.equal(
    (
      await write("put", `/${exam._id}/comments/${students[0].id}`, {
        comment: "Excellent term progress",
        reason: "Administrator review",
      })
    ).status,
    200,
  );
});

test("approval and publication follow ordered states and lock score and comment edits", async () => {
  assert.equal((await state("published")).status, 409);
  assert.equal((await state("submitted")).status, 200);
  assert.equal(
    (await write("put", `/${exam._id}/scores`, scoreEntries(english.id)))
      .status,
    409,
  );
  assert.equal((await state("approved")).status, 200);
  assert.equal(
    (
      await write("put", `/${exam._id}/comments/${students[0].id}`, {
        comment: "Locked",
        reason: "Attempted change",
      })
    ).status,
    409,
  );
  assert.equal((await state("published")).status, 200);
  assert.equal(exam.publicationNumber, 1);
  assert.equal(
    await ReportCard.countDocuments({
      schoolId: school._id,
      examinationId: exam._id,
    }),
    3,
  );
});

test("published report cards use real scores, comments, positions and term attendance snapshots", async () => {
  const res = await agent.get(
    `/api/school/examinations/${exam._id}/report-cards/${students[0].id}`,
  );
  assert.equal(res.status, 200);
  const snapshot = res.body.card.snapshot;
  assert.equal(snapshot.studentName, "Alice Test");
  assert.equal(snapshot.overallAverageHundredths, 8000);
  assert.equal(snapshot.position, 1);
  assert.equal(snapshot.cohortCount, 3);
  assert.equal(snapshot.administratorComment, "Excellent term progress");
  assert.equal(
    snapshot.subjects.find((row) => row.subjectId === maths.id).teacherComment,
    "Consistent effort",
  );
  assert.deepEqual(snapshot.attendance, {
    present: 1,
    absent: 1,
    late: 1,
    excused: 1,
    totalRecorded: 4,
    attendancePercentage: 66.67,
  });
  assert.equal(snapshot.dateOfBirth, undefined);
  assert.equal(snapshot.address, undefined);
  assert.equal(
    (
      await teacherAgent.get(
        `/api/school/examinations/${exam._id}/report-cards/${students[0].id}`,
      )
    ).status,
    403,
  );
});

test("authorised reopening and corrections preserve all result revisions and old publications", async () => {
  assert.equal((await state("draft")).status, 400);
  assert.equal((await state("draft", "Verified paper correction")).status, 200);
  const old = await agent.get(
    `/api/school/examinations/${exam._id}/report-cards/${students[0].id}`,
  );
  assert.equal(old.body.currentState, "draft");
  assert.equal(old.body.card.publication, 1);
  const row = await Result.findOne({
    schoolId: school._id,
    examinationId: exam._id,
    studentId: students[0]._id,
    subjectId: maths._id,
  });
  const payload = {
    subjectId: maths.id,
    arm: "A",
    entries: [
      {
        studentId: students[0].id,
        revision: row.revision,
        scores: { ca: 40, exam: 50 },
        teacherComment: "Paper reviewed",
      },
    ],
  };
  assert.equal(
    (await write("put", `/${exam._id}/scores`, payload)).status,
    400,
  );
  assert.equal(
    (
      await write("put", `/${exam._id}/scores`, {
        ...payload,
        reason: "Paper double-checked",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await write("put", `/${exam._id}/scores`, {
        ...payload,
        reason: "Stale browser",
      })
    ).status,
    409,
  );
  for (const value of ["submitted", "approved", "published"])
    assert.equal((await state(value)).status, 200);
  const latest = await agent.get(
    `/api/school/examinations/${exam._id}/report-cards/${students[0].id}`,
  );
  assert.equal(latest.body.card.publication, 2);
  assert.equal(latest.body.card.snapshot.overallAverageHundredths, 8500);
  const first = await agent.get(
    `/api/school/examinations/${exam._id}/report-cards/${students[0].id}?publication=1`,
  );
  assert.equal(first.body.card.snapshot.overallAverageHundredths, 8000);
  assert.equal(
    first.body.card.snapshot.subjects.find(
      (result) => result.subjectId === maths.id,
    ).scores.ca,
    30,
  );
  const history = await agent.get(
    `/api/school/examinations/${exam._id}/results/${row.id}/history`,
  );
  assert.equal(history.status, 200);
  assert.equal(
    history.body.records.some(
      (revision) =>
        revision.event === "score_corrected" &&
        revision.reason === "Paper double-checked",
    ),
    true,
  );
  assert.equal(
    history.body.records.some(
      (revision) =>
        revision.event === "result_draft" &&
        revision.reason === "Verified paper correction",
    ),
    true,
  );
  assert.ok(
    await ExaminationAudit.findOne({
      schoolId: school._id,
      examinationId: exam._id,
      action: "examination_published",
    }),
  );
});

test("grading changes require a separate unused configuration and cannot rewrite historical cards", async () => {
  const clone = await write("post", `/${exam._id}/clone`, {
    name: "Next assessment configuration",
  });
  assert.equal(clone.status, 201);
  cloneId = clone.body.record._id;
  const edit = await write("put", `/${cloneId}`, {
    ...input(),
    name: "Next assessment configuration",
    gradingScale: [
      { minPercent: 90, grade: "A", remark: "High distinction" },
      { minPercent: 0, grade: "B", remark: "New scale" },
    ],
    positionsEnabled: false,
    revision: clone.body.record.revision,
  });
  assert.equal(edit.status, 200);
  const old = await agent.get(
    `/api/school/examinations/${exam._id}/report-cards/${students[0].id}?publication=1`,
  );
  assert.equal(old.body.card.snapshot.overallGrade, "A");
  assert.equal(old.body.card.snapshot.gradingScale[0].minPercent, 70);
  assert.equal((await write("delete", `/${exam._id}`)).status, 405);
});

test("search/filter/pagination, tenant isolation and result/report-card endpoints are scoped", async () => {
  assert.equal(
    (await agent.get("/api/school/examinations?search=.*")).body.total,
    0,
  );
  const first = await agent.get("/api/school/examinations?limit=1"),
    second = await agent.get("/api/school/examinations?limit=1&page=2");
  assert.notEqual(first.body.records[0]._id, second.body.records[0]._id);
  assert.equal(first.body.stats.total, 3);
  const teacherList = await teacherAgent.get("/api/school/examinations");
  assert.equal(
    teacherList.body.records.some((row) => row._id === unrelatedExam.id),
    false,
  );
  assert.equal(
    teacherList.body.records.some((row) => row._id === foreignExam.id),
    false,
  );
  for (const path of [
    `/${foreignExam.id}`,
    `/${foreignExam.id}/summary`,
    `/${foreignExam.id}/audit`,
    `/${foreignExam.id}/sheet?subjectId=${maths.id}&arm=A`,
    `/${foreignExam.id}/report-cards/${foreignStudent.id}`,
  ])
    assert.equal(
      (await agent.get("/api/school/examinations" + path)).status,
      404,
    );
  assert.equal(
    (
      await write("post", `/${foreignExam.id}/state`, {
        state: "draft",
        reason: "Cross school",
        revision: 1,
      })
    ).status,
    404,
  );
  for (const client of [request(app), superAgent]) {
    const status = client === superAgent ? 403 : 401;
    assert.equal((await client.get("/api/school/examinations")).status, status);
    assert.equal((await write("post", "", input(), client)).status, status);
  }
});

test("Milestone 8 teacher dashboard, class-scoped subjects and restricted paginated students", async () => {
  assert.equal((await request(app).get("/api/teacher/dashboard")).status, 401);
  assert.equal((await agent.get("/api/teacher/dashboard")).status, 403);
  const context = await teacherAgent.get("/api/teacher/context");
  assert.equal(context.status, 200);
  assert.deepEqual(
    context.body.classes.map((c) => c._id),
    [schoolClass.id],
  );
  assert.deepEqual(
    context.body.subjects.map((s) => s._id),
    [maths.id],
  );
  assert.equal(context.body.subjects[0].classId, schoolClass.id);
  const dashboard = await teacherAgent.get("/api/teacher/dashboard");
  assert.equal(dashboard.status, 200);
  assert.equal(
    dashboard.body.stats.students,
    await Student.countDocuments({
      schoolId: school._id,
      classId: schoolClass._id,
      status: "active",
    }),
  );
  assert.equal(dashboard.body.stats.classes, 1);
  assert.equal(dashboard.body.stats.subjects, 1);
  const directory = await teacherAgent
    .get("/api/teacher/students")
    .query({ limit: 1 });
  assert.equal(directory.status, 200);
  assert.equal(directory.body.records.length, 1);
  assert.equal(directory.body.total, 4);
  assert.equal(directory.body.records[0].address, undefined);
  assert.equal(directory.body.records[0].dateOfBirth, undefined);
  const search = await teacherAgent
    .get("/api/teacher/students")
    .query({ search: "Alice" });
  assert.equal(search.body.total, 1);
  assert.equal(
    (
      await teacherAgent
        .get("/api/teacher/students")
        .query({ classId: otherClass.id })
    ).status,
    403,
  );
  assert.equal(
    (await teacherAgent.get("/api/teacher/students/" + foreignStudent.id))
      .status,
    404,
  );
  const own = await teacherAgent.get("/api/teacher/students/" + students[0].id);
  assert.equal(own.status, 200);
  assert.equal(own.body.record.address, undefined);
  assert.equal(
    (await teacherAgent.get("/api/teacher/students").query({ search: ".*" }))
      .body.total,
    0,
  );
  assert.equal(
    (await send(teacherAgent, "post", "/api/teacher/students", {})).status,
    404,
  );
});

test("Milestone 8 teachers update only personal phone and mutations require trusted origin", async () => {
  const path = "/api/teacher/profile";
  assert.equal(
    (await teacherAgent.get(path)).body.record.employeeId,
    staff.employeeId,
  );
  assert.equal(
    (
      await send(teacherAgent, "patch", path, {
        phone: "+234 801 111 2222",
        role: "school_admin",
      })
    ).status,
    400,
  );
  assert.equal(
    (await teacherAgent.patch(path).send({ phone: "+234 801 111 2222" }))
      .status,
    403,
  );
  assert.equal(
    (await send(teacherAgent, "patch", path, { phone: "+234 801 111 2222" }))
      .status,
    200,
  );
  assert.equal((await Staff.findById(staff._id)).phone, "+234 801 111 2222");
  assert.equal(
    (await User.findById(teacherUser.id)).phone,
    "+234 801 111 2222",
  );
});

test("Milestone 8 explicit attendance grants, session revocation, corrections and duplicate protection", async () => {
  const placement = {
    sessionId: session.id,
    classId: schoolClass.id,
    arm: "A",
    date: "2026-09-15",
  };
  const path = "/api/teacher/attendance/student";
  assert.equal(
    (await teacherAgent.get(path + "/roster").query(placement)).status,
    403,
  );
  const grantPath = "/api/school/staff/" + staff.id + "/attendance-grants";
  assert.equal(
    (await send(teacherAgent, "put", grantPath, { grants: [] })).status,
    403,
  );
  assert.equal(
    (
      await send(agent, "put", grantPath, {
        grants: [{ classId: otherClass.id, arm: "A" }],
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await send(agent, "put", grantPath, {
        grants: [{ classId: schoolClass.id, arm: "A" }],
      })
    ).status,
    200,
  );
  assert.equal((await teacherAgent.get("/api/teacher/context")).status, 401);
  assert.equal(
    (
      await send(teacherAgent, "post", "/api/auth/teacher-login", {
        email: staff.email,
        password: "Teacher-password-123!",
      })
    ).status,
    200,
  );
  const roster = await teacherAgent.get(path + "/roster").query(placement);
  assert.equal(roster.status, 200);
  assert.equal(
    (await teacherAgent.get(path + "/roster").query({ ...placement, arm: "B" }))
      .status,
    403,
  );
  assert.equal(
    (
      await teacherAgent
        .get("/api/teacher/attendance/staff/roster")
        .query(placement)
    ).status,
    403,
  );
  const entry = { personId: students[0].id, status: "present", revision: 0 };
  assert.equal(
    (await send(teacherAgent, "put", path, { ...placement, entries: [entry] }))
      .status,
    200,
  );
  assert.equal(
    (await send(teacherAgent, "put", path, { ...placement, entries: [entry] }))
      .status,
    409,
  );
  assert.equal(
    await Attendance.countDocuments({
      schoolId: school._id,
      personId: students[0]._id,
      date: new Date(placement.date),
    }),
    1,
  );
  const record = await Attendance.findOne({
    schoolId: school._id,
    personId: students[0]._id,
    date: new Date(placement.date),
  });
  const correction = {
    ...placement,
    entries: [{ ...entry, status: "late", revision: record.revision }],
  };
  assert.equal((await send(teacherAgent, "put", path, correction)).status, 400);
  assert.equal(
    (
      await send(teacherAgent, "put", path, {
        ...correction,
        correctionReason: "Arrival time confirmed",
      })
    ).status,
    200,
  );
  const audit = await teacherAgent.get(
    "/api/teacher/attendance/records/" + record.id + "/audit",
  );
  assert.equal(audit.status, 200);
  assert.equal(audit.body.total, 2);
  assert.equal(audit.body.records[0].reason, "Arrival time confirmed");
  assert.equal(
    (
      await send(teacherAgent, "put", path, {
        ...placement,
        entries: [
          { personId: students[1].id, status: "present", revision: 0 },
          { personId: foreignStudent.id, status: "absent", revision: 0 },
        ],
      })
    ).status,
    400,
  );
  assert.equal(
    await Attendance.countDocuments({
      schoolId: school._id,
      personId: students[1]._id,
      date: new Date(placement.date),
    }),
    0,
  );
  assert.equal(
    (
      await send(teacherAgent, "put", path, {
        ...placement,
        entries: students
          .slice(1)
          .map((s) => ({ personId: s.id, status: "present", revision: 0 })),
      })
    ).status,
    200,
  );
  assert.equal(
    await TeacherAudit.countDocuments({
      schoolId: school._id,
      staffId: staff._id,
      action: "attendance_grants_updated",
    }),
    1,
  );
  assert.equal(
    await TeacherAudit.countDocuments({
      schoolId: school._id,
      staffId: staff._id,
      action: "contact_updated",
    }),
    1,
  );
  const report = await teacherAgent
    .get("/api/teacher/attendance/reports")
    .query({ ...placement, kind: "student" });
  assert.equal(report.status, 200);
  assert.equal(report.body.summary.late, 1);
  assert.equal(
    (
      await teacherAgent
        .get("/api/teacher/attendance/reports")
        .query({ date: placement.date, kind: "student" })
    ).status,
    403,
  );
  assert.equal(
    (await send(agent, "put", grantPath, { grants: [] })).status,
    200,
  );
  await send(teacherAgent, "post", "/api/auth/teacher-login", {
    email: staff.email,
    password: "Teacher-password-123!",
  });
  assert.equal(
    (
      await teacherAgent.get(
        "/api/teacher/attendance/records/" + record.id + "/audit",
      )
    ).status,
    403,
  );
});

test("Milestone 8 inactive staff and suspended schools reject existing teacher sessions", async () => {
  await School.updateOne({ _id: school._id }, { status: "suspended" });
  assert.equal((await teacherAgent.get("/api/teacher/dashboard")).status, 403);
  await School.updateOne({ _id: school._id }, { status: "active" });
  await Staff.updateOne({ _id: staff._id }, { status: "inactive" });
  assert.equal((await teacherAgent.get("/api/teacher/dashboard")).status, 403);
  await Staff.updateOne({ _id: staff._id }, { status: "active" });
});

test("teacher session/assignment revocation and staff deactivation immediately restrict score access", async () => {
  assert.equal(
    (
      await send(agent, "put", `/api/school/staff/${staff.id}`, {
        ...staffPayload(),
        subjectIds: [english.id],
      })
    ).status,
    200,
  );
  assert.equal(
    (await teacherAgent.get("/api/school/examinations")).status,
    401,
  );
  assert.equal(
    (
      await send(teacherAgent, "post", "/api/auth/teacher-login", {
        email: staff.email,
        password: "Teacher-password-123!",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await teacherAgent
        .get(`/api/school/examinations/${exam._id}/sheet`)
        .query({ subjectId: maths.id, arm: "A" })
    ).status,
    403,
  );
  assert.equal(
    (
      await teacherAgent
        .get(`/api/school/examinations/${exam._id}/sheet`)
        .query({ subjectId: english.id, arm: "A" })
    ).status,
    200,
  );
  assert.equal(
    (
      await send(agent, "patch", `/api/school/staff/${staff.id}/status`, {
        status: "inactive",
      })
    ).status,
    200,
  );
  assert.equal(
    (await teacherAgent.get("/api/school/examinations")).status,
    401,
  );
  assert.equal(
    (
      await send(request(app), "post", "/api/auth/teacher-login", {
        email: staff.email,
        password: "Teacher-password-123!",
      })
    ).status,
    403,
  );
  assert.equal((await agent.get("/api/school/finance/reports")).status, 200);
  assert.equal((await superAgent.get("/api/schools")).status, 200);
});
