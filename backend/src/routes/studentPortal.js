import { Router } from "express";
import { z } from "zod";
import {
  authenticate,
  requireRole,
  requirePasswordChanged,
} from "../middleware/auth.js";
import { Student } from "../models/Student.js";
import { SchoolClass } from "../models/SchoolClass.js";
import { Subject } from "../models/Subject.js";
import { TeacherAssignment } from "../models/TeacherAssignment.js";
import { Staff } from "../models/Staff.js";
import { AcademicSession } from "../models/AcademicSession.js";
import { AcademicTerm } from "../models/AcademicTerm.js";
import { Attendance } from "../models/Attendance.js";
import { Examination } from "../models/Examination.js";
import { ReportCard } from "../models/Result.js";
import { Invoice, Payment } from "../models/Finance.js";
import { summarize } from "../services/attendance.js";
import { objectId } from "../validation/academic.js";
import { fail } from "../services/schoolConfiguration.js";
const filters = z
  .object({
    sessionId: objectId.optional(),
    termId: objectId.optional(),
    page: z.coerce.number().int().min(1).max(100000).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(25),
  })
  .strict();
const own = (req) => ({
  schoolId: req.user.schoolId,
  studentId: req.student._id,
});
const schoolView = (school) => ({
  name: school.name,
  logoUrl: school.logoUrl,
  address: school.address,
  city: school.city,
  country: school.country,
});
async function publishedExams(req, input) {
  return Examination.find({
    schoolId: req.user.schoolId,
    status: "published",
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    ...(input.termId ? { termId: input.termId } : {}),
  })
    .select("_id publicationNumber")
    .lean();
}
async function publishedCards(req, input) {
  const exams = await publishedExams(req, input);
  return ReportCard.find({
    ...own(req),
    $or: exams
      .map((e) => ({ examinationId: e._id, publication: e.publicationNumber }))
      .concat([{ _id: null }]),
  }).sort({ createdAt: -1, _id: -1 });
}
function safeCard(card) {
  const snapshot = { ...card.snapshot };
  delete snapshot.subjectAverages;
  return {
    _id: card._id,
    examinationId: card.examinationId,
    publication: card.publication,
    createdAt: card.createdAt,
    snapshot,
  };
}
export function studentPortalRoutes(config) {
  const router = Router();
  router.use(
    authenticate(config),
    requireRole("student"),
    requirePasswordChanged,
  );
  router.get("/dashboard", async (req, res) => {
    z.object({}).strict().parse(req.query);
    const cards = await publishedCards(req, {});
    const attendance = await Attendance.find({
      schoolId: req.user.schoolId,
      kind: "student",
      personId: req.student._id,
    }).select("status");
    const counts = {};
    for (const row of attendance)
      counts[row.status] = (counts[row.status] || 0) + 1;
    const activeClass = await SchoolClass.exists({
      schoolId: req.user.schoolId,
      _id: req.student.classId,
      status: "active",
      inactiveArms: { $ne: req.student.arm },
    });
    const activeSession = await AcademicSession.exists({
      schoolId: req.user.schoolId,
      _id: req.student.sessionId,
      status: "active",
    });
    const subjects =
      activeClass && activeSession
        ? await Subject.countDocuments({
            schoolId: req.user.schoolId,
            classId: req.student.classId,
            status: "active",
          })
        : 0;
    let fees;
    if (req.school.studentFinanceEnabled) {
      const invoices = await Invoice.find(own(req)).select("balanceMinor");
      fees = {
        balanceMinor: invoices.reduce((sum, i) => sum + i.balanceMinor, 0),
      };
    }
    res.json({
      subjects,
      attendance: summarize(counts),
      publishedResults: cards.length,
      recent: cards.slice(0, 5).map((c) => ({
        _id: c._id,
        name: c.snapshot.examinationName,
        grade: c.snapshot.overallGrade,
        averageHundredths: c.snapshot.overallAverageHundredths,
        createdAt: c.createdAt,
      })),
      ...(fees ? { fees } : {}),
    });
  });
  router.get(["/context", "/profile"], async (req, res) => {
    z.object({}).strict().parse(req.query);
    const schoolId = req.user.schoolId;
    const [student, schoolClass, sessions, terms] = await Promise.all([
      Student.findOne({ _id: req.student._id, schoolId }).select(
        "firstName middleName lastName admissionNumber classId arm sessionId admissionDate status",
      ),
      SchoolClass.findOne({ _id: req.student.classId, schoolId }).select(
        "name status arms inactiveArms",
      ),
      AcademicSession.find({ schoolId }).select("name status"),
      AcademicTerm.find({ schoolId }).select("name sessionId status"),
    ]);
    res.json({
      student,
      school: schoolView(req.school),
      schoolClass,
      sessions,
      terms,
      financeEnabled: req.school.studentFinanceEnabled === true,
    });
  });
  router.get("/subjects", async (req, res) => {
    z.object({}).strict().parse(req.query);
    const schoolId = req.user.schoolId;
    const active = await SchoolClass.exists({
      schoolId,
      _id: req.student.classId,
      status: "active",
      inactiveArms: { $ne: req.student.arm },
    });
    const session = await AcademicSession.exists({
      schoolId,
      _id: req.student.sessionId,
      status: "active",
    });
    const subjects =
      active && session
        ? await Subject.find({
            schoolId,
            classId: req.student.classId,
            status: "active",
          }).select("name code description")
        : [];
    const teachers = await Staff.find({
      schoolId,
      category: "teaching",
      status: "active",
      assignmentMode: { $ne: "explicit" },
      classIds: req.student.classId,
      subjectIds: { $in: subjects.map((s) => s._id) },
    }).select("fullName subjectIds");
    const currentTerms = await AcademicTerm.find({
      schoolId,
      sessionId: req.student.sessionId,
      status: "active",
    }).select("_id");
    const explicitRows = await TeacherAssignment.find({
      schoolId,
      sessionId: req.student.sessionId,
      classId: req.student.classId,
      arm: req.student.arm,
      kind: "teaching",
      status: "active",
      subjectId: { $in: subjects.map((s) => s._id) },
      $or: [
        { termId: null },
        { termId: { $in: currentTerms.map((t) => t._id) } },
      ],
    }).select("staffId subjectId");
    const explicitTeachers = await Staff.find({
      schoolId,
      _id: { $in: explicitRows.map((r) => r.staffId) },
      category: "teaching",
      status: "active",
      assignmentMode: "explicit",
    }).select("fullName");
    res.json({
      records: subjects.map((s) => ({
        ...s.toObject(),
        teachers: [
          ...new Set([
            ...teachers
              .filter((t) => t.subjectIds.some((id) => String(id) === s.id))
              .map((t) => t.fullName),
            ...explicitTeachers
              .filter((t) =>
                explicitRows.some(
                  (r) =>
                    String(r.staffId) === t.id && String(r.subjectId) === s.id,
                ),
              )
              .map((t) => t.fullName),
          ]),
        ],
      })),
    });
  });
  router.get("/attendance", async (req, res) => {
    const input = filters.parse(req.query);
    const filter = {
      schoolId: req.user.schoolId,
      kind: "student",
      personId: req.student._id,
    };
    if (input.sessionId) filter.sessionId = input.sessionId;
    if (input.termId) {
      const term = await AcademicTerm.findOne({
        _id: input.termId,
        schoolId: req.user.schoolId,
        ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      });
      if (!term) fail(404, "Academic term not found.");
      filter.sessionId = term.sessionId;
      filter.date = { $gte: term.startDate, $lte: term.endDate };
    }
    const all = await Attendance.find(filter)
      .select("date status sessionId")
      .sort({ date: -1, _id: -1 })
      .lean();
    const counts = {},
      months = new Map();
    for (const row of all) {
      counts[row.status] = (counts[row.status] || 0) + 1;
      const month = row.date.toISOString().slice(0, 7);
      const group = months.get(month) || {};
      group[row.status] = (group[row.status] || 0) + 1;
      months.set(month, group);
    }
    res.json({
      records: all.slice(
        (input.page - 1) * input.limit,
        input.page * input.limit,
      ),
      total: all.length,
      page: input.page,
      limit: input.limit,
      summary: summarize(counts),
      monthly: [...months].map(([month, values]) => ({
        month,
        ...summarize(values),
      })),
    });
  });
  router.get("/report-cards", async (req, res) => {
    const input = filters.parse(req.query),
      cards = await publishedCards(req, input);
    res.json({
      records: cards
        .slice((input.page - 1) * input.limit, input.page * input.limit)
        .map((c) => ({
          _id: c._id,
          examinationId: c.examinationId,
          examinationName: c.snapshot.examinationName,
          sessionName: c.snapshot.sessionName,
          termName: c.snapshot.termName,
          averageHundredths: c.snapshot.overallAverageHundredths,
          grade: c.snapshot.overallGrade,
          createdAt: c.createdAt,
        })),
      total: cards.length,
      page: input.page,
      limit: input.limit,
    });
  });
  router.get("/report-cards/:id", async (req, res) => {
    z.object({}).strict().parse(req.query);
    const card = await ReportCard.findOne({
      ...own(req),
      _id: objectId.parse(req.params.id),
    });
    if (
      !card ||
      !(await Examination.exists({
        _id: card.examinationId,
        schoolId: req.user.schoolId,
        status: "published",
        publicationNumber: card.publication,
      }))
    )
      fail(404, "Published report card not found.");
    res.json({
      card: safeCard(card),
      publications: [
        { publication: card.publication, createdAt: card.createdAt },
      ],
      currentState: "published",
      school: schoolView(req.school),
    });
  });
  router.use("/fees", (req, _res, next) => {
    if (!req.school.studentFinanceEnabled)
      fail(403, "Your school has not enabled student fee visibility.");
    next();
  });
  router.get("/fees", async (req, res) => {
    const input = filters.parse(req.query);
    const filter = {
      ...own(req),
      ...(input.sessionId ? { sessionId: input.sessionId } : {}),
      ...(input.termId ? { termId: input.termId } : {}),
    };
    const invoices = await Invoice.find(filter)
      .select(
        "reference sessionName termName currency billedMinor discountMinor adjustmentMinor paidMinor balanceMinor",
      )
      .sort({ createdAt: -1 });
    const payments = await Payment.find({
      ...own(req),
      invoiceId: { $in: invoices.map((i) => i._id) },
    })
      .select("reference invoiceId amountMinor paidOn methodName status")
      .sort({ paidOn: -1 });
    const summary = invoices.reduce(
      (a, i) => ({
        billedMinor: a.billedMinor + i.billedMinor,
        paidMinor: a.paidMinor + i.paidMinor,
        balanceMinor: a.balanceMinor + i.balanceMinor,
      }),
      { billedMinor: 0, paidMinor: 0, balanceMinor: 0 },
    );
    res.json({
      records: invoices
        .slice((input.page - 1) * input.limit, input.page * input.limit)
        .map((i) => ({
          ...i.toObject(),
          status:
            i.balanceMinor === 0
              ? "paid"
              : i.paidMinor > 0
                ? "part_paid"
                : "unpaid",
        })),
      payments,
      summary,
      total: invoices.length,
      page: input.page,
      limit: input.limit,
    });
  });
  router.get("/fees/receipts/:id", async (req, res) => {
    z.object({}).strict().parse(req.query);
    const payment = await Payment.findOne({
      ...own(req),
      _id: objectId.parse(req.params.id),
      status: "posted",
    }).select(
      "reference invoiceReference amountMinor balanceAfterMinor paidOn methodName status studentName admissionNumber periodLabel className",
    );
    if (!payment) fail(404, "Receipt not found.");
    res.json({ payment, school: schoolView(req.school) });
  });
  return router;
}
