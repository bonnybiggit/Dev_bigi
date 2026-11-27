import { examAssignmentFilter } from "../services/teacherAccess.js";
import { Router } from "express";
import { z } from "zod";
import { Examination } from "../models/Examination.js";
import {
  Result,
  ResultRevision,
  ExaminationAudit,
  ResultComment,
  ReportCard,
} from "../models/Result.js";
import { Student } from "../models/Student.js";
import { Subject } from "../models/Subject.js";
import { SchoolClass } from "../models/SchoolClass.js";
import { AcademicSession } from "../models/AcademicSession.js";
import { AcademicTerm } from "../models/AcademicTerm.js";
import {
  authenticate,
  requireRoles,
  requirePasswordChanged,
  requireRole,
} from "../middleware/auth.js";
import {
  examId,
  examInput,
  examFilters,
  scoreInput,
  scoreFilters,
} from "../validation/examination.js";
import {
  ownedExam,
  examinationDetails,
  isExamAdmin,
  requireExamArm,
  resultFields,
  saveExamination,
  scoreSheet,
  saveScores,
  submitSubject,
  changeExamState,
  examAudit,
} from "../services/examinations.js";
import { classSummaries } from "../services/resultCalculations.js";
import { mutateConfiguration, fail } from "../services/schoolConfiguration.js";
const admin = requireRole("school_admin");
const paging = z
  .object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(25),
  })
  .strict();
