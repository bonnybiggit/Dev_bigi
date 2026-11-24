import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import request from "supertest";
import bcrypt from "bcrypt";
import { createApp } from "../src/app.js";
import { School } from "../src/models/School.js";
import { User } from "../src/models/User.js";

const config = {
  NODE_ENV: "test",
  JWT_SECRET: "test-only-secret-at-least-32-characters",
  FRONTEND_ORIGIN: "http://localhost:5173",
};
const input = {
  name: "Bright Future Administrator",
  email: "bright@example.test",
  phone: "+234 801 234 5678",
};
const newPassword = "My-new-private-password-123!";
let mongo,
  app,
  superAgent,
  schoolAgent,
  school,
  otherSchool,
  adminId,
  otherAdmin,
  temporaryPassword,
  oldCookie;
const mutation = (agent, method, path, body) =>
  agent[method](path).set("Origin", config.FRONTEND_ORIGIN).send(body);
const adminPath = () => `/api/schools/${school.id}/administrators`;
const login = (agent, password) =>
  mutation(agent, "post", "/api/auth/school-login", {
    email: input.email,
    password,
  });

before(
  async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    await Promise.all([User.init(), School.init()]);
    const owner = await User.create({
      name: "Platform Admin",
      email: "platform@example.test",
      role: "super_admin",
      passwordHash: await bcrypt.hash("Platform-password-123!", 4),
    });
    school = await School.create({
      name: "Bright Future International School",
      city: "Lagos",
      country: "Nigeria",
      schoolType: "Nursery and Primary",
      createdBy: owner._id,
    });
    otherSchool = await School.create({
      name: "Other School",
      city: "Abuja",
      country: "Nigeria",
      schoolType: "Primary",
      createdBy: owner._id,
    });
    otherAdmin = await User.create({
      name: "Other Administrator",
      email: "other@example.test",
      role: "school_admin",
      schoolId: otherSchool._id,
      passwordHash: await bcrypt.hash("Other-password-123!", 4),
    });
    app = createApp(config);
    superAgent = request.agent(app);
    schoolAgent = request.agent(app);
    assert.equal(
      (
        await mutation(superAgent, "post", "/api/auth/login", {
          email: owner.email,
          password: "Platform-password-123!",
        })
      ).status,
      200,
    );
  },
  { timeout: 900000 },
);
after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

test("Super Admin creates school admin with generated password, hash and tenant", async () => {
  const res = await mutation(superAgent, "post", adminPath(), input);
  assert.equal(res.status, 201);
  adminId = res.body.administrator.id;
  temporaryPassword = res.body.temporaryPassword;
  assert.match(temporaryPassword, /^[A-Za-z0-9_-]{32}$/);
  assert.equal(res.body.administrator.schoolId, school.id);
  assert.equal(res.body.administrator.role, "school_admin");
  assert.equal(res.body.administrator.mustChangePassword, true);
  assert.equal(res.body.administrator.phone, input.phone);
  assert.equal(res.body.administrator.passwordHash, undefined);
  const user = await User.findById(adminId).select("+passwordHash");
  assert.equal(
    await bcrypt.compare(temporaryPassword, user.passwordHash),
    true,
  );
  assert.equal(JSON.stringify(user).includes(temporaryPassword), false);
  const list = await superAgent.get(adminPath());
  assert.equal(list.body.administrators.length, 1);
  assert.equal(JSON.stringify(list.body).includes(temporaryPassword), false);
  assert.equal(list.body.administrators[0].passwordHash, undefined);
  assert.equal(list.body.administrators[0].sessionVersion, undefined);
});

