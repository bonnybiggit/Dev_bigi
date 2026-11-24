import { Router } from "express";
import { z } from "zod";
import { School } from "../models/School.js";
import { User } from "../models/User.js";
import {
  authenticate,
  requireRole,
  requirePasswordChanged,
} from "../middleware/auth.js";
import { administratorRoutes } from "./administrators.js";
const text = (max) => z.string().trim().min(2).max(max);
const registration = z
  .object({
    name: text(160),
    city: text(80),
    country: text(80),
    schoolType: z.enum([
      "Nursery",
      "Primary",
      "Nursery and Primary",
      "Secondary",
      "Other",
    ]),
  })
  .strict();
export function schoolRoutes(config) {
  const router = Router();
  router.use(
    authenticate(config),
    requireRole("super_admin"),
    requirePasswordChanged,
  );
  router.use("/:id/administrators", administratorRoutes());
  router.get("/stats", async (_req, res) => {
    const [totalSchools, activeSchools, suspendedSchools, totalUsers] =
      await Promise.all([
        School.countDocuments(),
        School.countDocuments({ status: "active" }),
        School.countDocuments({ status: "suspended" }),
        User.countDocuments(),
      ]);
    res.json({ totalSchools, activeSchools, suspendedSchools, totalUsers });
  });
  router.get("/", async (req, res) => {
    const { search, page, limit } = z
      .object({
        search: z.string().trim().max(100).default(""),
        page: z.coerce.number().int().min(1).max(100000).default(1),
        limit: z.coerce.number().int().min(1).max(50).default(10),
      })
      .parse(req.query);
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const filter = search
      ? {
          $or: ["name", "city", "country"].map((field) => ({
            [field]: { $regex: escaped, $options: "i" },
          })),
        }
      : {};
    const [schools, total] = await Promise.all([
      School.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      School.countDocuments(filter),
    ]);
    res.json({ schools, total, page, limit });
  });
  router.post("/", async (req, res) => {
    const school = await School.create({
      ...registration.parse(req.body),
      createdBy: req.user._id,
    });
    res.status(201).json({ school });
  });
  router.get("/:id", async (req, res) => {
    const id = z
      .string()
      .regex(/^[a-f\d]{24}$/i)
      .parse(req.params.id);
    const school = await School.findById(id);
    if (!school) return res.status(404).json({ message: "School not found." });
    res.json({ school });
  });
  router.patch("/:id/status", async (req, res) => {
    const id = z
      .string()
      .regex(/^[a-f\d]{24}$/i)
      .parse(req.params.id);
    const { status } = z
      .object({ status: z.enum(["active", "suspended"]) })
      .strict()
      .parse(req.body);
    const school = await School.findByIdAndUpdate(
      id,
      { status },
      { new: true, runValidators: true },
    );
    if (!school) return res.status(404).json({ message: "School not found." });
    res.json({ school });
  });
  return router;
}
