import fs from "node:fs";
import { promises as fsp } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";
import mongoose from "mongoose";
import {
  exportArchive,
  inspectArchive,
  restoreArchive,
  passwordCheck,
  fileHash,
} from "./backupArchive.js";
import {
  localBackupUri,
  assertLocalDatabase,
  dpapi,
} from "./backupPlatform.js";
import { fail } from "./schoolConfiguration.js";

export const backupDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../.local/backups",
);
const historyName = "_backupHistory",
  auditName = "_backupAudit",
  settingsName = "_backupSettings";
const idCheck = (id) => {
  if (!/^[a-f\d-]{36}$/i.test(id)) fail(400, "Invalid backup ID.");
  return id;
};
const sortedIds = (schools) => schools.map((s) => s.id).sort();
const equalIds = (a, b) =>
  JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
const dateParts = (now) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
export function dailyDate(now = new Date()) {
  const values = Object.fromEntries(
    dateParts(now).map((p) => [p.type, p.value]),
  );
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
  };
}

export class BackupService {
  constructor(
    config,
    {
      client,
      folder = backupDirectory,
      protect = dpapi,
      now = () => new Date(),
    } = {},
  ) {
    this.config = config;
    this.local = localBackupUri(config.MONGODB_URI);
    this.client = client;
    this.folder = folder;
    this.protect = protect;
    this.now = now;
  }
  async ready() {
    const client = this.client || mongoose.connection.getClient();
    await assertLocalDatabase(client, this.config.MONGODB_URI);
    await fsp.mkdir(this.folder, { recursive: true, mode: 0o700 });
    if (
      path.resolve(await fsp.realpath(this.folder)).toLowerCase() !==
      path.resolve(this.folder).toLowerCase()
    )
      fail(403, "Backup storage must not be redirected through a link.");
    this.client = client;
    this.db = client.db(this.local.database);
    return this;
  }
  file(id) {
    return path.join(this.folder, `${idCheck(id)}.schoolbackup`);
  }
  async audit(action, actor, details = {}, session) {
    await this.db.collection(auditName).insertOne(
      {
        action,
        actorId: actor?.id || "scheduler",
        actorName: actor?.name || "Automatic daily backup",
        createdAt: this.now(),
        ...details,
      },
      session ? { session } : {},
    );
  }
  async operation(action, actor, work) {
    await this.ready();
    const owner = randomUUID(),
      locks = this.db.collection("_backupLocks"),
      now = this.now();
    try {
      await locks.findOneAndUpdate(
        { _id: "operation", $or: [{ until: { $lt: now } }, { owner: null }] },
        { $set: { owner, action, until: new Date(now.getTime() + 120000) } },
        { upsert: true },
      );
    } catch (error) {
      if (error.code === 11000)
        fail(409, "Another backup/recovery operation is in progress.");
      throw error;
    }
    const heartbeat = setInterval(
      () =>
        locks
          .updateOne(
            { _id: "operation", owner },
            { $set: { until: new Date(this.now().getTime() + 120000) } },
          )
          .catch(() => {}),
      30000,
    );
    heartbeat.unref();
    try {
      return await work();
    } catch (error) {
      await this.audit(`${action}_failed`, actor, {
        message: error.status
          ? error.message
          : "Operation failed; inspect local service availability.",
      });
      throw error;
    } finally {
      clearInterval(heartbeat);
      await locks.updateOne(
        { _id: "operation", owner },
        { $set: { owner: null, until: new Date(0) } },
      );
    }
  }
  async createUnlocked(passphrase, actor, kind = "manual") {
    passwordCheck(passphrase);
    const id = randomUUID(),
      createdAt = this.now();
    const job = {
      _id: id,
      kind,
      status: "running",
      createdAt,
      actorId: actor?.id || "scheduler",
      actorName: actor?.name || "Automatic daily backup",
    };
    await this.db.collection(historyName).insertOne(job);
    await this.audit("backup_started", actor, { backupId: id, kind });
    try {
      const result = await exportArchive(
        this.db,
        this.client,
        this.file(id),
        passphrase,
        {
          backupId: id,
          sourceDatabase: this.local.database,
          application: "School Management",
          format: "school-bson-v1",
        },
      );
      await inspectArchive(this.file(id), passphrase);
      const completed = {
        ...result,
        status: "complete",
        completedAt: this.now(),
      };
      await this.db
        .collection(historyName)
        .updateOne({ _id: id }, { $set: completed });
      await this.audit("backup_completed", actor, {
        backupId: id,
        sha256: result.sha256,
      });
      return { ...job, ...completed };
    } catch (error) {
      await this.db
        .collection(historyName)
        .updateOne(
          { _id: id },
          { $set: { status: "failed", completedAt: this.now() } },
        );
      await this.audit("backup_failed", actor, { backupId: id });
      throw error;
    }
  }
  async create(passphrase, actor) {
    return this.operation("backup", actor, () =>
      this.createUnlocked(passphrase, actor),
    );
  }
  async history() {
    await this.ready();
    return this.db
      .collection(historyName)
      .find({})
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();
  }
  async events() {
    await this.ready();
    return this.db
      .collection(auditName)
      .find({})
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray();
  }
  async job(id) {
    await this.ready();
    const job = await this.db
      .collection(historyName)
      .findOne({ _id: idCheck(id) });
    if (!job) fail(404, "Backup not found in this installation's history.");
    return job;
  }
  async download(id, actor) {
    const job = await this.job(id);
    if (!["complete", "imported", "verified"].includes(job.status))
      fail(409, "Backup is not available.");
    await this.checkFile(job);
    await this.audit("backup_downloaded", actor, { backupId: id });
    return { job, file: this.file(id) };
  }
  async checkFile(job) {
    const filename = this.file(job._id);
    let info;
    try {
      info = await fsp.lstat(filename);
    } catch {
      fail(404, "Encrypted backup file is missing; history was retained.");
    }
    if (!info.isFile() || info.isSymbolicLink())
      fail(400, "Invalid backup file.");
    if (info.size !== job.bytes || (await fileHash(filename)) !== job.sha256)
      fail(400, "Encrypted file checksum mismatch. No restore was attempted.");
  }
  async upload(stream, actor) {
    return this.operation("upload", actor, async () => {
      const id = randomUUID(),
        file = this.file(id);
      let size = 0;
      const limit = new Transform({
        transform(chunk, _encoding, callback) {
          size += chunk.length;
          if (size > 100 * 1024 * 1024 * 1024)
            return callback(
              Object.assign(new Error("Backup exceeds 100 GiB."), {
                status: 413,
              }),
            );
          callback(null, chunk);
        },
      });
      try {
        await pipeline(
          stream,
          limit,
          fs.createWriteStream(file, { flags: "wx", mode: 0o600 }),
        );
      } catch (error) {
        if (error.code !== "EEXIST") await fsp.unlink(file).catch(() => {});
        throw error;
      }
      const job = {
        _id: id,
        status: "imported",
        kind: "import",
        bytes: size,
        sha256: await fileHash(file),
        createdAt: this.now(),
        actorId: actor.id,
        actorName: actor.name,
      };
      await this.db.collection(historyName).insertOne(job);
      await this.audit("backup_uploaded", actor, { backupId: id });
      return job;
    });
  }
  async inspect(id, passphrase, actor) {
    return this.operation("inspection", actor, async () => {
      const job = await this.job(id);
      await this.checkFile(job);
      const manifest = await inspectArchive(this.file(id), passphrase);
      await this.db.collection(historyName).updateOne(
        { _id: id },
        {
          $set: {
            manifest,
            verifiedAt: this.now(),
            ...(job.status === "imported" ? { status: "verified" } : {}),
          },
        },
      );
      await this.audit("backup_integrity_verified", actor, {
        backupId: id,
        schoolIds: sortedIds(manifest.schools),
      });
      return manifest;
    });
  }
  async restore(id, passphrase, expectedSchoolIds, actor, reason) {
    return this.operation("restore", actor, async () => {
      const job = await this.job(id);
      await this.checkFile(job);
      const manifest = await inspectArchive(this.file(id), passphrase);
      if (!equalIds(expectedSchoolIds, sortedIds(manifest.schools)))
        fail(409, "Entered school IDs do not match the verified backup.");
      const existing = await this.db
        .collection("schools")
        .find({}, { projection: { _id: 1 } })
        .toArray();
      if (
        existing.length &&
        !equalIds(
          existing.map((s) => String(s._id)),
          expectedSchoolIds,
        )
      )
        fail(
          409,
          "This installation belongs to different schools. Restore on an empty local installation for that school.",
        );
      // The entire current installation is encrypted before any recovery database is written.
      const before = await this.createUnlocked(
        passphrase,
        actor,
        "pre-restore",
      );
      const name = `school_recovery_${new mongoose.Types.ObjectId()}`;
      const target = this.client.db(name);
      if (
        (await target.listCollections({}, { nameOnly: true }).toArray()).length
      )
        fail(409, "Recovery target is not empty.");
      await this.audit("restore_started", actor, {
        backupId: id,
        targetDatabase: name,
        preRestoreBackupId: before._id,
        reason,
      });
      let restored;
      try {
        // Second authenticated pass writes only to the fresh, inactive recovery database.
        await this.checkFile(job);
        restored = await restoreArchive(this.file(id), passphrase, target);
        const result = {
          _id: "verified",
          targetDatabase: name,
          backupId: id,
          preRestoreBackupId: before._id,
          schoolIds: expectedSchoolIds,
          verifiedAt: this.now(),
          sourceSha256: job.sha256,
        };
        for (const collection of [
          "users",
          "_backupLocks",
          historyName,
          settingsName,
          "_recoveryProof",
          auditName,
        ]) {
          if (
            !(
              await target
                .listCollections({ name: collection }, { nameOnly: true })
                .toArray()
            ).length
          )
            await target.createCollection(collection);
        }
        const session = this.client.startSession();
        try {
          // Activation proof, audit and session revocation become visible together.
          await session.withTransaction(
            async () => {
              await target
                .collection("users")
                .updateMany({}, { $inc: { sessionVersion: 1 } }, { session });
              await target
                .collection("_backupLocks")
                .updateMany(
                  {},
                  { $set: { owner: null, until: new Date(0) } },
                  { session },
                );
              await target
                .collection(historyName)
                .updateMany(
                  { status: "running" },
                  { $set: { status: "interrupted-by-recovery" } },
                  { session },
                );
              await target
                .collection(settingsName)
                .updateOne(
                  { _id: "daily" },
                  { $set: { enabled: false, reconfigureRequired: true } },
                  { upsert: true, session },
                );
              await target.collection(auditName).insertOne(
                {
                  action: "restore_verified",
                  actorId: actor.id,
                  actorName: actor.name,
                  createdAt: this.now(),
                  backupId: id,
                  preRestoreBackupId: before._id,
                  reason,
                  schoolIds: expectedSchoolIds,
                },
                { session },
              );
              await this.audit(
                "restore_completed",
                actor,
                {
                  backupId: id,
                  targetDatabase: name,
                  preRestoreBackupId: before._id,
                  reason,
                },
                session,
              );
              await target
                .collection("_recoveryProof")
                .replaceOne({ _id: "verified" }, result, {
                  upsert: true,
                  session,
                });
            },
            { writeConcern: { w: "majority", j: true } },
          );
        } finally {
          await session.endSession();
        }
        return {
          ...result,
          collections: restored.collections,
          launchCommand: `./scripts/windows/Start-RecoveredBackend.ps1 -Database ${name}`,
        };
      } catch (error) {
        await this.audit("restore_quarantined", actor, {
          backupId: id,
          targetDatabase: name,
          reason:
            "Verification failed. Target was not activated; original database unchanged.",
        });
        throw error;
      }
    });
  }
  async schedule() {
    await this.ready();
    const settings = await this.db
      .collection(settingsName)
      .findOne({ _id: "daily" });
    return {
      enabled: settings?.enabled === true,
      time: settings?.time || "02:00",
      timezone: "Africa/Lagos",
      lastSuccessfulDate: settings?.lastSuccessfulDate || null,
      reconfigureRequired: settings?.reconfigureRequired === true,
    };
  }
  async configure(enabled, time, passphrase, actor) {
    return this.operation("schedule", actor, async () => {
      if (enabled) {
        passwordCheck(passphrase);
        const protectedValue = await this.protect(passphrase);
        const file = path.join(this.folder, `${this.local.database}.dpapi`);
        await fsp.writeFile(file, protectedValue, { mode: 0o600 });
      }
      await this.db
        .collection(settingsName)
        .updateOne(
          { _id: "daily" },
          { $set: { enabled, time, reconfigureRequired: false } },
          { upsert: true },
        );
      await this.audit("daily_schedule_updated", actor, {
        enabled,
        time,
        timezone: "Africa/Lagos",
      });
      return this.schedule();
    });
  }
  async tick() {
    await this.ready();
    const schedule = await this.schedule();
    const now = dailyDate(this.now());
    if (
      !schedule.enabled ||
      schedule.lastSuccessfulDate === now.date ||
      now.time < schedule.time
    )
      return false;
    try {
      return await this.operation("daily", null, async () => {
        // Recheck after obtaining the cross-process operation lease.
        if ((await this.schedule()).lastSuccessfulDate === now.date)
          return false;
        const protectedValue = await fsp.readFile(
          path.join(this.folder, `${this.local.database}.dpapi`),
          "utf8",
        );
        const passphrase = await this.protect(protectedValue, true);
        const job = await this.createUnlocked(passphrase, null, "daily");
        await this.db
          .collection(settingsName)
          .updateOne(
            { _id: "daily" },
            { $set: { lastSuccessfulDate: now.date, lastBackupId: job._id } },
          );
        return job;
      });
    } catch (error) {
      if (error.status === 409) return false;
      await this.audit("daily_backup_failed", null, {
        message:
          "Automatic backup failed. Check local storage/database and reconfigure the Windows-protected passphrase.",
      });
      throw error;
    }
  }
  start() {
    const run = () => {
      if (this.runningTick) return;
      this.runningTick = this.tick()
        .catch(() =>
          console.error(
            "Automatic local backup failed; review Backup & Recovery audit history.",
          ),
        )
        .finally(() => {
          this.runningTick = null;
        });
    };
    run();
    this.timer = setInterval(run, 60000);
    this.timer.unref();
    return async () => {
      clearInterval(this.timer);
      await this.runningTick;
    };
  }
}
