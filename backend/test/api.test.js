import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { createApp } from "../src/app.js";
import { User } from "../src/models/User.js";
import { School } from "../src/models/School.js";
import { seedSuperAdmin } from "../src/services/seedSuperAdmin.js";
let mongo, app, agent, schoolId;
const config = {
  NODE_ENV: "test",
  JWT_SECRET: "test-only-secret-with-more-than-32-characters",
  FRONTEND_ORIGIN: "http://localhost:5173",
};
const credentials = {
  SUPER_ADMIN_NAME: "Test Admin",
  SUPER_ADMIN_EMAIL: "admin@example.test",
  SUPER_ADMIN_PASSWORD: "Test-only-password-934!",
};
const post = (path) => agent.post(path).set("Origin", config.FRONTEND_ORIGIN);
before(
  async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    await Promise.all([User.init(), School.init()]);
    app = createApp(config);
    agent = request.agent(app);
  },
  { timeout: 900000 },
);
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});
test("health reports database connection", async () => {
  const res = await request(app).get("/api/health");
  assert.equal(res.status, 200);
  assert.equal(res.body.database, "connected");
});
test("seed is idempotent and stores only a bcrypt hash", async () => {
  assert.deepEqual(await seedSuperAdmin(credentials), { created: true });
  const original = await User.findOne().select("+passwordHash");
  assert.notEqual(original.passwordHash, credentials.SUPER_ADMIN_PASSWORD);
  assert.equal(
    await bcrypt.compare(
      credentials.SUPER_ADMIN_PASSWORD,
      original.passwordHash,
    ),
    true,
  );
  assert.deepEqual(
    await seedSuperAdmin({
      ...credentials,
      SUPER_ADMIN_PASSWORD: "Another-password-123!",
    }),
    { created: false },
  );
  assert.equal(await User.countDocuments(), 1);
  assert.equal(
    (await User.findOne().select("+passwordHash")).passwordHash,
    original.passwordHash,
  );
});
test("unauthenticated access and untrusted origins are rejected", async () => {
  assert.equal((await request(app).get("/api/schools")).status, 401);
  assert.equal(
    (await request(app).post("/api/auth/login").send({})).status,
    403,
  );
  assert.equal(
    (
      await request(app)
        .post("/api/auth/logout")
        .set("Origin", "https://evil.test")
    ).status,
    403,
  );
});
test("login rejects invalid data and wrong credentials", async () => {
  assert.equal(
    (await post("/api/auth/login").send({ email: "bad", password: "abc" }))
      .status,
    400,
  );
  assert.equal(
    (
      await post("/api/auth/login").send({
        email: credentials.SUPER_ADMIN_EMAIL,
        password: "incorrect",
      })
    ).status,
    401,
  );
});
test("login sets HttpOnly cookie and /me omits password", async () => {
  const res = await post("/api/auth/login").send({
    email: credentials.SUPER_ADMIN_EMAIL,
    password: credentials.SUPER_ADMIN_PASSWORD,
  });
  assert.equal(res.status, 200);
  assert.match(res.headers["set-cookie"][0], /HttpOnly/);
  assert.match(res.headers["set-cookie"][0], /SameSite=Strict/);
  assert.equal(res.body.user.passwordHash, undefined);
  assert.equal((await agent.get("/api/auth/me")).body.user.role, "super_admin");
});
test("registers sample, validates payload, prevents duplicate and mass assignment", async () => {
  const sample = {
    name: "Bright Future International School",
    city: "Lagos",
    country: "Nigeria",
    schoolType: "Nursery and Primary",
  };
  assert.equal(
    (await post("/api/schools").send({ ...sample, status: "suspended" }))
      .status,
    400,
  );
  assert.equal(
    (await post("/api/schools").send({ ...sample, name: "" })).status,
    400,
  );
  const res = await post("/api/schools").send(sample);
  assert.equal(res.status, 201);
  schoolId = res.body.school._id;
  assert.equal(res.body.school.status, "active");
  assert.equal(
    (
      await post("/api/schools").send({
        ...sample,
        name: sample.name.toLowerCase(),
      })
    ).status,
    409,
  );
});
test("search treats regex literally and stats reflect database", async () => {
  assert.equal((await agent.get("/api/schools?search=Lagos")).body.total, 1);
  assert.equal((await agent.get("/api/schools?search=.*")).body.total, 0);
  assert.equal((await agent.get("/api/schools?limit=999")).status, 400);
  assert.deepEqual((await agent.get("/api/schools/stats")).body, {
    totalSchools: 1,
    activeSchools: 1,
    suspendedSchools: 0,
    totalUsers: 1,
  });
});
test("school details and status changes validate IDs and status", async () => {
  assert.equal((await agent.get(`/api/schools/${schoolId}`)).status, 200);
  assert.equal((await agent.get("/api/schools/bad")).status, 400);
  assert.equal(
    (await agent.get("/api/schools/000000000000000000000000")).status,
    404,
  );
  const patch = (status) =>
    agent
      .patch(`/api/schools/${schoolId}/status`)
      .set("Origin", config.FRONTEND_ORIGIN)
      .send({ status });
  assert.equal((await patch("invalid")).status, 400);
  assert.equal((await patch("suspended")).body.school.status, "suspended");
  assert.equal(
    (await agent.get("/api/schools/stats")).body.suspendedSchools,
    1,
  );
  assert.equal((await patch("active")).body.school.status, "active");
});
test("school accounts require tenant and cannot access platform routes or login", async () => {
  await assert.rejects(
    User.create({
      name: "Invalid",
      email: "invalid@example.test",
      passwordHash: "test",
      role: "school_admin",
    }),
  );
  const user = await User.create({
    name: "School Admin",
    email: "school@example.test",
    passwordHash: await bcrypt.hash("School-password-123!", 4),
    role: "school_admin",
    schoolId,
  });
  const token = jwt.sign({}, config.JWT_SECRET, {
    subject: user.id,
    issuer: "dev-bigi",
    audience: "dev-bigi-web",
    expiresIn: "1h",
  });
  for (const path of ["/api/schools", "/api/schools/stats"])
    assert.equal(
      (await request(app).get(path).set("Cookie", `dev_bigi_session=${token}`))
        .status,
      403,
    );
  assert.equal(
    (
      await request(app)
        .post("/api/schools")
        .set("Origin", config.FRONTEND_ORIGIN)
        .set("Cookie", `dev_bigi_session=${token}`)
        .send({})
    ).status,
    403,
  );
  assert.equal(
    (
      await request(app)
        .patch(`/api/schools/${schoolId}/status`)
        .set("Origin", config.FRONTEND_ORIGIN)
        .set("Cookie", `dev_bigi_session=${token}`)
        .send({ status: "suspended" })
    ).status,
    403,
  );
  assert.equal(
    (
      await post("/api/auth/login").send({
        email: user.email,
        password: "School-password-123!",
      })
    ).status,
    401,
  );
  await assert.rejects(
    seedSuperAdmin({ ...credentials, SUPER_ADMIN_EMAIL: user.email }),
  );
  await School.findByIdAndUpdate(schoolId, { status: "suspended" });
  assert.equal(
    (
      await request(app)
        .get("/api/auth/me")
        .set("Cookie", `dev_bigi_session=${token}`)
    ).status,
    403,
  );
});
test("production cookie is secure; logout clears session and disabled accounts lose access", async () => {
  const prod = request(createApp({ ...config, NODE_ENV: "production" }));
  const res = await prod
    .post("/api/auth/login")
    .set("Origin", config.FRONTEND_ORIGIN)
    .send({
      email: credentials.SUPER_ADMIN_EMAIL,
      password: credentials.SUPER_ADMIN_PASSWORD,
    });
  assert.match(res.headers["set-cookie"][0], /Secure/);
  await User.updateOne(
    { email: credentials.SUPER_ADMIN_EMAIL },
    { isActive: false },
  );
  assert.equal((await agent.get("/api/auth/me")).status, 401);
  assert.equal((await post("/api/auth/logout")).status, 204);
  assert.equal((await agent.get("/api/auth/me")).status, 401);
});
