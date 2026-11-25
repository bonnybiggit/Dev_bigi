import { Router } from "express";
import { randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import { z } from "zod";
import { Staff } from "../models/Staff.js";
import { User } from "../models/User.js";
import { SchoolClass } from "../models/SchoolClass.js";
import { TeacherAudit } from "../models/TeacherAudit.js";
import { objectId } from "../validation/academic.js";
import { publicUser } from "../middleware/auth.js";
import { mutateConfiguration, fail } from "../services/schoolConfiguration.js";
export function teacherAccountRoutes() {
  const router = Router();
  router.put("/:id/attendance-grants", async (req, res) => {
    const { grants } = z
      .object({
        grants: z
          .array(
            z
              .object({
                classId: objectId,
                arm: z
                  .string()
                  .trim()
                  .max(20)
                  .transform((v) => v.toUpperCase())
                  .default(""),
              })
              .strict(),
          )
          .max(100),
      })
      .strict()
      .parse(req.body);
    await mutateConfiguration(req.user.schoolId, async (session) => {
      const staff = await Staff.findOne({
        _id: objectId.parse(req.params.id),
        schoolId: req.user.schoolId,
        category: "teaching",
        status: "active",
      }).session(session);
      if (!staff) fail(404, "Active teacher not found.");
      if (staff.assignmentMode === "explicit")
        fail(
          409,
          "Manage this teacher's period-scoped attendance permissions on Teacher Assignments.",
        );
      for (const grant of grants) {
        const c = await SchoolClass.findOne({
          _id: grant.classId,
          schoolId: req.user.schoolId,
          status: "active",
        }).session(session);
        if (
          !c ||
          !staff.classIds.some((id) => String(id) === grant.classId) ||
          (c.arms.length ? !c.arms.includes(grant.arm) : !!grant.arm) ||
          c.inactiveArms.includes(grant.arm)
        )
          fail(400, "Grant must reference an assigned active class and arm.");
      }
      await TeacherAudit.create(
        [
          {
            schoolId: req.user.schoolId,
            staffId: staff._id,
            actorId: req.user._id,
            action: "attendance_grants_updated",
            before: staff.attendanceGrants.toObject(),
            after: grants,
          },
        ],
        { session },
      );
      staff.attendanceGrants = grants;
      staff.updatedBy = req.user._id;
      await staff.save({ session });
      await User.updateMany(
        { staffId: staff._id, schoolId: req.user.schoolId },
        { $inc: { sessionVersion: 1 } },
        { session },
      );
    });
    res.json({
      message: "Attendance permissions updated. Teacher must sign in again.",
    });
  });
  router.get("/:id/teacher-account", async (req, res) => {
    z.object({}).strict().parse(req.query);
    const staffId = objectId.parse(req.params.id);
    if (!(await Staff.exists({ _id: staffId, schoolId: req.user.schoolId })))
      fail(404, "Staff record not found.");
    const user = await User.findOne({
      schoolId: req.user.schoolId,
      staffId,
      role: "teacher",
    });
    res.json({ user: user ? publicUser(user) : null });
  });
  router.post("/:id/teacher-account", async (req, res) => {
    z.object({})
      .strict()
      .parse(req.body || {});
    z.object({}).strict().parse(req.query);
    const staffId = objectId.parse(req.params.id);
    const temporaryPassword = randomBytes(24).toString("base64url");
    const user = await mutateConfiguration(
      req.user.schoolId,
      async (session) => {
        const staff = await Staff.findOne({
          _id: staffId,
          schoolId: req.user.schoolId,
          status: "active",
          category: "teaching",
        }).session(session);
        if (!staff)
          fail(400, "Select an active teaching staff record in your school.");
        if (
          await User.exists({
            $or: [
              { email: staff.email },
              { schoolId: req.user.schoolId, staffId },
            ],
          }).session(session)
        )
          fail(409, "An account already uses this staff record or email.");
        return (
          await User.create(
            [
              {
                schoolId: req.user.schoolId,
                staffId,
                name: staff.fullName,
                email: staff.email,
                phone: staff.phone,
                role: "teacher",
                mustChangePassword: true,
                passwordHash: await bcrypt.hash(temporaryPassword, 12),
              },
            ],
            { session },
          )
        )[0];
      },
    );
    res.status(201).json({ user: publicUser(user), temporaryPassword });
  });
  return router;
}
