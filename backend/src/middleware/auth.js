import jwt from "jsonwebtoken";
import { User } from "../models/User.js";
import { School } from "../models/School.js";
import { Staff } from "../models/Staff.js";
import { Student } from "../models/Student.js";
import { teacherAccess } from "../services/teacherAccess.js";
export const authenticate = (config) => async (req, res, next) => {
  try {
    const claims = jwt.verify(
      req.cookies.dev_bigi_session || "",
      config.JWT_SECRET,
      { algorithms: ["HS256"], issuer: "dev-bigi", audience: "dev-bigi-web" },
    );
    const user = await User.findById(claims.sub).select("+sessionVersion");
    if (!user?.isActive || (claims.version ?? 0) !== user.sessionVersion)
      return res.status(401).json({ message: "Please sign in again." });
    if (user.role !== "super_admin") {
      const school = await School.findById(user.schoolId);
      if (!school || school.status !== "active")
        return res.status(403).json({ message: "School access is suspended." });
      req.school = school;
    }
    req.user = user;
    if (user.role === "student") {
      req.student = await Student.findOne({
        _id: user.studentId,
        schoolId: user.schoolId,
        status: "active",
      });
      if (!req.student)
        return res
          .status(403)
          .json({ message: "Student portal access is unavailable." });
    }
    if (user.role === "teacher") {
      const staff = await Staff.findOne({
        _id: user.staffId,
        schoolId: user.schoolId,
        status: "active",
        category: "teaching",
      });
      if (!staff)
        return res
          .status(403)
          .json({ message: "Teaching staff access is unavailable." });
      req.teacher = staff;
      req.teacherAccess = await teacherAccess(staff, user.schoolId);
    }
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError || error.name === "CastError")
      return res.status(401).json({ message: "Please sign in again." });
    next(error);
  }
};
export const requireRole = (role) => (req, res, next) =>
  req.user.role === role
    ? next()
    : res
        .status(403)
        .json({ message: "You do not have permission for this action." });
export const publicUser = (user) => ({
  id: user.id,
  name: user.name,
  ...(user.role !== "student" ? { email: user.email } : {}),
  role: user.role,
  phone: user.phone,
  schoolId: user.schoolId,
  isActive: user.isActive,
  mustChangePassword: user.mustChangePassword,
  staffId: user.staffId,
  ...(user.role === "student" ? { studentId: user.studentId } : {}),
});
export const requireRoles =
  (...roles) =>
  (req, res, next) =>
    roles.includes(req.user.role)
      ? next()
      : res
          .status(403)
          .json({ message: "You do not have permission for this action." });
export const requirePasswordChanged = (req, res, next) =>
  req.user.mustChangePassword
    ? res.status(403).json({
        message: "Change your temporary password before continuing.",
        code: "PASSWORD_CHANGE_REQUIRED",
      })
    : next();
