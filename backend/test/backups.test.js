import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import { spawnSync } from "node:child_process";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import request from "supertest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createApp } from "../src/app.js";
import { User } from "../src/models/User.js";
import { School } from "../src/models/School.js";
import { BackupService } from "../src/services/backups.js";
import {
  localBackupUri,
  assertLocalDatabase,
  dpapi,
} from "../src/services/backupPlatform.js";
import { inspectArchive } from "../src/services/backupArchive.js";
import { readConfig } from "../src/config.js";

const passphrase = "Independent recovery phrase 123!";
const accountPassword = "Backup-admin-password-123!";
let mongo,
  folder,
  client,
  service,
  app,
  config,
  owner,
  admin,
  school,
  backup,
  restored;
const cookie = (user) =>
  `dev_bigi_session=${jwt.sign({ version: 0 }, config.JWT_SECRET, { subject: user.id, issuer: "dev-bigi", audience: "dev-bigi-web", expiresIn: "1h" })}`;
const send = (method, url, body, user = owner) => {
  const agent = request(app);
  return agent[method]("/api/backups" + url)
    .set("Origin", config.FRONTEND_ORIGIN)
    .set("Cookie", cookie(user))
    .send(body);
};
const credentials = () => ({ currentPassword: accountPassword, passphrase });
before(
  async () => {
    mongo = await MongoMemoryReplSet.create({
      replSet: { count: 1 },
      instanceOpts: [{ launchTimeout: 60000 }],
    });
    folder = await fs.mkdtemp(path.join(os.tmpdir(), "school-backup-tests-"));
    config = {
      NODE_ENV: "test",
      JWT_SECRET: "backup-tests-secret-longer-than-32-characters",
      FRONTEND_ORIGIN: "http://localhost:5173",
      MONGODB_URI: mongo.getUri("dev_bigi_school_local"),
      BACKUPS_ENABLED: true,
    };
    await mongoose.connect(config.MONGODB_URI);
    client = mongoose.connection.getClient();
    await Promise.all([School.init(), User.init()]);
    const passwordHash = await bcrypt.hash(accountPassword, 4);
    owner = await User.create({
      name: "Installation Owner",
      email: "owner@backups.test",
      role: "super_admin",
      passwordHash,
    });
    school = await School.create({
      name: "Recovery School",
      address: "1 School Road",
      city: "Lagos",
      country: "Nigeria",
      phone: "08012345678",
      email: "school@example.test",
      schoolType: "Primary",
      createdBy: owner._id,
    });
    admin = await User.create({
      name: "School Admin",
      email: "admin@backups.test",
      role: "school_admin",
      schoolId: school.id,
      passwordHash,
    });
    const db = client.db("dev_bigi_school_local");
    await db.collection("schoollogos").insertOne({
      schoolId: school._id,
      data: new mongoose.mongo.Binary(Buffer.from([0, 1, 2, 255])),
      contentType: "image/png",
    });
    await db
      .collection("retained_custom_records")
      .createIndex(
        { schoolId: 1, reference: 1 },
        { unique: true, name: "permanent_reference" },
      );
    await db.collection("retained_custom_records").insertOne({
      schoolId: school._id,
      reference: "CANCELLED-001",
      status: "cancelled",
      medical: { restricted: "retained safety note" },
      date: new Date("2026-01-01T00:00:00Z"),
      exact: mongoose.mongo.Long.fromString("9223372036854775806"),
      money: mongoose.mongo.Decimal128.fromString("123.45"),
      nested: { active: false, values: [1, null, "two"] },
    });
    const protectedSecrets = new Map();
    service = new BackupService(config, {
      client,
      folder,
      protect: async (value, unlock) => {
        if (unlock) {
          if (!protectedSecrets.has(value)) throw new Error("locked");
          return protectedSecrets.get(value);
        }
        const token = randomUUID();
        protectedSecrets.set(token, value);
        return token;
      },
      now: () => new Date("2026-11-26T04:00:00Z"),
    });
    app = createApp(config, { backups: service });
  },
  { timeout: 90000 },
);
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

