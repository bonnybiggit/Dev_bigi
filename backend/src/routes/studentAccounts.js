import { Router } from "express";
import { randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import { z } from "zod";
import { User } from "../models/User.js";
import { Student } from "../models/Student.js";
import { StudentPortalAudit } from "../models/StudentPortalAudit.js";
import { objectId } from "../validation/academic.js";
import { fail, mutateConfiguration } from "../services/schoolConfiguration.js";
const accountView = (user) =>
  user
    ? {
        id: user.id,
        isActive: user.isActive,
        mustChangePassword: user.mustChangePassword,
      }
    : null;
export function studentAccountRoutes() {
  const router = Router();
  router.get("/:id/portal-account", async (req, res) => {
    z.object({}).strict().parse(req.query);
    const student = await Student.findOne({
      _id: objectId.parse(req.params.id),
      schoolId: req.user.schoolId,
    });
    if (!student) fail(404, "Student not found.");
    res.json({
      account: accountView(
        await User.findOne({
          schoolId: req.user.schoolId,
          studentId: student._id,
          role: "student",
        }),
      ),
      schoolId: req.user.schoolId,
      admissionNumber: student.admissionNumber,
    });
  });
  router.post("/:id/portal-account", async (req, res) => {
    z.object({}).strict().parse(req.query);
    const { action } = z
      .object({ action: z.enum(["create", "activate", "deactivate", "reset"]) })
      .strict()
      .parse(req.body);
    const temporaryPassword = ["create", "reset"].includes(action)
      ? randomBytes(24).toString("base64url")
      : undefined;
    const passwordHash = temporaryPassword
      ? await bcrypt.hash(temporaryPassword, 12)
      : undefined;
    const account = await mutateConfiguration(
      req.user.schoolId,
      async (session) => {
        const student = await Student.findOne({
          _id: objectId.parse(req.params.id),
          schoolId: req.user.schoolId,
        }).session(session);
        if (!student) fail(404, "Student not found.");
        if (student.status !== "active" && action !== "deactivate")
          fail(400, "Only active students may access the portal.");
        let user = await User.findOne({
          schoolId: req.user.schoolId,
          studentId: student._id,
          role: "student",
        })
          .select("+sessionVersion")
          .session(session);
        if (action === "create") {
          if (user)
            fail(409, "A portal account already exists for this student.");
          user = (
            await User.create(
              [
                {
                  name: [
                    student.firstName,
                    student.middleName,
                    student.lastName,
                  ]
                    .filter(Boolean)
                    .join(" "),
                  email: `student-${student.id}@portal.invalid`,
                  role: "student",
                  schoolId: req.user.schoolId,
                  studentId: student._id,
                  passwordHash,
                  mustChangePassword: true,
                },
              ],
              { session },
            )
          )[0];
        } else {
          if (!user) fail(404, "Portal account not found.");
          user.sessionVersion++;
          if (action === "reset") {
            user.passwordHash = passwordHash;
            user.mustChangePassword = true;
          } else user.isActive = action === "activate";
          await user.save({ session });
        }
        await StudentPortalAudit.create(
          [
            {
              schoolId: req.user.schoolId,
              studentId: student._id,
              actorId: req.user._id,
              action,
              details: accountView(user),
            },
          ],
          { session },
        );
        return accountView(user);
      },
    );
    res
      .status(action === "create" ? 201 : 200)
      .json({ account, ...(temporaryPassword ? { temporaryPassword } : {}) });
  });
  return router;
}
