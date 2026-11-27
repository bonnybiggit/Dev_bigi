import { Router } from "express";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import { z } from "zod";
import { rateLimit } from "express-rate-limit";
import { User } from "../models/User.js";
import { School } from "../models/School.js";
import { profileInput } from "../validation/academic.js";
import {
  authenticate,
  requireRole,
  requirePasswordChanged,
} from "../middleware/auth.js";
import { fail } from "../services/schoolConfiguration.js";

const account = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: z
      .email()
      .max(254)
      .transform((v) => v.toLowerCase()),
    password: z
      .string()
      .min(12)
      .max(72)
      .refine(
        (v) => Buffer.byteLength(v, "utf8") <= 72,
        "Password exceeds 72 UTF-8 bytes",
      ),
  })
  .strict();
const input = z.discriminatedUnion("mode", [
  z
    .object({
      mode: z.literal("school"),
      owner: account,
      administrator: account,
      school: profileInput,
    })
    .strict()
    .refine(
      (v) => v.owner.email !== v.administrator.email,
      "Use different owner and school administrator email addresses",
    ),
  z.object({ mode: z.literal("recovery"), owner: account }).strict(),
]);
export function desktopRoutes(config) {
  const router = Router();
  router.use((_req, _res, next) => {
    if (config.DESKTOP_MODE !== true) fail(404, "Endpoint not found.");
    next();
  });
  router.use(rateLimit({ windowMs: 15 * 60 * 1000, limit: 50 }));
  router.get("/setup", async (req, res) => {
    z.object({}).strict().parse(req.query);
    const db = mongoose.connection.db;
    const [installation, users, schools] = await Promise.all([
      db.collection("_desktopInstallation").findOne({ _id: "installation" }),
      User.countDocuments(),
      School.countDocuments(),
    ]);
    res.json({
      setupRequired: !installation && users === 0 && schools === 0,
      locked: !installation && users === 0 && schools > 0,
    });
  });
  router.post("/setup", async (req, res) => {
    const body = input.parse(req.body);
    const db = mongoose.connection.db;
    const ownerHash = await bcrypt.hash(body.owner.password, 12);
    const adminHash =
      body.mode === "school"
        ? await bcrypt.hash(body.administrator.password, 12)
        : null;
    const session = await mongoose.startSession();
    let schoolId;
    try {
      await session.withTransaction(
        async () => {
          if (
            (await User.countDocuments({}).session(session)) ||
            (await School.countDocuments({}).session(session)) ||
            (await db
              .collection("_desktopInstallation")
              .findOne({ _id: "installation" }, { session }))
          )
            fail(
              409,
              "This installation already contains accounts or school data. Setup is closed.",
            );
          await db
            .collection("_desktopInstallation")
            .insertOne(
              { _id: "installation", mode: body.mode, createdAt: new Date() },
              { session },
            );
          const [owner] = await User.create(
            [
              {
                name: body.owner.name,
                email: body.owner.email,
                passwordHash: ownerHash,
                role: "super_admin",
                mustChangePassword: false,
              },
            ],
            { session },
          );
          if (body.mode === "school") {
            if (body.school.logoUrl)
              fail(
                400,
                "Upload a logo after registration; first-run logos must be blank.",
              );
            const [school] = await School.create(
              [{ ...body.school, createdBy: owner._id }],
              { session },
            );
            schoolId = school.id;
            await User.create(
              [
                {
                  name: body.administrator.name,
                  email: body.administrator.email,
                  passwordHash: adminHash,
                  role: "school_admin",
                  schoolId: school._id,
                  mustChangePassword: false,
                },
              ],
              { session },
            );
          }
          await db
            .collection("_desktopInstallation")
            .updateOne(
              { _id: "installation" },
              { $set: { ownerId: owner._id, schoolId: schoolId || null } },
              { session },
            );
          await db
            .collection("_desktopAudit")
            .insertOne(
              {
                action: "first_run_registered",
                ownerId: owner._id,
                schoolId: schoolId || null,
                mode: body.mode,
                createdAt: new Date(),
              },
              { session },
            );
        },
        { writeConcern: { w: "majority", j: true } },
      );
    } catch (error) {
      if (error.code === 11000)
        fail(409, "Setup was already completed by another request.");
      throw error;
    } finally {
      await session.endSession();
    }
    res
      .status(201)
      .json({ registered: true, mode: body.mode, schoolId: schoolId || null });
  });
  router.post(
    "/activate-recovery",
    authenticate(config),
    requireRole("super_admin"),
    requirePasswordChanged,
    async (req, res) => {
      const body = z
        .object({
          database: z.string().regex(/^school_recovery_[a-f\d]{24}$/),
          password: z.string().min(1).max(72),
        })
        .strict()
        .parse(req.body);
      const owner = await User.findById(req.user._id).select("+passwordHash");
      if (!owner || !(await bcrypt.compare(body.password, owner.passwordHash)))
        fail(403, "Current owner password is incorrect.");
      const client = mongoose.connection.getClient(),
        target = client.db(body.database);
      const proof = await target
        .collection("_recoveryProof")
        .findOne({ _id: "verified", targetDatabase: body.database });
      if (!proof)
        fail(409, "This database has no completed recovery verification.");
      const actual = (
        await target
          .collection("schools")
          .find({}, { projection: { _id: 1 } })
          .toArray()
      )
        .map((s) => String(s._id))
        .sort();
      const current = (await School.find({}).select("_id"))
        .map((s) => s.id)
        .sort();
      if (
        JSON.stringify(actual) !==
          JSON.stringify([...proof.schoolIds].sort()) ||
        (current.length && JSON.stringify(actual) !== JSON.stringify(current))
      )
        fail(409, "Recovery school identities do not match this installation.");
      if (
        !(await target
          .collection("users")
          .findOne({ role: "super_admin", isActive: true }))
      )
        fail(
          409,
          "The recovered installation has no active installation owner.",
        );
      await mongoose.connection.db
        .collection("_desktopAudit")
        .insertOne({
          action: "recovery_activation_authorized",
          actorId: req.user._id,
          database: body.database,
          createdAt: new Date(),
        });
      res.json({ authorized: true, database: body.database });
    },
  );
  return router;
}