test("backup targets reject SRV/remote/non-school URIs before any database command", async () => {
  for (const uri of [
    "mongodb+srv://never-contact.example.test/production",
    "mongodb://example.test:27017/dev_bigi_school_local?replicaSet=x",
    "mongodb://127.0.0.1:27017/production?replicaSet=x",
  ])
    assert.throws(() => localBackupUri(uri));
  let sent = false;
  await assert.rejects(() =>
    assertLocalDatabase(
      {
        options: { srvHost: "never-contact.example.test" },
        db() {
          sent = true;
        },
      },
      config.MONGODB_URI,
    ),
  );
  assert.equal(sent, false);
});

test("enabling backup mode rejects an Atlas URI during configuration, before server connection", () => {
  assert.throws(() =>
    readConfig({
      NODE_ENV: "development",
      MONGODB_URI: "mongodb+srv://never-contact.example.test/production",
      JWT_SECRET: config.JWT_SECRET,
      FRONTEND_ORIGIN: config.FRONTEND_ORIGIN,
      BACKUPS_ENABLED: "true",
    }),
  );
});

test("dotenv cannot replace the selected recovery database with the ordinary local database", async () => {
  const localFile = path.join(folder, "isolated.env");
  await fs.writeFile(
    localFile,
    `MONGODB_URI=${config.MONGODB_URI}\nBACKUPS_ENABLED=false\n`,
  );
  const recoveryUri = config.MONGODB_URI.replace(
    "/dev_bigi_school_local?",
    "/school_recovery_0123456789abcdef01234567?",
  );
  const child = spawnSync(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      "import 'dotenv/config'; process.stdout.write(JSON.stringify({uri:process.env.MONGODB_URI,enabled:process.env.BACKUPS_ENABLED}));",
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      windowsHide: true,
      env: {
        ...process.env,
        MONGODB_URI: recoveryUri,
        BACKUPS_ENABLED: "true",
        DOTENV_CONFIG_PATH: localFile,
        DOTENV_CONFIG_OVERRIDE: "",
        DOTENV_KEY: "",
      },
    },
  );
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout), {
    uri: recoveryUri,
    enabled: "true",
  });
});
test("full backups require installation Super Admin, reauthentication, CSRF and enabled local mode", async () => {
  await send("post", "/", credentials(), admin).expect(403);
  await request(app).get("/api/backups").expect(401);
  await request(app)
    .post("/api/backups")
    .set("Cookie", cookie(owner))
    .send(credentials())
    .expect(403);
  await send("post", "/", {
    ...credentials(),
    currentPassword: "wrong",
  }).expect(403);
  const disabled = createApp({ ...config, BACKUPS_ENABLED: false });
  await request(disabled)
    .get("/api/backups")
    .set("Cookie", cookie(owner))
    .expect(403);
});
test("full encrypted snapshot includes all accounts, retained unknown collections, logo bytes and indexes", async () => {
  const res = await send("post", "/", credentials()).expect(201);
  backup = res.body.backup;
  const file = await fs.readFile(service.file(backup._id));
  assert.equal(file.subarray(0, 10).toString(), "SCHOOLBK1\n");
  for (const secret of [
    school.name,
    owner.email,
    "retained safety note",
    passphrase,
  ])
    assert(!file.includes(Buffer.from(secret)));
  assert(
    backup.manifest.collections.some(
      (c) => c.name === "users" && c.count === 2,
    ),
  );
  assert(
    backup.manifest.collections.some(
      (c) => c.name === "schoollogos" && c.count === 1,
    ),
  );
  assert(
    backup.manifest.collections.some(
      (c) => c.name === "retained_custom_records" && c.count === 1,
    ),
  );
  const inspected = await send(
    "post",
    `/${backup._id}/inspect`,
    credentials(),
  ).expect(200);
  assert.equal(inspected.body.manifest.schools[0].id, school.id);
});
test("download and PDF summary are authenticated and have complete encryption/integrity metadata", async () => {
  const download = await request(app)
    .get(`/api/backups/${backup._id}/download`)
    .set("Cookie", cookie(owner))
    .expect(200);
  assert.match(download.headers["content-disposition"], /\.schoolbackup/);
  await request(app)
    .get(`/api/backups/${backup._id}/download`)
    .set("Cookie", cookie(admin))
    .expect(403);
  const pdf = await request(app)
    .get(`/api/backups/${backup._id}/summary.pdf`)
    .set("Cookie", cookie(owner))
    .expect(200)
    .expect("Content-Type", /application\/pdf/);
  assert.equal(pdf.body.subarray(0, 8).toString(), "%PDF-1.4");
  assert(pdf.body.includes(Buffer.from("Recovery School")));
  assert(pdf.body.includes(Buffer.from(backup.sha256)));
  assert(!pdf.body.includes(Buffer.from(passphrase)));
});
test("wrong recovery phrase, truncated/corrupt files and wrong school identities fail before restoration", async () => {
  await send("post", `/${backup._id}/inspect`, {
    ...credentials(),
    passphrase: "Definitely incorrect passphrase",
  }).expect(400);
  await send("post", `/${backup._id}/restore`, {
    ...credentials(),
    schoolIds: [new mongoose.Types.ObjectId().toString()],
    confirmation: "RESTORE",
    reason: "Identity rejection test",
  }).expect(409);
  const bytes = await fs.readFile(service.file(backup._id));
  const corrupt = Buffer.from(bytes);
  corrupt[corrupt.length - 1] ^= 1;
  const imported = await send("post", "/upload", corrupt)
    .set("Content-Type", "application/octet-stream")
    .expect(201);
  await send(
    "post",
    `/${imported.body.backup._id}/inspect`,
    credentials(),
  ).expect(400);
  await assert.rejects(() =>
    inspectArchive(service.file(backup._id), "wrong but long enough phrase"),
  );
  assert.equal(
    (await client.db("admin").admin().listDatabases()).databases.filter((d) =>
      d.name.startsWith("school_recovery_"),
    ).length,
    0,
  );
});
test("actual recovery creates a separate local database and pre-restore backup without overwriting the source", async () => {
  await client
    .db("dev_bigi_school_local")
    .collection("retained_custom_records")
    .updateOne({ reference: "CANCELLED-001" }, { $set: { afterBackup: true } });
  const r = await send("post", `/${backup._id}/restore`, {
    ...credentials(),
    schoolIds: [school.id],
    confirmation: "RESTORE",
    reason: "Verified isolated recovery drill",
  }).expect(201);
  restored = r.body.recovery;
  assert.match(restored.targetDatabase, /^school_recovery_[a-f0-9]{24}$/);
  const target = client.db(restored.targetDatabase);
  assert.equal(
    (await target.collection("users").findOne({ _id: owner._id }))
      .sessionVersion,
    1,
  );
  assert(
    await bcrypt.compare(
      accountPassword,
      (await target.collection("users").findOne({ _id: owner._id }))
        .passwordHash,
    ),
  );
  const retained = await target
    .collection("retained_custom_records")
    .findOne({ reference: "CANCELLED-001" });
  assert.equal(retained.status, "cancelled");
  assert.equal(retained.afterBackup, undefined);
  assert.equal(retained.exact.toString(), "9223372036854775806");
  assert.equal(retained.money.toString(), "123.45");
  assert.deepEqual(
    (await target.collection("schoollogos").findOne()).data.buffer,
    Buffer.from([0, 1, 2, 255]),
  );
  assert(
    (await target.collection("retained_custom_records").indexes()).some(
      (i) => i.name === "permanent_reference" && i.unique,
    ),
  );
  assert.equal(
    (
      await client
        .db("dev_bigi_school_local")
        .collection("retained_custom_records")
        .findOne()
    ).afterBackup,
    true,
  );
  assert.equal(
    (await service.job(restored.preRestoreBackupId)).kind,
    "pre-restore",
  );
  assert.equal(
    (await service.job(restored.preRestoreBackupId)).status,
    "complete",
  );
  assert.equal(
    (await target.collection("_backupSettings").findOne({ _id: "daily" }))
      .enabled,
    false,
  );
  assert(
    await target.collection("_recoveryProof").findOne({ _id: "verified" }),
  );
});
test("portable upload can be inspected and restored with matching school identity", async () => {
  const imported = await send(
    "post",
    "/upload",
    await fs.readFile(service.file(backup._id)),
  )
    .set("Content-Type", "application/octet-stream")
    .expect(201);
  await send(
    "post",
    `/${imported.body.backup._id}/inspect`,
    credentials(),
  ).expect(200);
  const r = await send("post", `/${imported.body.backup._id}/restore`, {
    ...credentials(),
    schoolIds: [school.id],
    confirmation: "RESTORE",
    reason: "Portable backup recovery test",
  }).expect(201);
  assert.equal(
    (
      await client
        .db(r.body.recovery.targetDatabase)
        .collection("schools")
        .findOne()
    ).name,
    school.name,
  );
});