export function examinationRoutes(config) {
  const router = Router();
  router.use(
    authenticate(config),
    requireRoles("school_admin", "teacher"),
    requirePasswordChanged,
  );
  router.use((req, _res, next) => {
    if (req.method !== "GET") z.object({}).strict().parse(req.query);
    next();
  });
  router.get("/context", async (req, res) => {
    z.object({}).strict().parse(req.query);
    const schoolId = req.user.schoolId;
    const [sessions, terms, classes, subjects] = await Promise.all([
      AcademicSession.find({ schoolId }).select("_id name"),
      AcademicTerm.find({ schoolId }).select("_id name sessionId"),
      SchoolClass.find({
        schoolId,
        ...(!isExamAdmin(req)
          ? {
              _id: {
                $in: req.teacherAccess
                  ? req.teacherAccess.rows
                      .filter((r) => r.kind === "teaching")
                      .map((r) => r.classId)
                  : req.teacher.classIds,
              },
            }
          : {}),
      }).select("_id name arms inactiveArms status"),
      Subject.find({
        schoolId,
        ...(!isExamAdmin(req)
          ? {
              _id: {
                $in: req.teacherAccess
                  ? req.teacherAccess.rows
                      .filter((r) => r.kind === "teaching")
                      .map((r) => r.subjectId)
                  : req.teacher.subjectIds,
              },
              classId: {
                $in: req.teacherAccess
                  ? req.teacherAccess.rows.map((r) => r.classId)
                  : req.teacher.classIds,
              },
            }
          : {}),
      }).select("_id name classId status"),
    ]);
    res.json({
      sessions,
      terms,
      classes: req.teacherAccess
        ? classes.map((c) => ({
            ...c.toObject(),
            arms: c.arms.filter((arm) =>
              req.teacherAccess.rows.some(
                (r) =>
                  String(r.classId) === c.id &&
                  r.kind === "teaching" &&
                  r.arm === arm,
              ),
            ),
          }))
        : classes,
      subjects,
      administrator: isExamAdmin(req),
    });
  });
  router.get("/", async (req, res) => {
    const input = examFilters.parse(req.query),
      filter = { schoolId: req.user.schoolId };
    for (const [field, Model] of [
      ["sessionId", AcademicSession],
      ["termId", AcademicTerm],
      ["classId", SchoolClass],
    ])
      if (input[field]) {
        if (
          !(await Model.exists({
            schoolId: req.user.schoolId,
            _id: input[field],
          }))
        )
          fail(404, "Academic filter is unavailable.");
        filter[field] = input[field];
      }
    if (!isExamAdmin(req)) {
      if (
        input.classId &&
        !(
          req.teacherAccess
            ? req.teacherAccess.rows
                .filter((r) => r.kind === "teaching")
                .map((r) => r.classId)
            : req.teacher.classIds
        ).some((id) => String(id) === input.classId)
      )
        fail(403, "Class is not assigned to you.");
      if (req.teacherAccess)
        Object.assign(filter, examAssignmentFilter(req.teacherAccess));
      else {
        filter.classId = input.classId || { $in: req.teacher.classIds };
        filter["subjects.subjectId"] = { $in: req.teacher.subjectIds };
      }
    }
    if (input.status) filter.status = input.status;
    if (input.search)
      filter.name = {
        $regex: input.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        $options: "i",
      };
    const [records, total, groups] = await Promise.all([
      Examination.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((input.page - 1) * input.limit)
        .limit(input.limit),
      Examination.countDocuments(filter),
      Examination.find(filter).select("status").lean(),
    ]);
    const stats = { total, draft: 0, submitted: 0, approved: 0, published: 0 };
    for (const row of groups) stats[row.status]++;
    res.json({
      records: records.map((exam) => examinationDetails(req, exam)),
      total,
      page: input.page,
      limit: input.limit,
      stats,
    });
  });
  router.post("/", admin, async (req, res) =>
    res.status(201).json({
      record: examinationDetails(
        req,
        await saveExamination(req, examInput.parse(req.body)),
      ),
    }),
  );
  router.put("/:id", admin, async (req, res) =>
    res.json({
      record: examinationDetails(
        req,
        await saveExamination(
          req,
          examInput.parse(req.body),
          examId.parse(req.params.id),
        ),
      ),
    }),
  );
  router.get("/:id", async (req, res) => {
    z.object({}).strict().parse(req.query);
    const exam = await ownedExam(req, examId.parse(req.params.id));
    res.json({ record: examinationDetails(req, exam) });
  });
  router.post("/:id/clone", admin, async (req, res) => {
    const { name } = z
      .object({ name: z.string().trim().min(2).max(120) })
      .strict()
      .parse(req.body);
    const source = await ownedExam(req, examId.parse(req.params.id));
    const input = examInput.parse({
      name,
      sessionId: String(source.sessionId),
      termId: String(source.termId),
      classId: String(source.classId),
      subjectIds: source.subjects.map((subject) => String(subject.subjectId)),
      components: source.components.map((item) => item.toObject()),
      totalMarks: source.totalMarks,
      gradingScale: source.gradingScale.map((item) => item.toObject()),
      positionsEnabled: source.positionsEnabled,
    });
    res.status(201).json({
      record: examinationDetails(req, await saveExamination(req, input)),
    });
  });
  router.get("/:id/sheet", async (req, res) => {
    const exam = await ownedExam(req, examId.parse(req.params.id));
    res.json(await scoreSheet(req, exam, scoreFilters.parse(req.query)));
  });
  router.put("/:id/scores", async (req, res) =>
    res.json(
      await saveScores(
        req,
        examId.parse(req.params.id),
        scoreInput.parse(req.body),
      ),
    ),
  );
  router.post("/:id/submit-subject", async (req, res) =>
    res.json(
      await submitSubject(
        req,
        examId.parse(req.params.id),
        z
          .object({
            subjectId: examId,
            arm: z
              .string()
              .trim()
              .max(20)
              .transform((value) => value.toUpperCase())
              .default(""),
          })
          .strict()
          .parse(req.body),
      ),
    ),
  );
  router.post("/:id/state", admin, async (req, res) => {
    const input = z
      .object({
        state: z.enum(["draft", "submitted", "approved", "published"]),
        revision: z.number().int().min(1),
        reason: z.string().trim().max(300).default(""),
      })
      .strict()
      .parse(req.body);
    res.json({
      record: examinationDetails(
        req,
        await changeExamState(req, examId.parse(req.params.id), input),
      ),
    });
  });
  router.get("/:id/summary", admin, async (req, res) => {
    const input = paging.parse(req.query),
      exam = await ownedExam(req, examId.parse(req.params.id));
    const results = await Result.find({
      schoolId: req.user.schoolId,
      examinationId: exam._id,
    })
      .select(resultFields)
      .lean();
    const summary = classSummaries(exam, results);
    const comments = await ResultComment.find({
      schoolId: req.user.schoolId,
      examinationId: exam._id,
    }).lean();
    res.json({
      ...summary,
      students: summary.students
        .slice((input.page - 1) * input.limit, input.page * input.limit)
        .map((row) => ({
          ...row,
          administratorComment:
            comments.find(
              (comment) => String(comment.studentId) === row.studentId,
            )?.comment || "",
        })),
      total: summary.students.length,
      page: input.page,
      limit: input.limit,
    });
  });
  router.put("/:id/comments/:studentId", admin, async (req, res) => {
    const id = examId.parse(req.params.id),
      studentId = examId.parse(req.params.studentId),
      input = z
        .object({
          comment: z.string().trim().max(1000),
          reason: z.string().trim().min(3).max(300),
        })
        .strict()
        .parse(req.body);
    await mutateConfiguration(req.user.schoolId, async (transaction) => {
      const exam = await ownedExam(req, id, transaction);
      if (!["draft", "submitted"].includes(exam.status))
        fail(
          409,
          "Reopen the examination before changing approved/published comments.",
        );
      if (
        !(await Student.exists({
          schoolId: req.user.schoolId,
          _id: studentId,
          sessionId: exam.sessionId,
          classId: exam.classId,
        }).session(transaction))
      )
        fail(404, "Student is unavailable in this examination class.");
      const filter = {
          schoolId: req.user.schoolId,
          examinationId: id,
          studentId,
        },
        previous = await ResultComment.findOne(filter).session(transaction);
      await ResultComment.findOneAndUpdate(
        filter,
        { $set: { comment: input.comment, actorName: req.user.name } },
        { new: true, upsert: true, session: transaction },
      );
      exam.revision++;
      await exam.save({ session: transaction });
      await examAudit(
        req,
        exam,
        "administrator_comment",
        input.reason,
        { studentId, before: previous?.comment || "", after: input.comment },
        transaction,
      );
    });
    res.json({ saved: true });
  });
  router.get("/:id/report-cards/:studentId", admin, async (req, res) => {
    const id = examId.parse(req.params.id),
      studentId = examId.parse(req.params.studentId),
      input = z
        .object({ publication: z.coerce.number().int().min(1).optional() })
        .strict()
        .parse(req.query);
    const exam = await ownedExam(req, id);
    const card = await ReportCard.findOne({
      schoolId: req.user.schoolId,
      examinationId: id,
      studentId,
      ...(input.publication ? { publication: input.publication } : {}),
    })
      .select(resultFields)
      .sort({ publication: -1 });
    if (!card)
      fail(
        404,
        "No published report card exists for this student and examination.",
      );
    const publications = await ReportCard.find({
      schoolId: req.user.schoolId,
      examinationId: id,
      studentId,
    })
      .select("publication createdAt")
      .sort({ publication: -1 });
    res.json({
      card,
      publications,
      currentState: exam.status,
      school: Object.fromEntries(
        ["name", "logoUrl", "address", "city", "country", "phone", "email"].map(
          (key) => [key, req.school[key] || ""],
        ),
      ),
    });
  });
  router.get("/:id/results/:resultId/history", async (req, res) => {
    const input = paging.parse(req.query),
      exam = await ownedExam(req, examId.parse(req.params.id));
    const result = await Result.findOne({
      schoolId: req.user.schoolId,
      examinationId: exam._id,
      _id: examId.parse(req.params.resultId),
    });
    if (!result) fail(404, "Result not found.");
    requireExamArm(req, exam, String(result.subjectId), result.arm);
    const filter = { schoolId: req.user.schoolId, resultId: result._id };
    const [records, total] = await Promise.all([
      ResultRevision.find(filter)
        .select(resultFields)
        .sort({ revision: -1 })
        .skip((input.page - 1) * input.limit)
        .limit(input.limit),
      ResultRevision.countDocuments(filter),
    ]);
    res.json({ records, total, page: input.page, limit: input.limit });
  });
  router.get("/:id/audit", admin, async (req, res) => {
    const input = paging.parse(req.query),
      exam = await ownedExam(req, examId.parse(req.params.id)),
      filter = { schoolId: req.user.schoolId, examinationId: exam._id };
    const [records, total] = await Promise.all([
      ExaminationAudit.find(filter)
        .select(resultFields)
        .sort({ createdAt: -1 })
        .skip((input.page - 1) * input.limit)
        .limit(input.limit),
      ExaminationAudit.countDocuments(filter),
    ]);
    res.json({ records, total, page: input.page, limit: input.limit });
  });
  router.delete("/:id", admin, async (req, res) => {
    z.object({}).strict().parse(req.query);
    await ownedExam(req, examId.parse(req.params.id));
    res.status(405).json({
      message:
        "Examinations and results are retained permanently. Use an audited reopening/correction or a new examination.",
    });
  });
  return router;
}
