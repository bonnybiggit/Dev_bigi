import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import request from "supertest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import express from "express";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createApp } from "../src/app.js";
import { User } from "../src/models/User.js";
import { School } from "../src/models/School.js";
import { desktopGateway } from "../src/services/desktopGateway.js";

const config = {
  NODE_ENV: "test",
  DESKTOP_MODE: true,
  JWT_SECRET: "desktop-test-secret-longer-than-32-characters",
  FRONTEND_ORIGIN: "http://localhost:5173",
};
const body = {
  mode: "school",
  owner: {
    name: "Preview Owner",
    email: "owner@desktop.test",
    password: "Owner-password-123!",
  },
  administrator: {
    name: "Preview Administrator",
    email: "admin@desktop.test",
    password: "Administrator-password-123!",
  },
  school: {
    name: "Independent Preview School",
    address: "1 Preview Road",
    city: "Lagos",
    country: "Nigeria",
    phone: "08012345678",
    email: "school@desktop.test",
    schoolType: "Primary",
    logoUrl: "",
  },
};
let mongo, app, ownerAgent, schoolAgent;
const send = (client, method, url, data) =>
  client[method](url).set("Origin", config.FRONTEND_ORIGIN).send(data);
before(
  async () => {
    mongo = await MongoMemoryReplSet.create({
      replSet: { count: 1 },
      instanceOpts: [{ launchTimeout: 60000 }],
    });
    await mongoose.connect(mongo.getUri("desktop_tests"));
    await Promise.all([School.init(), User.init()]);
    app = createApp(config);
  },
  { timeout: 90000 },
);
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