test("administrator creation validates school and input, rejects duplicate emails across tenants", async () => {
  assert.equal(
    (
      await mutation(superAgent, "post", adminPath(), {
        ...input,
        email: input.email.toUpperCase(),
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await mutation(
        superAgent,
        "post",
        `/api/schools/${otherSchool.id}/administrators`,
        input,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await mutation(superAgent, "post", adminPath(), {
        ...input,
        schoolId: otherSchool.id,
        role: "super_admin",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await mutation(superAgent, "post", adminPath(), {
        ...input,
        phone: "invalid",
      })
    ).status,
    400,
  );
  assert.equal(
    (await mutation(superAgent, "post", adminPath(), { ...input, name: "" }))
      .status,
    400,
  );
  assert.equal(
    (
      await mutation(
        superAgent,
        "post",
        "/api/schools/000000000000000000000000/administrators",
        input,
      )
    ).status,
    404,
  );
  assert.equal((await request(app).get(adminPath())).status, 401);
});

test("school admin login uses HttpOnly cookie and forces password change on backend", async () => {
  const res = await login(schoolAgent, temporaryPassword);
  assert.equal(res.status, 200);
  oldCookie = res.headers["set-cookie"][0].split(";")[0];
  assert.match(res.headers["set-cookie"][0], /HttpOnly/);
  assert.equal(res.body.user.mustChangePassword, true);
  assert.equal((await schoolAgent.get("/api/auth/me")).status, 200);
  assert.equal(
    (await schoolAgent.get("/api/school/dashboard")).body.code,
    "PASSWORD_CHANGE_REQUIRED",
  );
  assert.equal(
    (await schoolAgent.get(`/api/school/administrators/${adminId}`)).status,
    403,
  );
  assert.equal(
    (
      await mutation(request(app), "post", "/api/auth/login", {
        email: input.email,
        password: temporaryPassword,
      })
    ).status,
    401,
  );
});

test("first-login change validates current/new passwords and rejects mass assignment", async () => {
  const change = (body) =>
    mutation(schoolAgent, "post", "/api/auth/change-password", body);
  assert.equal(
    (await change({ currentPassword: "wrong", newPassword })).status,
    400,
  );
  assert.equal(
    (await change({ currentPassword: temporaryPassword, newPassword: "short" }))
      .status,
    400,
  );
  assert.equal(
    (
      await change({
        currentPassword: temporaryPassword,
        newPassword: "🔑".repeat(30),
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await change({
        currentPassword: temporaryPassword,
        newPassword: temporaryPassword,
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await change({
        currentPassword: temporaryPassword,
        newPassword,
        role: "super_admin",
      })
    ).status,
    400,
  );
  assert.equal((await schoolAgent.get("/api/school/dashboard")).status, 403);
  const res = await change({ currentPassword: temporaryPassword, newPassword });
  assert.equal(res.status, 200);
  assert.equal(res.body.user.mustChangePassword, false);
  assert.equal((await schoolAgent.get("/api/school/dashboard")).status, 200);
  assert.equal(
    (await request(app).get("/api/auth/me").set("Cookie", oldCookie)).status,
    401,
  );
  assert.equal((await login(request(app), temporaryPassword)).status, 401);
  assert.equal((await login(schoolAgent, newPassword)).status, 200);
});

test("school admin cannot access Super Admin routes or create/elevate users", async () => {
  for (const path of [
    "/api/schools",
    "/api/schools/stats",
    adminPath(),
    `/api/schools/${otherSchool.id}`,
  ])
    assert.equal((await schoolAgent.get(path)).status, 403);
  assert.equal(
    (
      await mutation(schoolAgent, "post", adminPath(), {
        ...input,
        role: "super_admin",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await mutation(schoolAgent, "patch", `/api/schools/${school.id}/status`, {
        status: "suspended",
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await mutation(schoolAgent, "patch", `${adminPath()}/${adminId}/status`, {
        isActive: true,
      })
    ).status,
    403,
  );
});

test("school records and real dashboard statistics are strictly tenant-scoped", async () => {
  await User.create({
    name: "Pending Admin",
    email: "pending@example.test",
    role: "school_admin",
    schoolId: school._id,
    isActive: false,
    mustChangePassword: true,
    passwordHash: await bcrypt.hash("Pending-password-123!", 4),
  });
  const res = await schoolAgent.get("/api/school/dashboard");
  assert.equal(res.status, 200);
  assert.equal(res.body.school.id, school.id);
  assert.deepEqual(res.body.stats, {
    totalAdministrators: 2,
    activeAdministrators: 1,
    inactiveAdministrators: 1,
    pendingPasswordChanges: 1,
  });
  assert.equal(
    (await schoolAgent.get(`/api/school/administrators/${adminId}`)).status,
    200,
  );
  assert.equal(
    (await schoolAgent.get(`/api/school/administrators/${otherAdmin.id}`))
      .status,
    404,
  );
  assert.equal(
    (await schoolAgent.get(`/api/school/dashboard?schoolId=${otherSchool.id}`))
      .status,
    400,
  );
  assert.equal(
    (
      await mutation(
        superAgent,
        "patch",
        `${adminPath()}/${otherAdmin.id}/status`,
        { isActive: false },
      )
    ).status,
    404,
  );
  assert.equal((await User.findById(otherAdmin.id)).isActive, true);
  assert.equal((await superAgent.get("/api/school/dashboard")).status, 403);
});

test("Super Admin can deactivate/reactivate accounts; old sessions stay revoked", async () => {
  const cookie = (await login(request(app), newPassword)).headers[
    "set-cookie"
  ][0].split(";")[0];
  assert.equal(
    (
      await mutation(superAgent, "patch", `${adminPath()}/${adminId}/status`, {
        isActive: "false",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await mutation(superAgent, "patch", `${adminPath()}/${adminId}/status`, {
        isActive: false,
      })
    ).body.administrator.isActive,
    false,
  );
  assert.equal((await schoolAgent.get("/api/auth/me")).status, 401);
  assert.equal((await login(request(app), newPassword)).status, 401);
  assert.equal(
    (
      await mutation(superAgent, "patch", `${adminPath()}/${adminId}/status`, {
        isActive: true,
      })
    ).body.administrator.isActive,
    true,
  );
  assert.equal(
    (await request(app).get("/api/auth/me").set("Cookie", cookie)).status,
    401,
  );
  assert.equal((await login(schoolAgent, newPassword)).status, 200);
});

test("suspended or missing schools block login and authenticated workspace access", async () => {
  await School.findByIdAndUpdate(school.id, { status: "suspended" });
  assert.equal((await schoolAgent.get("/api/school/dashboard")).status, 403);
  assert.equal((await login(request(app), newPassword)).status, 403);
  await School.findByIdAndUpdate(school.id, { status: "active" });
  assert.equal((await schoolAgent.get("/api/school/dashboard")).status, 200);
  const orphanAgent = request.agent(createApp(config));
  await User.findByIdAndUpdate(adminId, {
    schoolId: new mongoose.Types.ObjectId(),
  });
  assert.equal((await login(orphanAgent, newPassword)).status, 403);
});

test("existing Super Admin functionality remains operational", async () => {
  assert.equal(
    (await superAgent.get("/api/auth/me")).body.user.role,
    "super_admin",
  );
  const stats = await superAgent.get("/api/schools/stats");
  assert.equal(stats.status, 200);
  assert.equal(stats.body.totalSchools, 2);
  assert.equal(stats.body.totalUsers, 4);
  assert.equal((await superAgent.get("/api/schools")).body.total, 2);
  assert.equal(
    (
      await mutation(superAgent, "post", "/api/auth/change-password", {
        currentPassword: "Platform-password-123!",
        newPassword,
      })
    ).status,
    403,
  );
});