test(
  "encrypted transfer restores onto a second independent local MongoDB server with a different database owner",
  { timeout: 90000 },
  async () => {
    const second = await MongoMemoryReplSet.create({
      replSet: { count: 1 },
      instanceOpts: [{ launchTimeout: 60000 }],
    });
    const secondClient = new mongoose.mongo.MongoClient(
      second.getUri("dev_bigi_school_local"),
    );
    try {
      await secondClient.connect();
      const destinationFolder = await fs.mkdtemp(
        path.join(os.tmpdir(), "school-backup-transfer-"),
      );
      const destination = new BackupService(
        { ...config, MONGODB_URI: second.getUri("dev_bigi_school_local") },
        { client: secondClient, folder: destinationFolder },
      );
      const actor = {
        id: new mongoose.Types.ObjectId().toString(),
        name: "New Computer Owner",
      };
      const upload = await destination.upload(
        Readable.from([await fs.readFile(service.file(backup._id))]),
        actor,
      );
      const result = await destination.restore(
        upload._id,
        passphrase,
        [school.id],
        actor,
        "Transfer onto another local computer",
      );
      const db = secondClient.db(result.targetDatabase);
      assert.equal(
        (await db.collection("schools").findOne()).name,
        school.name,
      );
      assert(
        await bcrypt.compare(
          accountPassword,
          (await db.collection("users").findOne({ _id: owner._id }))
            .passwordHash,
        ),
      );
      assert.equal(
        (await destination.job(result.preRestoreBackupId)).status,
        "complete",
      );
    } finally {
      await secondClient.close();
      await second.stop();
    }
  },
);

