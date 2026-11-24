import { Router } from "express";
import { z } from "zod";
import { User } from "../models/User.js";
import { schoolConfigurationRoutes } from "./schoolConfiguration.js";
import { staffRoutes } from "./staff.js";
import { studentRoutes } from "./students.js";
import { guardianRoutes } from "./guardians.js";
import { attendanceRoutes } from "./attendance.js";
import { financeRoutes } from "./finance.js";
import { teacherAccountRoutes } from "./teacherAccounts.js";
import {
  authenticate,
  requireRole,
  requirePasswordChanged,
  publicUser,
} from "../middleware/auth.js";

export function schoolWorkspaceRoutes(config) {
  const router = Router();
  router.use(
    authenticate(config),
    requireRole("school_admin"),
    requirePasswordChanged,
  );
  router.get("/dashboard", async (req, res) => {
    z.object({}).strict().parse(req.query);
    const filter = { schoolId: req.user.schoolId, role: "school_admin" };
    const [
      totalAdministrators,
      activeAdministrators,
      inactiveAdministrators,
      pendingPasswordChanges,
    ] = await Promise.all([
      User.countDocuments(filter),
      User.countDocuments({ ...filter, isActive: true }),
      User.countDocuments({ ...filter, isActive: false }),
      User.countDocuments({ ...filter, mustChangePassword: true }),
    ]);
    const { id, name, city, country, schoolType, status } = req.school;
    res.json({
      school: { id, name, city, country, schoolType, status },
      stats: {
        totalAdministrators,
        activeAdministrators,
        inactiveAdministrators,
        pendingPasswordChanges,
      },
    });
  });
  router.get("/administrators/:id", async (req, res) => {
    const id = z
      .string()
      .regex(/^[a-f\d]{24}$/i)
      .parse(req.params.id);
    const user = await User.findOne({
      _id: id,
      schoolId: req.user.schoolId,
      role: "school_admin",
    });
    if (!user)
      return res.status(404).json({ message: "Administrator not found." });
    res.json({ administrator: publicUser(user) });
  });
  router.use("/staff", teacherAccountRoutes());
  router.use("/staff", staffRoutes());
  router.use("/students", studentRoutes());
  router.use("/guardians", guardianRoutes());
  router.use("/attendance", attendanceRoutes());
  router.use("/finance", financeRoutes());
  router.use(schoolConfigurationRoutes());
  return router;
}
