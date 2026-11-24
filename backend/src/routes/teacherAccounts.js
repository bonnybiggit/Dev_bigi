import { Router } from "express";
import { randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import { z } from "zod";
import { Staff } from "../models/Staff.js";
import { User } from "../models/User.js";
import { objectId } from "../validation/academic.js";
import { publicUser } from "../middleware/auth.js";
import { mutateConfiguration, fail } from "../services/schoolConfiguration.js";
export function teacherAccountRoutes() {
  const router = Router();
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