test("another school's installation refuses recovery before creating a pre-restore backup", async () => {
  const foreignId = new mongoose.Types.ObjectId();
  await service.db
    .collection("schools")
    .insertOne({ _id: foreignId, name: "Foreign School" });
  const before = await service.db
    .collection("_backupHistory")
    .countDocuments({ kind: "pre-restore" });
  try {
    await assert.rejects(
      () =>
        service.restore(
          backup._id,
          passphrase,
          [school.id],
          owner,
          "Must reject foreign identity",
        ),
      (e) => e.status === 409,
    );
  } finally {
    await service.db.collection("schools").deleteOne({ _id: foreignId });
  }
  assert.equal(
    await service.db
      .collection("_backupHistory")
      .countDocuments({ kind: "pre-restore" }),
    before,
  );
});

test("a recovered installation can be backed up and recovered again without stale proof/lock conflicts", async () => {
  const uri = config.MONGODB_URI.replace(
    "/dev_bigi_school_local?",
    `/${restored.targetDatabase}?`,
  );
  const recoveredClient = new mongoose.mongo.MongoClient(uri);
  await recoveredClient.connect();
  try {
    const recoveredFolder = await fs.mkdtemp(
      path.join(os.tmpdir(), "school-backup-repeat-"),
    );
    const recovered = new BackupService(
      { ...config, MONGODB_URI: uri },
      { client: recoveredClient, folder: recoveredFolder },
    );
    const copy = await recovered.create(passphrase, owner);
    const result = await recovered.restore(
      copy._id,
      passphrase,
      [school.id],
      owner,
      "Repeat recovery drill",
    );
    assert.equal(
      (
        await recoveredClient
          .db(result.targetDatabase)
          .collection("_recoveryProof")
          .findOne({ _id: "verified" })
      ).backupId,
      copy._id,
    );
  } finally {
    await recoveredClient.close();
  }
});
test("automatic daily backup persists its schedule, catches up and runs only once per local date", async () => {
  await send("put", "/schedule", {
    ...credentials(),
    enabled: true,
    time: "02:00",
  }).expect(200);
  const first = await service.tick();
  assert.equal(first.kind, "daily");
  assert.equal(await service.tick(), false);
  const restartedScheduler = new BackupService(config, {
    client,
    folder,
    protect: service.protect,
    now: service.now,
  });
  assert.equal(await restartedScheduler.tick(), false);
  const settings = await service.schedule();
  assert.equal(settings.lastSuccessfulDate, "2026-11-26");
  assert(
    !JSON.stringify(
      await service.db.collection("_backupSettings").findOne(),
    ).includes(passphrase),
  );
  service.now = () => new Date("2026-11-27T04:00:00Z");
  assert.equal((await service.tick()).kind, "daily");
  await service.configure(false, "02:00", "", owner);
  assert.equal(await service.tick(), false);
});
test("audit and operation history retain recovery, pre-backup, download, failures and scheduler provenance without secrets", async () => {
  const result = await request(app)
    .get("/api/backups")
    .set("Cookie", cookie(owner))
    .expect(200);
  for (const action of [
    "backup_started",
    "backup_completed",
    "restore_completed",
    "backup_integrity_verified",
    "backup_downloaded",
    "backup_summary_downloaded",
    "backup_reauthentication_failed",
    "daily_schedule_updated",
  ])
    assert(
      result.body.audit.some((e) => e.action === action),
      action,
    );
  assert(result.body.backups.some((b) => b.kind === "daily"));
  assert(result.body.backups.some((b) => b.kind === "pre-restore"));
  assert(!JSON.stringify(result.body).includes(passphrase));
  assert(!JSON.stringify(result.body).includes(accountPassword));
});

