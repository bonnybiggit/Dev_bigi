import { Router } from "express";
import { randomBytes } from "node:crypto";
import bcrypt from "bcrypt";
import { z } from "zod";
import { School } from "../models/School.js";
import { User } from "../models/User.js";
import { publicUser } from "../middleware/auth.js";

export function administratorRoutes() {
  const router = Router({ mergeParams: true });
  router.use(async (req, res, next) => {
    const id = z
      .string()
      .regex(/^[a-f\d]{24}$/i)
      .parse(req.params.id);
    const school = await School.findById(id);
    if (!school) return res.status(404).json({ message: "School not found." });
    req.managedSchool = school;
    next();
  });
  router.get("/", async (req, res) => {
    const administrators = await User.find({
      schoolId: req.managedSchool._id,
      role: "school_admin",
    }).sort({ createdAt: -1 });
    res.json({ administrators: administrators.map(publicUser) });
  });
  router.post("/", async (req, res) => {
    const input = z
      .object({
        name: z.string().trim().min(2).max(120),
        email: z
          .email()
          .max(254)
          .transform((value) => value.toLowerCase()),
        phone: z
          .string()
          .trim()
          .min(7)
          .max(30)
          .regex(/^\+?[\d ()-]+$/)
          .refine(
            (value) => value.replace(/\D/g, "").length >= 7,
            "Enter a valid phone number",
          ),
      })
      .strict()
      .parse(req.body);
    const temporaryPassword = randomBytes(24).toString("base64url");
    const user = await User.create({
      ...input,
      role: "school_admin",
      schoolId: req.managedSchool._id,
      mustChangePassword: true,
      passwordHash: await bcrypt.hash(temporaryPassword, 12),
    });
    // This response is the only retrieval path for the plaintext temporary password.
    res
      .status(201)
      .json({ administrator: publicUser(user), temporaryPassword });
  });
  router.patch("/:administratorId/status", async (req, res) => {
    const id = z
      .string()
      .regex(/^[a-f\d]{24}$/i)
      .parse(req.params.administratorId);
    const { isActive } = z
      .object({ isActive: z.boolean() })
      .strict()
      .parse(req.body);
    const user = await User.findOneAndUpdate(
      { _id: id, schoolId: req.managedSchool._id, role: "school_admin" },
      { $set: { isActive }, $inc: { sessionVersion: 1 } },
      { new: true, runValidators: true },
    );
    if (!user)
      return res
        .status(404)
        .json({ message: "Administrator not found for this school." });
    res.json({ administrator: publicUser(user) });
  });
  return router;
}
