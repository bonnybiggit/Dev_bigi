import {
  teacherAccess,
  examAssignmentRows,
  examAssignmentFilter,
} from "./teacherAccess.js";
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
import { Attendance } from "../models/Attendance.js";
import { Staff } from "../models/Staff.js";
import { User } from "../models/User.js";
import { summarize } from "./attendance.js";
import { calculateResult, classSummaries } from "./resultCalculations.js";
import { mutateConfiguration, fail } from "./schoolConfiguration.js";
export const resultFields = "-schoolId -__v";
export const isExamAdmin = (req) => req.user.role === "school_admin";
const studentName = (student) =>
  [student.firstName, student.middleName, student.lastName]
    .filter(Boolean)
    .join(" ");
export async function ownedExam(req, id, transaction = null) {
  if (!isExamAdmin(req) && transaction) {
    const account = await User.findOne({
      _id: req.user._id,
      schoolId: req.user.schoolId,
      role: "teacher",
      isActive: true,
    })
      .select("+sessionVersion")
      .session(transaction);
    const staff = await Staff.findOne({
      _id: req.user.staffId,
      schoolId: req.user.schoolId,
      category: "teaching",
      status: "active",
    }).session(transaction);
    if (
      !account ||
      !staff ||
      account.sessionVersion !== req.user.sessionVersion
    )
      fail(403, "Teacher access changed. Sign in again.");
    req.teacher = staff;
    req.teacherAccess = await teacherAccess(
      staff,
      req.user.schoolId,
      transaction,
    );
  }
  const exam = await Examination.findOne({
    schoolId: req.user.schoolId,
    _id: id,
    ...(!isExamAdmin(req)
      ? req.teacherAccess
        ? examAssignmentFilter(req.teacherAccess)
        : { classId: { $in: req.teacher.classIds } }
      : {}),
  }).session(transaction);
  if (
    !exam ||
    (!isExamAdmin(req) &&
      !req.teacherAccess &&
      !exam.subjects.some((subject) =>
        req.teacher.subjectIds.some(
          (id) => String(id) === String(subject.subjectId),
        ),
      ))
  )
    fail(404, "Examination not found.");
  return exam;
}
export function requireExamSubject(req, exam, subjectId) {
  if (!exam.subjects.some((subject) => String(subject.subjectId) === subjectId))
    fail(400, "Subject is not configured for this examination.");
  if (
    !isExamAdmin(req) &&
    (req.teacherAccess
      ? !examAssignmentRows(req.teacherAccess, exam, subjectId).length
      : !req.teacher.subjectIds.some((id) => String(id) === subjectId))
  )
    fail(403, "You are not assigned to this subject.");
}
export function requireExamArm(req, exam, subjectId, arm) {
  requireExamSubject(req, exam, subjectId);
  if (
    !isExamAdmin(req) &&
    req.teacherAccess &&
    !examAssignmentRows(req.teacherAccess, exam, subjectId, arm).length
  )
    fail(
      403,
      "This subject, class arm and academic period are not assigned to you.",
    );
}
export function examinationDetails(req, exam) {
  const record = exam.toObject();
  delete record.schoolId;
  delete record.__v;
  record.cohortCount = record.cohortIds.length;
  delete record.cohortIds;
  if (!isExamAdmin(req) && req.teacherAccess) {
    record.authorisedArmsBySubject = Object.fromEntries(
      record.subjects.map((s) => [
        String(s.subjectId),
        [
          ...new Set(
            examAssignmentRows(
              req.teacherAccess,
              exam,
              String(s.subjectId),
            ).map((r) => r.arm),
          ),
        ],
      ]),
    );
  }
  if (!isExamAdmin(req))
    record.subjects = record.subjects.filter((subject) =>
      req.teacherAccess
        ? examAssignmentRows(req.teacherAccess, exam, String(subject.subjectId))
            .length > 0
        : req.teacher.subjectIds.some(
            (id) => String(id) === String(subject.subjectId),
          ),
    );
  return record;
}
export async function examAudit(
  req,
  exam,
  action,
  reason,
  details,
  transaction,
) {
  await ExaminationAudit.create(
    [
      {
        schoolId: req.user.schoolId,
        examinationId: exam._id,
        actorId: req.user._id,
        actorName: req.user.name,
        action,
        reason,
        details,
      },
    ],
    { session: transaction },
  );
}
export async function resultRevision(req, result, event, reason, transaction) {
  const snapshot = result.toObject();
  delete snapshot.schoolId;
  delete snapshot.__v;
  await ResultRevision.create(
    [
      {
        schoolId: req.user.schoolId,
        examinationId: result.examinationId,
        resultId: result._id,
        revision: result.revision,
        actorId: req.user._id,
        actorName: req.user.name,
        event,
        reason,
        snapshot,
      },
    ],
    { session: transaction },
  );
}
export function saveExamination(req, input, id) {
  return mutateConfiguration(req.user.schoolId, async (transaction) => {
    const schoolId = req.user.schoolId,
      existing = id ? await ownedExam(req, id, transaction) : null;
    if (
      existing &&
      (existing.status !== "draft" ||
        input.revision !== existing.revision ||
        (await Result.exists({ schoolId, examinationId: existing._id }).session(
          transaction,
        )))
    )
      fail(
        409,
        "Used or locked examination configurations cannot be edited. Duplicate the configuration for a new examination instead.",
      );
    const session = await AcademicSession.findOne({
      schoolId,
      _id: input.sessionId,
    }).session(transaction);
    const term = await AcademicTerm.findOne({
      schoolId,
      _id: input.termId,
      sessionId: input.sessionId,
    }).session(transaction);
    const schoolClass = await SchoolClass.findOne({
      schoolId,
      _id: input.classId,
      status: "active",
    }).session(transaction);
    const subjects = await Subject.find({
      schoolId,
      _id: { $in: input.subjectIds },
      classId: input.classId,
      status: "active",
    }).session(transaction);
    if (
      !session ||
      !term ||
      !schoolClass ||
      subjects.length !== input.subjectIds.length
    )
      fail(
        400,
        "Select a valid school session, its term, an active class and active subjects belonging to that class.",
      );
    const duplicate = {
      schoolId,
      sessionId: input.sessionId,
      termId: input.termId,
      classId: input.classId,
      name: input.name,
      ...(id ? { _id: { $ne: id } } : {}),
    };
    if (
      await Examination.exists(duplicate)
        .collation({ locale: "en", strength: 2 })
        .session(transaction)
    )
      fail(
        409,
        "An examination with this name already exists for this period and class.",
      );
    const values = {
      name: input.name,
      sessionId: session._id,
      termId: term._id,
      classId: schoolClass._id,
      sessionName: session.name,
      termName: term.name,
      className: schoolClass.name,
      termStartDate: term.startDate,
      termEndDate: term.endDate,
      subjects: input.subjectIds.map((id) => ({
        subjectId: id,
        name: subjects.find((subject) => subject.id === id).name,
      })),
      components: input.components,
      totalMarks: input.totalMarks,
      gradingScale: [...input.gradingScale].sort(
        (a, b) => b.minPercent - a.minPercent,
      ),
      positionsEnabled: input.positionsEnabled,
    };
    const before = existing?.toObject() || null;
    const exam = existing
      ? await existing
          .set({
            ...values,
            revision: existing.revision + 1,
            configRevision: existing.configRevision + 1,
          })
          .save({ session: transaction })
      : (
          await Examination.create([{ schoolId, ...values }], {
            session: transaction,
          })
        )[0];
    await examAudit(
      req,
      exam,
      existing ? "configuration_updated" : "examination_created",
      "",
      { before, configuration: values },
      transaction,
    );
    return exam;
  });
}
async function validateArm(schoolId, exam, arm, transaction = null) {
  const schoolClass = await SchoolClass.findOne({
    schoolId,
    _id: exam.classId,
  }).session(transaction);
  if (
    !schoolClass ||
    (schoolClass.arms.length ? !schoolClass.arms.includes(arm) : !!arm)
  )
    fail(400, "Choose an arm belonging to the examination class.");
  return schoolClass;
}
export async function scoreSheet(req, exam, input) {
  requireExamArm(req, exam, input.subjectId, input.arm);
  await validateArm(req.user.schoolId, exam, input.arm);
  const results = await Result.find({
    schoolId: req.user.schoolId,
    examinationId: exam._id,
    subjectId: input.subjectId,
    arm: input.arm,
  })
    .select(resultFields)
    .lean();
  const people = await Student.find({
    schoolId: req.user.schoolId,
    $or: [
      {
        sessionId: exam.sessionId,
        classId: exam.classId,
        arm: input.arm,
        status: "active",
      },
      { _id: { $in: results.map((result) => result.studentId) } },
    ],
  })
    .select(
      "_id firstName middleName lastName admissionNumber status sessionId classId arm",
    )
    .lean();
  const lookup = new Map(
    results.map((result) => [String(result.studentId), result]),
  );
  let rows = people.map((person) => ({
    studentId: person._id,
    studentName: studentName(person),
    admissionNumber: person.admissionNumber,
    result: lookup.get(String(person._id)) || null,
    editable:
      exam.status === "draft" &&
      person.status === "active" &&
      String(person.sessionId) === String(exam.sessionId) &&
      String(person.classId) === String(exam.classId) &&
      person.arm === input.arm &&
      (isExamAdmin(req) ||
        !lookup.get(String(person._id)) ||
        lookup.get(String(person._id)).status === "draft"),
  }));
  if (input.search) {
    const value = input.search.toLowerCase();
    rows = rows.filter((row) =>
      `${row.studentName} ${row.admissionNumber}`.toLowerCase().includes(value),
    );
  }
  rows.sort((a, b) => a.studentName.localeCompare(b.studentName));
  return {
    records: rows.slice(
      (input.page - 1) * input.limit,
      input.page * input.limit,
    ),
    total: rows.length,
    page: input.page,
    limit: input.limit,
  };
}
export function saveScores(req, id, input) {
  return mutateConfiguration(req.user.schoolId, async (transaction) => {
    const exam = await ownedExam(req, id, transaction);
    requireExamArm(req, exam, input.subjectId, input.arm);
    if (exam.status !== "draft")
      fail(
        409,
        "Scores are locked. An administrator must reopen the examination with a reason before corrections.",
      );
    const schoolClass = await validateArm(
      req.user.schoolId,
      exam,
      input.arm,
      transaction,
    );
    let changed = 0;
    for (const entry of input.entries) {
      const student = await Student.findOne({
        _id: entry.studentId,
        schoolId: req.user.schoolId,
        status: "active",
        sessionId: exam.sessionId,
        classId: exam.classId,
        arm: input.arm,
      }).session(transaction);
      if (!student)
        fail(
          400,
          "Student must be active and assigned to this session, class and arm.",
        );
      const keys = Object.keys(entry.scores);
      if (
        keys.length !== exam.components.length ||
        exam.components.some(
          (component) =>
            !(component.key in entry.scores) ||
            entry.scores[component.key] > component.maxMarks,
        )
      )
        fail(
          400,
          "Provide exactly the configured components, with every score within its maximum.",
        );
      let result = await Result.findOne({
        schoolId: req.user.schoolId,
        examinationId: id,
        studentId: entry.studentId,
        subjectId: input.subjectId,
      }).session(transaction);
      if (result && result.arm !== input.arm)
        fail(
          409,
          "A result already exists under another arm. Historical placement cannot be reassigned.",
        );
      if (result ? result.revision !== entry.revision : entry.revision !== 0)
        fail(
          409,
          "A result already exists or changed. Reload the score sheet before retrying.",
        );
      if (!isExamAdmin(req) && result && result.status !== "draft")
        fail(
          403,
          "Submitted results cannot be changed by a teacher until an administrator reopens them.",
        );
      if (
        !result &&
        (schoolClass.status !== "active" ||
          schoolClass.inactiveArms.includes(input.arm))
      )
        fail(400, "New results require an active class and arm.");
      if (
        result &&
        exam.components.every(
          (component) =>
            result.scores[component.key] === entry.scores[component.key],
        ) &&
        result.teacherComment === entry.teacherComment
      )
        continue;
      if (result && input.reason.length < 3)
        fail(
          400,
          "Score/comment corrections require a reason of at least 3 characters.",
        );
      const values = {
        scores: entry.scores,
        ...calculateResult(exam, entry.scores),
        teacherComment: entry.teacherComment,
        updatedBy: req.user._id,
        updatedByName: req.user.name,
        status: "draft",
      };
      const editing = !!result;
      if (result)
        result = await result
          .set({ ...values, revision: result.revision + 1 })
          .save({ session: transaction });
      else
        result = (
          await Result.create(
            [
              {
                schoolId: req.user.schoolId,
                examinationId: exam._id,
                studentId: student._id,
                subjectId: input.subjectId,
                studentName: studentName(student),
                admissionNumber: student.admissionNumber,
                arm: input.arm,
                subjectName: exam.subjects.find(
                  (subject) => String(subject.subjectId) === input.subjectId,
                ).name,
                createdBy: req.user._id,
                createdByName: req.user.name,
                ...values,
              },
            ],
            { session: transaction },
          )
        )[0];
      await resultRevision(
        req,
        result,
        editing ? "score_corrected" : "score_created",
        input.reason,
        transaction,
      );
      changed++;
    }
    if (changed) {
      exam.revision++;
      await exam.save({ session: transaction });
      await examAudit(
        req,
        exam,
        "scores_saved",
        input.reason,
        { subjectId: input.subjectId, arm: input.arm, changed },
        transaction,
      );
    }
    return { changed };
  });
}
async function transitionResult(req, result, state, reason, transaction) {
  if (result.status === state) return;
  result.status = state;
  result.revision++;
  result.updatedBy = req.user._id;
  result.updatedByName = req.user.name;
  await result.save({ session: transaction });
  await resultRevision(req, result, `result_${state}`, reason, transaction);
}
export function submitSubject(req, id, input) {
  return mutateConfiguration(req.user.schoolId, async (transaction) => {
    const exam = await ownedExam(req, id, transaction);
    requireExamArm(req, exam, input.subjectId, input.arm);
    await validateArm(req.user.schoolId, exam, input.arm, transaction);
    if (exam.status !== "draft")
      fail(409, "The examination is no longer accepting subject submissions.");
    const students = await Student.find({
      schoolId: req.user.schoolId,
      sessionId: exam.sessionId,
      classId: exam.classId,
      arm: input.arm,
      status: "active",
    })
      .select("_id")
      .session(transaction);
    const results = await Result.find({
      schoolId: req.user.schoolId,
      examinationId: id,
      subjectId: input.subjectId,
      arm: input.arm,
    }).session(transaction);
    if (
      !students.length ||
      students.some(
        (student) =>
          !results.some((result) => String(result.studentId) === student.id),
      )
    )
      fail(
        409,
        "Complete this subject for every active student in the selected arm before submitting.",
      );
    for (const result of results)
      await transitionResult(req, result, "submitted", "", transaction);
    exam.revision++;
    await exam.save({ session: transaction });
    await examAudit(
      req,
      exam,
      "subject_submitted",
      "",
      { subjectId: input.subjectId, arm: input.arm },
      transaction,
    );
    return { submitted: results.length };
  });
}
export function changeExamState(req, id, input) {
  return mutateConfiguration(req.user.schoolId, async (transaction) => {
    const exam = await ownedExam(req, id, transaction);
    if (input.revision !== exam.revision)
      fail(409, "Examination changed. Reload before changing its state.");
    const results = await Result.find({
      schoolId: req.user.schoolId,
      examinationId: id,
    }).session(transaction);
    if (input.state === "draft") {
      if (input.reason.length < 3)
        fail(400, "Reopening/returning results requires a reason.");
      for (const result of results)
        await transitionResult(req, result, "draft", input.reason, transaction);
      exam.cohortIds = [];
    } else {
      const previous = {
        submitted: "draft",
        approved: "submitted",
        published: "approved",
      }[input.state];
      if (exam.status !== previous)
        fail(
          409,
          "Use draft → submitted → approved → published. Reopen with a reason to make corrections.",
        );
      if (input.state === "submitted") {
        const current = await Student.find({
          schoolId: req.user.schoolId,
          sessionId: exam.sessionId,
          classId: exam.classId,
          status: "active",
        })
          .select("_id")
          .session(transaction);
        const ids = [
          ...new Set([
            ...current.map((student) => student.id),
            ...results.map((result) => String(result.studentId)),
          ]),
        ];
        if (
          !ids.length ||
          ids.some((id) =>
            exam.subjects.some(
              (subject) =>
                !results.some(
                  (result) =>
                    String(result.studentId) === id &&
                    String(result.subjectId) === String(subject.subjectId),
                ),
            ),
          )
        )
          fail(
            409,
            "Every active student and previously scored student must have all examination subjects completed before submission.",
          );
        exam.cohortIds = ids;
      }
      if (!results.length)
        fail(409, "No results are available for this examination.");
      for (const result of results)
        await transitionResult(
          req,
          result,
          input.state,
          input.reason,
          transaction,
        );
      if (input.state === "published") {
        const summaries = classSummaries(exam, results);
        const attendance = await Attendance.find({
          schoolId: req.user.schoolId,
          kind: "student",
          personId: { $in: exam.cohortIds },
          sessionId: exam.sessionId,
          classId: exam.classId,
          date: { $gte: exam.termStartDate, $lte: exam.termEndDate },
        })
          .select("personId status")
          .session(transaction)
          .lean();
        const comments = await ResultComment.find({
          schoolId: req.user.schoolId,
          examinationId: id,
        }).session(transaction);
        exam.publicationNumber++;
        for (const row of summaries.students) {
          const studentResults = results.filter(
            (result) => String(result.studentId) === row.studentId,
          );
          const counts = {};
          for (const record of attendance.filter(
            (record) => String(record.personId) === row.studentId,
          ))
            counts[record.status] = (counts[record.status] || 0) + 1;
          const overallBand = exam.gradingScale.find(
            (band) => row.averageHundredths >= band.minPercent * 100,
          );
          const snapshot = {
            examinationName: exam.name,
            sessionName: exam.sessionName,
            termName: exam.termName,
            className: exam.className,
            configRevision: exam.configRevision,
            totalMarks: exam.totalMarks,
            components: exam.components.map((component) =>
              component.toObject(),
            ),
            gradingScale: exam.gradingScale.map((band) => band.toObject()),
            studentName: row.studentName,
            admissionNumber: row.admissionNumber,
            arm: row.arm,
            subjects: studentResults.map((result) => ({
              subjectId: result.subjectId,
              subjectName: result.subjectName,
              scores: result.scores,
              totalHundredths: result.totalHundredths,
              percentHundredths: result.percentHundredths,
              grade: result.grade,
              remark: result.remark,
              teacherComment: result.teacherComment,
              markedByName: result.createdByName,
              revision: result.revision,
            })),
            overallAverageHundredths: row.averageHundredths,
            overallGrade: overallBand.grade,
            overallRemark: overallBand.remark,
            position: row.position,
            cohortCount: summaries.students.length,
            subjectAverages: summaries.subjects,
            attendance: summarize(counts),
            administratorComment:
              comments.find(
                (comment) => String(comment.studentId) === row.studentId,
              )?.comment || "",
            school: {
              name: req.school.name,
              address: req.school.address,
              city: req.school.city,
              country: req.school.country,
              schoolType: req.school.schoolType,
            },
          };
          await ReportCard.create(
            [
              {
                schoolId: req.user.schoolId,
                examinationId: id,
                studentId: row.studentId,
                publication: exam.publicationNumber,
                snapshot,
                publishedBy: req.user._id,
                publishedByName: req.user.name,
              },
            ],
            { session: transaction },
          );
        }
      }
    }
    const before = exam.status;
    exam.status = input.state;
    exam.revision++;
    await exam.save({ session: transaction });
    await examAudit(
      req,
      exam,
      `examination_${input.state}`,
      input.reason,
      {
        before,
        after: input.state,
        cohortCount: exam.cohortIds.length,
        publication: exam.publicationNumber,
      },
      transaction,
    );
    return exam;
  });
}
