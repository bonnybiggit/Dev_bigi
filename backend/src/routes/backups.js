import { Router } from "express";
import bcrypt from "bcrypt";
import { z } from "zod";
import { rateLimit } from "express-rate-limit";
import {
  authenticate,
  requireRole,
  requirePasswordChanged,
} from "../middleware/auth.js";
import { User } from "../models/User.js";
import { BackupService } from "../services/backups.js";
import { summaryPdf } from "../services/backupPlatform.js";
import { fail } from "../services/schoolConfiguration.js";

const credentials = z
  .object({
    currentPassword: z.string().min(1).max(72),
    passphrase: z.string().min(16).max(256),
  })
  .strict();
export function backupRoutes(config, service) {
  const router = Router();
  router.use(
    authenticate(config),
    requireRole("super_admin"),
    requirePasswordChanged,
  );
  router.use((req, _res, next) => {
    if (
      !["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
        req.socket.remoteAddress,
      )
    )
      fail(403, "Backup administration requires a local connection.");
    if (config.BACKUPS_ENABLED !== true)
      fail(
        403,
        "Local Backup & Recovery is disabled. Enable it only in the local environment.",
      );
    if (!service) fail(503, "Local backup storage is unavailable.");
    z.object({}).strict().parse(req.query);
    next();
  });
  router.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 100,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  const reauthenticate = async (req, password) => {
    await service.ready();
    const account = await User.findById(req.user._id).select("+passwordHash");
    if (!account || !(await bcrypt.compare(password, account.passwordHash))) {
      await service.audit("backup_reauthentication_failed", req.user);
      fail(403, "Current password is incorrect.");
    }
  };
  router.get("/", async (_req, res) =>
    res.json({
      backups: await service.history(),
      schedule: await service.schedule(),
      audit: await service.events(),
    }),
  );
  router.post("/", async (req, res) => {
    const input = credentials.parse(req.body);
    await reauthenticate(req, input.currentPassword);
    res
      .status(201)
      .json({ backup: await service.create(input.passphrase, req.user) });
  });
  router.post("/upload", async (req, res) => {
    if (req.get("content-type") !== "application/octet-stream")
      fail(
        415,
        "Upload the encrypted .schoolbackup file as application/octet-stream.",
      );
    res.status(201).json({ backup: await service.upload(req, req.user) });
  });
  router.get("/:id/download", async (req, res) => {
    const result = await service.download(req.params.id, req.user);
    res.download(result.file, `${result.job._id}.schoolbackup`);
  });
  router.get("/:id/summary.pdf", async (req, res) => {
    const job = await service.job(req.params.id);
    await service.audit("backup_summary_downloaded", req.user, {
      backupId: job._id,
    });
    res
      .type("application/pdf")
      .attachment(`${job._id}-summary.pdf`)
      .send(summaryPdf(job));
  });
  router.post("/:id/inspect", async (req, res) => {
    const input = credentials.parse(req.body);
    await reauthenticate(req, input.currentPassword);
    res.json({
      manifest: await service.inspect(
        req.params.id,
        input.passphrase,
        req.user,
      ),
    });
  });
  router.post("/:id/restore", async (req, res) => {
    const input = credentials
      .extend({
        schoolIds: z.array(z.string().regex(/^[a-f\d]{24}$/i)).max(1000),
        confirmation: z.literal("RESTORE"),
        reason: z.string().trim().min(3).max(500),
      })
      .parse(req.body);
    await reauthenticate(req, input.currentPassword);
    res.status(201).json({
      recovery: await service.restore(
        req.params.id,
        input.passphrase,
        input.schoolIds,
        req.user,
        input.reason,
      ),
    });
  });
  router.put("/schedule", async (req, res) => {
    const input = z
      .object({
        currentPassword: z.string().min(1).max(72),
        passphrase: z.string().max(256).default(""),
        enabled: z.boolean(),
        time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
      })
      .strict()
      .parse(req.body);
    await reauthenticate(req, input.currentPassword);
    res.json({
      schedule: await service.configure(
        input.enabled,
        input.time,
        input.passphrase,
        req.user,
      ),
    });
  });
  return router;
}
export const buildBackupService = (config) =>
  config.BACKUPS_ENABLED === true ? new BackupService(config) : null;