test("overlapping manual backup requests cannot bypass the cross-process operation lease", async () => {
  const attempts = await Promise.allSettled([
    service.create(passphrase, owner),
    service.create(passphrase, owner),
  ]);
  assert.equal(attempts.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    attempts.find((r) => r.status === "rejected").reason.status,
    409,
  );
});
test(
  "Windows DPAPI protects and unlocks an automatic-backup recovery phrase",
  { skip: process.platform !== "win32" },
  async () => {
    const unicodePhrase = "Independent Ọlá recovery 😀 phrase 123!";
    const encrypted = await dpapi(unicodePhrase);
    assert.notEqual(encrypted, unicodePhrase);
    assert.equal(await dpapi(encrypted, true), unicodePhrase);
  },
);

test(
  "automatic backup uses the real Windows-protected phrase to produce a restorable encrypted file",
  { skip: process.platform !== "win32" },
  async () => {
    const automatic = new BackupService(config, {
      client,
      folder,
      now: () => new Date("2026-11-28T04:00:00Z"),
    });
    await automatic.configure(true, "02:00", passphrase, owner);
    try {
      const stop = automatic.start();
      await stop();
      const daily = (await automatic.history()).find(
        (job) =>
          job.kind === "daily" &&
          job.createdAt.toISOString().startsWith("2026-11-28"),
      );
      assert.equal(daily.kind, "daily");
      assert.equal(
        (await automatic.inspect(daily._id, passphrase, owner)).schools[0].id,
        school.id,
      );
      assert.equal(await automatic.tick(), false);
    } finally {
      await automatic.configure(false, "02:00", "", owner);
    }
  },
);
