import { Router } from "express";
import { z } from "zod";
import { Attendance } from "../models/Attendance.js";
import { AttendanceAudit } from "../models/AttendanceAudit.js";
import { objectId } from "../validation/academic.js";
import {
  attendanceKind,
  markInput,
  rosterInput,
  reportInput,
  attendancePaging,
} from "../validation/attendance.js";
import {
  attendanceRoster,
  markAttendance,
  attendanceReport,
} from "../services/attendance.js";
import { fail } from "../services/schoolConfiguration.js";
export function attendanceRoutes() {
  const router = Router();
  router.get("/reports", async (req, res) =>
    res.json(
      await attendanceReport(
        req.user.schoolId,
        reportInput.parse(req.query),
        req.user.role === "teacher",
      ),
    ),
  );
  router.get("/:kind/history/:personId", async (req, res) => {
    const kind = attendanceKind.parse(req.params.kind),
      personId = objectId.parse(req.params.personId);
    const query = req.query;
    if ("personId" in query || "kind" in query)
      fail(
        400,
        "Use the history path to choose the person and attendance kind.",
      );
    res.json(
      await attendanceReport(
        req.user.schoolId,
        reportInput.parse({ ...query, kind, personId }),
        req.user.role === "teacher",
      ),
    );
  });
  router.get("/records/:id/audit", async (req, res) => {
    const id = objectId.parse(req.params.id),
      { page, limit } = attendancePaging.parse(req.query);
    if (!(await Attendance.exists({ schoolId: req.user.schoolId, _id: id })))
      fail(404, "Attendance record not found.");
    const filter = { schoolId: req.user.schoolId, attendanceId: id };
    const [records, total] = await Promise.all([
      AttendanceAudit.find(filter)
        .select("-schoolId -__v")
        .sort({ revision: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      AttendanceAudit.countDocuments(filter),
    ]);
    res.json({ records, total, page, limit });
  });
  router.get("/:kind/roster", async (req, res) => {
    const kind = attendanceKind.parse(req.params.kind);
    res.json(
      await attendanceRoster(
        req.user.schoolId,
        kind,
        rosterInput(kind).parse(req.query),
      ),
    );
  });
  router.put("/:kind", async (req, res) => {
    z.object({}).strict().parse(req.query);
    const kind = attendanceKind.parse(req.params.kind);
    res.json(
      await markAttendance(
        req.user.schoolId,
        req.user,
        kind,
        markInput(kind).parse(req.body),
      ),
    );
  });
  router.delete("/records/:id", async (req, res) => {
    z.object({}).strict().parse(req.query);
    const id = objectId.parse(req.params.id);
    if (!(await Attendance.exists({ _id: id, schoolId: req.user.schoolId })))
      fail(404, "Attendance record not found.");
    res.status(405).set("Allow", "GET, PUT").json({
      message:
        "Attendance cannot be deleted. Correct its status with a reason; all changes are audited.",
    });
  });
  return router;
}
