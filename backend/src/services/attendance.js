import mongoose from "mongoose";
import { Attendance } from "../models/Attendance.js";
import { AttendanceAudit } from "../models/AttendanceAudit.js";
import { Student } from "../models/Student.js";
import { Staff } from "../models/Staff.js";
import { AcademicSession } from "../models/AcademicSession.js";
import { SchoolClass } from "../models/SchoolClass.js";
import { mutateConfiguration, fail } from "./schoolConfiguration.js";
import { attendanceToday } from "../validation/attendance.js";
const Model = (kind) => (kind === "student" ? Student : Staff);
const personName = (kind, person) =>
  kind === "student"
    ? [person.firstName, person.middleName, person.lastName]
        .filter(Boolean)
        .join(" ")
    : person.fullName;
const identifier = (kind, person) =>
  kind === "student" ? person.admissionNumber : person.employeeId;
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const personFields =
  "firstName middleName lastName fullName admissionNumber employeeId category status admissionDate employmentDate sessionId classId arm";
export const attendanceFields = "-schoolId -__v";
const placeFilter = (kind, input) =>
  kind === "student"
    ? { sessionId: input.sessionId, classId: input.classId, arm: input.arm }
    : {};
async function placement(schoolId, input, transaction = null) {
  const session = await AcademicSession.findOne({
    _id: input.sessionId,
    schoolId,
  }).session(transaction);
  const schoolClass = await SchoolClass.findOne({
    _id: input.classId,
    schoolId,
  }).session(transaction);
  if (!session || !schoolClass)
    fail(400, "Session or class is unavailable in your school.");
  const validArm = schoolClass.arms.length
    ? schoolClass.arms.includes(input.arm)
    : !input.arm;
  if (!validArm)
    fail(
      400,
      "Select an arm belonging to this class, or leave blank for a class without arms.",
    );
  return {
    session,
    schoolClass,
    active:
      session.status === "active" &&
      schoolClass.status === "active" &&
      !schoolClass.inactiveArms.includes(input.arm),
  };
}
function eligible(kind, person, input) {
  return (
    person.status === "active" &&
    (kind === "student"
      ? person.admissionDate <= new Date(input.date) &&
        String(person.sessionId) === String(input.sessionId) &&
        String(person.classId) === String(input.classId) &&
        person.arm === input.arm
      : person.employmentDate <= new Date(input.date))
  );
}
export const summarize = (counts) => {
  const result = { present: 0, absent: 0, late: 0, excused: 0, ...counts };
  result.totalRecorded =
    result.present + result.absent + result.late + result.excused;
  const denominator = result.present + result.absent + result.late;
  result.attendancePercentage = denominator
    ? Math.round(((result.present + result.late) / denominator) * 10000) / 100
    : null;
  return result;
};
export async function attendanceRoster(schoolId, kind, input) {
  const context = kind === "student" ? await placement(schoolId, input) : null;
  if (
    context &&
    (new Date(input.date) < context.session.startDate ||
      new Date(input.date) > context.session.endDate)
  )
    fail(400, "Attendance date must be within the academic session.");
  const records = await Attendance.find({
    schoolId,
    kind,
    date: new Date(input.date),
    ...placeFilter(kind, input),
  })
    .select(attendanceFields)
    .lean();
  const current = {
    status: "active",
    ...(kind === "student"
      ? {
          ...placeFilter(kind, input),
          admissionDate: { $lte: new Date(input.date) },
        }
      : { employmentDate: { $lte: new Date(input.date) } }),
  };
  const people = await Model(kind)
    .find({
      schoolId,
      $or: [
        current,
        { _id: { $in: records.map((record) => record.personId) } },
      ],
    })
    .select(personFields)
    .lean();
  const byId = new Map(
    records.map((record) => [String(record.personId), record]),
  );
  let rows = people.map((person) => {
    const attendance = byId.get(String(person._id)) || null;
    return {
      personId: person._id,
      personName: personName(kind, person),
      identifier: identifier(kind, person),
      category: person.category || "",
      markable: attendance
        ? person.status === "active"
        : eligible(kind, person, input) && (!context || context.active),
      attendance,
    };
  });
  if (kind === "staff" && input.category)
    rows = rows.filter((row) => row.category === input.category);
  const summaryRows = rows;
  const counts = {};
  for (const row of summaryRows)
    if (row.attendance)
      counts[row.attendance.status] = (counts[row.attendance.status] || 0) + 1;
  const summary = {
    ...summarize(counts),
    expected: summaryRows.length,
    unmarked: summaryRows.filter((row) => !row.attendance).length,
  };
  if (input.search) {
    const search = input.search.toLowerCase();
    rows = rows.filter((row) =>
      `${row.personName} ${row.identifier}`.toLowerCase().includes(search),
    );
  }
  rows.sort(
    (a, b) =>
      a.personName.localeCompare(b.personName) ||
      String(a.personId).localeCompare(String(b.personId)),
  );
  return {
    records: rows.slice(
      (input.page - 1) * input.limit,
      input.page * input.limit,
    ),
    total: rows.length,
    page: input.page,
    limit: input.limit,
    summary,
    contextActive: !context || context.active,
  };
}
export function markAttendance(schoolId, actor, kind, input) {
  return mutateConfiguration(schoolId, async (transaction) => {
    const context =
      kind === "student" ? await placement(schoolId, input, transaction) : null;
    const records = [];
    for (const entry of input.entries) {
      const person = await Model(kind)
        .findOne({ _id: entry.personId, schoolId })
        .select(personFields)
        .session(transaction);
      if (!person) fail(400, "A person is unavailable in your school.");
      let record = await Attendance.findOne({
        schoolId,
        kind,
        personId: entry.personId,
        date: new Date(input.date),
      }).session(transaction);
      if (
        person.status !== "active" ||
        (!record && !eligible(kind, person, input))
      )
        fail(
          400,
          "Attendance requires an active person, a date on/after admission or employment, and matching student placement.",
        );
      if (
        (context && new Date(input.date) < context.session.startDate) ||
        (context && new Date(input.date) > context.session.endDate)
      )
        fail(400, "Attendance date must be within the academic session.");
      if (
        record &&
        kind === "student" &&
        (String(record.sessionId) !== input.sessionId ||
          String(record.classId) !== input.classId ||
          record.arm !== input.arm)
      )
        fail(
          409,
          "Attendance already exists in another placement for this person and date.",
        );
      if (record ? entry.revision !== record.revision : entry.revision !== 0)
        fail(
          409,
          "Attendance changed or already exists. Reload before saving or correcting it.",
        );
      if (context && !context.active && !record)
        fail(
          400,
          "Activate the academic session, class and arm before marking new attendance.",
        );
      if (record?.status === entry.status) {
        records.push({ id: record.id, revision: record.revision });
        continue;
      }
      if (record && input.correctionReason.length < 3)
        fail(400, "A correction reason of at least 3 characters is required.");
      const previousStatus = record?.status || null;
      if (record) {
        record.status = entry.status;
        record.revision += 1;
        record.updatedBy = actor._id;
        record.updatedByName = actor.name;
        await record.save({ session: transaction });
      } else
        record = (
          await Attendance.create(
            [
              {
                schoolId,
                kind,
                personId: entry.personId,
                date: input.date,
                ...placeFilter(kind, input),
                personName: personName(kind, person),
                identifier: identifier(kind, person),
                category: person.category || "",
                sessionName: context?.session.name || "",
                className: context?.schoolClass.name || "",
                status: entry.status,
                createdBy: actor._id,
                updatedBy: actor._id,
                createdByName: actor.name,
                updatedByName: actor.name,
              },
            ],
            { session: transaction },
          )
        )[0];
      await AttendanceAudit.create(
        [
          {
            schoolId,
            attendanceId: record._id,
            previousStatus,
            status: entry.status,
            actorId: actor._id,
            actorName: actor.name,
            reason: previousStatus ? input.correctionReason : "",
            revision: record.revision,
          },
        ],
        { session: transaction },
      );
      records.push({ id: record.id, revision: record.revision });
    }
    return { saved: records.length };
  });
}
export function reportRange(input) {
  let from = input.from,
    to = input.to;
  if (input.period !== "custom") {
    const date = new Date(input.date);
    if (input.period === "daily") from = to = input.date;
    if (input.period === "weekly") {
      const start = new Date(date);
      start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 6);
      from = start.toISOString().slice(0, 10);
      to = end.toISOString().slice(0, 10);
    }
    if (input.period === "monthly") {
      from = `${input.date.slice(0, 7)}-01`;
      to = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0))
        .toISOString()
        .slice(0, 10);
    }
    if (to > attendanceToday()) to = attendanceToday();
  }
  if (from > to || (new Date(to) - new Date(from)) / 86400000 > 366)
    fail(400, "Choose an ordered report range of at most 367 days.");
  return { from, to };
}
export async function attendanceReport(schoolId, input) {
  const { from, to } = reportRange(input);
  const filter = {
    schoolId,
    kind: input.kind,
    date: { $gte: new Date(from), $lte: new Date(to) },
  };
  for (const [field, Target] of [
    ["sessionId", AcademicSession],
    ["classId", SchoolClass],
    ["personId", Model(input.kind)],
  ]) {
    if (input[field]) {
      if (!(await Target.exists({ _id: input[field], schoolId })))
        fail(404, "Report reference is unavailable in your school.");
      filter[field] = new mongoose.Types.ObjectId(input[field]);
    }
  }
  if (input.arm) {
    if (!input.classId) fail(400, "Choose a class for an arm report.");
    const schoolClass = await SchoolClass.findOne({
      _id: input.classId,
      schoolId,
    });
    if (!schoolClass.arms.includes(input.arm))
      fail(400, "Arm does not belong to the selected class.");
    filter.arm = input.arm;
  }
  for (const field of ["status", "category"])
    if (input[field]) filter[field] = input[field];
  if (input.search)
    filter.$or = ["personName", "identifier"].map((field) => ({
      [field]: { $regex: escape(input.search), $options: "i" },
    }));
  const [records, total, grouped] = await Promise.all([
    Attendance.find(filter)
      .select(attendanceFields)
      .sort({ date: -1, personName: 1, _id: 1 })
      .skip((input.page - 1) * input.limit)
      .limit(input.limit),
    Attendance.countDocuments(filter),
    Attendance.aggregate([
      { $match: filter },
      {
        $group: {
          _id: { date: "$date", status: "$status" },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.date": 1 } },
    ]),
  ]);
  const counts = {},
    daily = new Map();
  for (const row of grouped) {
    counts[row._id.status] = (counts[row._id.status] || 0) + row.count;
    const key = row._id.date.toISOString().slice(0, 10);
    const group = daily.get(key) || {};
    group[row._id.status] = row.count;
    daily.set(key, group);
  }
  return {
    records,
    total,
    page: input.page,
    limit: input.limit,
    range: { from, to },
    summary: summarize(counts),
    daily: [...daily].map(([date, values]) => ({ date, ...summarize(values) })),
  };
}