test("new desktop installations contain no accounts or schools and expose first-run status", async () => {
  assert.equal(await User.countDocuments(), 0);
  assert.equal(await School.countDocuments(), 0);
  const r = await request(app).get("/api/desktop/setup").expect(200);
  assert.equal(r.body.setupRequired, true);
});
test("first-run endpoints are disabled in ordinary web mode", async () => {
  await request(createApp({ ...config, DESKTOP_MODE: false }))
    .get("/api/desktop/setup")
    .expect(404);
});
test("registration rejects tenant/role injection, weak credentials, same emails and missing origin", async () => {
  await send(request(app), "post", "/api/desktop/setup", {
    ...body,
    role: "super_admin",
  }).expect(400);
  await send(request(app), "post", "/api/desktop/setup", {
    ...body,
    owner: { ...body.owner, password: "short" },
  }).expect(400);
  await send(request(app), "post", "/api/desktop/setup", {
    ...body,
    administrator: { ...body.administrator, email: body.owner.email },
  }).expect(400);
  await request(app).post("/api/desktop/setup").send(body).expect(403);
  assert.equal(await User.countDocuments(), 0);
});
test("simultaneous first-run submissions create exactly one school and two privately hashed user-selected accounts", async () => {
  const results = await Promise.all([
    send(request(app), "post", "/api/desktop/setup", body),
    send(request(app), "post", "/api/desktop/setup", body),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409]);
  assert.equal(await School.countDocuments(), 1);
  assert.equal(await User.countDocuments(), 2);
  for (const account of [body.owner, body.administrator]) {
    const user = await User.findOne({ email: account.email }).select(
      "+passwordHash",
    );
    assert(await bcrypt.compare(account.password, user.passwordHash));
    assert.notEqual(user.passwordHash, account.password);
  }
  const school = await School.findOne();
  const admin = await User.findOne({ role: "school_admin" });
  assert.equal(String(admin.schoolId), school.id);
  assert.equal(
    (await request(app).get("/api/desktop/setup")).body.setupRequired,
    false,
  );
  await send(request(app), "post", "/api/desktop/setup", body).expect(409);
});
test("independently registered owner and school administrator sign in with correct roles", async () => {
  ownerAgent = request.agent(app);
  schoolAgent = request.agent(app);
  const owner = await send(ownerAgent, "post", "/api/auth/login", {
    email: body.owner.email,
    password: body.owner.password,
  }).expect(200);
  assert.equal(owner.body.user.role, "super_admin");
  const admin = await send(schoolAgent, "post", "/api/auth/school-login", {
    email: body.administrator.email,
    password: body.administrator.password,
  }).expect(200);
  assert.equal(admin.body.user.role, "school_admin");
  assert.equal(admin.body.school.name, body.school.name);
});
test("desktop recovery activation requires owner reauthentication and matching completed school proof", async () => {
  const database = `school_recovery_${new mongoose.Types.ObjectId()}`;
  await send(schoolAgent, "post", "/api/desktop/activate-recovery", {
    database,
    password: body.administrator.password,
  }).expect(403);
  await send(ownerAgent, "post", "/api/desktop/activate-recovery", {
    database,
    password: "wrong",
  }).expect(403);
  await send(ownerAgent, "post", "/api/desktop/activate-recovery", {
    database,
    password: body.owner.password,
  }).expect(409);
  const target = mongoose.connection.getClient().db(database),
    school = await School.findOne();
  await target
    .collection("schools")
    .insertOne({ _id: school._id, name: school.name });
  await target
    .collection("users")
    .insertOne({ role: "super_admin", isActive: true });
  await target.collection("_recoveryProof").insertOne({
    _id: "verified",
    targetDatabase: database,
    schoolIds: [school.id],
  });
  await send(ownerAgent, "post", "/api/desktop/activate-recovery", {
    database,
    password: body.owner.password,
  }).expect(200);
  await target
    .collection("schools")
    .updateOne({ _id: school._id }, { $set: { _id: school._id } });
  await target
    .collection("_recoveryProof")
    .updateOne(
      { _id: "verified" },
      { $set: { schoolIds: [new mongoose.Types.ObjectId().toString()] } },
    );
  await send(ownerAgent, "post", "/api/desktop/activate-recovery", {
    database,
    password: body.owner.password,
  }).expect(409);
});
test("loopback gateway rejects outside browser clients, forged Host/Origin and missing/incorrect launch tokens", async () => {
  // Windows installations may have a hidden parent directory. sendFile must
  // interpret dotfile restrictions relative to the frontend root.
  const frontend = await fs.mkdtemp(
    path.join(os.tmpdir(), ".desktop-gateway-"),
  );
  await fs.writeFile(
    path.join(frontend, "index.html"),
    "<h1>Bundled school frontend</h1>",
  );
  await fs.writeFile(path.join(frontend, ".env"), "NEVER_SERVE");
  const api = express();
  api.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  let handler;
  const server = http.createServer((req, res) => handler(req, res));
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const origin = `http://127.0.0.1:${server.address().port}`,
    token = "a".repeat(64);
  handler = desktopGateway({ origin, token, frontend, api });
  try {
    await request(server).get("/api/health").expect(403);
    await request(server)
      .get("/api/health")
      .set("X-Desktop-Token", "incorrect")
      .expect(403);
    await request(server)
      .get("/api/health")
      .set("X-Desktop-Token", token)
      .set("Host", "evil.example.test")
      .expect(403);
    await request(server)
      .get("/api/health")
      .set("X-Desktop-Token", token)
      .set("Origin", "https://evil.example.test")
      .expect(403);
    await request(server)
      .get("/api/health")
      .set("X-Desktop-Token", token)
      .expect(200);
    const page = await request(server)
      .get("/school/profile")
      .set("X-Desktop-Token", token)
      .expect(200);
    assert.match(page.headers["content-security-policy"], /script-src 'self'/);
    const secret = await request(server)
      .get("/.env")
      .set("X-Desktop-Token", token);
    assert.notEqual(secret.status, 200);
    assert(!secret.text.includes("NEVER_SERVE"));
  } finally {
    await new Promise((r) => server.close(r));
  }
});
test("a fresh recovery-only installation registers no invented school or teacher/student accounts", async () => {
  await mongoose.disconnect();
  await mongoose.connect(mongo.getUri("desktop_recovery_setup"));
  const recoveryApp = createApp(config);
  await send(request(recoveryApp), "post", "/api/desktop/setup", {
    mode: "recovery",
    owner: body.owner,
  }).expect(201);
  assert.equal(await School.countDocuments(), 0);
  assert.equal(await User.countDocuments(), 1);
  assert.equal((await User.findOne()).role, "super_admin");
});
