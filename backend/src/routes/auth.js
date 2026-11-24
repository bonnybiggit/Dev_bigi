import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { rateLimit } from "express-rate-limit";
import { z } from "zod";
import { User } from "../models/User.js";
import { School } from "../models/School.js";
import { authenticate, publicUser, requireRoles } from "../middleware/auth.js";
import { Staff } from "../models/Staff.js";
const loginSchema = z
  .object({
    email: z
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
    password: z.string().min(1).max(72),
  })
  .strict();
export function authRoutes(config) {
  const router = Router();
  const cookie = {
    httpOnly: true,
    secure: config.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
  };
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { message: "Too many attempts. Try again in 15 minutes." },
  });
  function issueSession(res, user) {
    const token = jwt.sign(
      { version: user.sessionVersion ?? 0 },
      config.JWT_SECRET,
      {
        subject: user.id,
        expiresIn: "8h",
        algorithm: "HS256",
        issuer: "dev-bigi",
        audience: "dev-bigi-web",
      },
    );
    return res
      .cookie("dev_bigi_session", token, {
        ...cookie,
        maxAge: 8 * 60 * 60 * 1000,
      })
      .json({ user: publicUser(user) });
  }
  const login = (role) => async (req, res) => {
    const input = loginSchema.parse(req.body);
    const user = await User.findOne({ email: input.email }).select(
      "+passwordHash +sessionVersion",
    );
    const valid = await bcrypt.compare(
      input.password,
      user?.passwordHash ||
        "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxLxLTqFnQx6Qdtg5cwx9y9.3Ye",
    );
    if (!valid || !user?.isActive || user.role !== role)
      return res
        .status(401)
        .json({ message: "Invalid administrator credentials." });
    if (["school_admin", "teacher"].includes(role)) {
      const school = await School.findById(user.schoolId);
      if (!school || school.status !== "active")
        return res.status(403).json({ message: "School access is suspended." });
    }
    if (
      role === "teacher" &&
      !(await Staff.exists({
        _id: user.staffId,
        schoolId: user.schoolId,
        status: "active",
        category: "teaching",
      }))
    )
      return res
        .status(403)
        .json({ message: "Teaching staff access is unavailable." });
    return issueSession(res, user);
  };
  router.post("/login", loginLimiter, login("super_admin"));
  router.post("/school-login", loginLimiter, login("school_admin"));
  router.post("/teacher-login", loginLimiter, login("teacher"));
  router.post(
    "/change-password",
    authenticate(config),
    requireRoles("school_admin", "teacher"),
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 10,
      message: { message: "Too many password attempts. Try again later." },
    }),
    async (req, res) => {
      const { currentPassword, newPassword } = z
        .object({
          currentPassword: z.string().min(1).max(72),
          newPassword: z
            .string()
            .min(12)
            .max(72)
            .refine(
              (value) => Buffer.byteLength(value, "utf8") <= 72,
              "Password must be at most 72 UTF-8 bytes",
            ),
        })
        .strict()
        .parse(req.body);
      const user = await User.findById(req.user._id).select(
        "+passwordHash +sessionVersion",
      );
      if (!(await bcrypt.compare(currentPassword, user.passwordHash)))
        return res
          .status(400)
          .json({ message: "Current password is incorrect." });
      if (await bcrypt.compare(newPassword, user.passwordHash))
        return res.status(400).json({
          message: "Choose a password different from your current password.",
        });
      // Compare-and-set prevents concurrent changes from reusing an old password/session.
      const updated = await User.findOneAndUpdate(
        {
          _id: user._id,
          passwordHash: user.passwordHash,
          sessionVersion: user.sessionVersion,
          isActive: true,
        },
        {
          $set: {
            passwordHash: await bcrypt.hash(newPassword, 12),
            mustChangePassword: false,
          },
          $inc: { sessionVersion: 1 },
        },
        { new: true, runValidators: true },
      ).select("+sessionVersion");
      if (!updated)
        return res
          .status(409)
          .json({ message: "Account changed. Sign in again." });
      return issueSession(res, updated);
    },
  );
  router.get("/me", authenticate(config), (req, res) =>
    res.json({ user: publicUser(req.user) }),
  );
  router.post("/logout", (_req, res) =>
    res.clearCookie("dev_bigi_session", cookie).status(204).end(),
  );
  return router;
}
