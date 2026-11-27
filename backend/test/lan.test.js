import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import https from "node:https";
import { checkServerIdentity } from "node:tls";
import { createRequire } from "node:module";
import { randomBytes, X509Certificate } from "node:crypto";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { createApp } from "../src/app.js";
import { desktopGateway } from "../src/services/desktopGateway.js";
import { School } from "../src/models/School.js";
import { SchoolClass } from "../src/models/SchoolClass.js";
import { User } from "../src/models/User.js";
const require = createRequire(import.meta.url);
const { ensureTls } = require("../../desktop/tls.cjs");
test(
  "HTTPS LAN clients authenticate independently, enforce tenants/CSRF, reconnect and cannot administer the machine",
  { skip: process.platform !== "win32", timeout: 120000 },
  async () => {
    const folder = path.resolve("../.local", `lan-test-${Date.now()}`);
    await fs.mkdir(folder, { recursive: true });
    await fs.writeFile(
      path.join(folder, "index.html"),
      "<h1>LAN workspace</h1>",
    );
    const tls = await ensureTls(
      folder,
      "https://127.0.0.1:5443",
      randomBytes(32).toString("hex"),
    );
    const ca = new X509Certificate(
      await fs.readFile(tls.certificate),
    ).toString();
    const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    let server, agentA, agentB, origin;
    const config = {
      NODE_ENV: "test",
      SECURE_COOKIES: true,
      JWT_SECRET: randomBytes(48).toString("hex"),
      BACKUPS_ENABLED: false,
      DESKTOP_MODE: false,
    };
    function client(agent) {
      let cookie = "";
      return async (route, body, extra = {}, method = body ? "POST" : "GET") =>
        new Promise((resolve, reject) => {
          const bytes = body ? Buffer.from(JSON.stringify(body)) : null;
          const request = https.request(
            origin + route,
            {
              agent,
              method,
              checkServerIdentity: (_name, cert) =>
                checkServerIdentity("127.0.0.1", cert),
              headers: {
                ...(body
                  ? {
                      "content-type": "application/json",
                      "content-length": bytes.length,
                      origin,
                    }
                  : {}),
                ...(cookie ? { cookie } : {}),
                ...extra,
              },
            },
            (res) => {
              if (res.headers["set-cookie"])
                cookie = res.headers["set-cookie"][0].split(";")[0];
              let text = "";
              res.on("data", (data) => {
                text += data;
              });
              res.on("end", () => {
                let json;
                try {
                  json = JSON.parse(text);
                } catch {
                  /* HTML/error response. */
                }
                resolve({
                  status: res.statusCode,
                  headers: res.headers,
                  json,
                  text,
                });
              });
            },
          );
          request.on("error", reject);
          request.end(bytes);
        });
    }
    const listen = async (port = 0) => {
      let handler;
      server = https.createServer(tls, (req, res) => handler(req, res));
      await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
      origin = `https://127.0.0.1:${server.address().port}`;
      handler = desktopGateway({
        origin,
        frontend: folder,
        api: createApp(
          { ...config, FRONTEND_ORIGIN: origin },
          { backups: null },
        ),
        lan: true,
      });
    };
    const stop = () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      });
    try {
      await mongoose.connect(mongo.getUri("lan_tests"));
      await Promise.all([School.init(), User.init(), SchoolClass.init()]);
      const ownerId = new mongoose.Types.ObjectId();
      const schools = await School.create(
        ["School A", "School B"].map((name) => ({
          name,
          address: "1 Test Road",
          city: "Lagos",
          country: "Nigeria",
          schoolType: "Primary",
          createdBy: ownerId,
        })),
      );
      const password = "Synthetic-LAN-password-123!",
        passwordHash = await bcrypt.hash(password, 4);
      await User.create(
        schools.map((school, i) => ({
          name: `LAN Admin ${i}`,
          email: `lan${i}@preview.test`,
          passwordHash,
          role: "school_admin",
          schoolId: school._id,
        })),
      );
      const classes = await SchoolClass.create(
        schools.map((school) => ({
          schoolId: school._id,
          name: "Primary 1",
          capacity: 30,
        })),
      );
      await listen();
      agentA = new https.Agent({ ca });
      agentB = new https.Agent({ ca });
      const a = client(agentA),
        b = client(agentB);
      assert.equal((await a("/")).status, 200);
      assert.equal((await a("/api/school/profile")).status, 401);
      assert.equal((await a("/api/desktop/setup")).json.setupRequired, false);
      assert.equal((await a("/api/desktop/setup", {})).status, 403);
      for (const route of ["/api/backups/", "/api/desktop/activate-recovery"])
        assert.equal((await a(route, {})).status, 403);
      const login = await a("/api/auth/school-login", {
        email: "lan0@preview.test",
        password,
      });
      assert.equal(login.status, 200);
      assert.match(login.headers["set-cookie"][0], /Secure/);
      assert.match(login.headers["set-cookie"][0], /HttpOnly/);
      assert.match(login.headers["set-cookie"][0], /SameSite=Strict/);
      assert.equal((await b("/api/school/profile")).status, 401);
      assert.equal(
        (
          await b("/api/auth/school-login", {
            email: "lan1@preview.test",
            password,
          })
        ).status,
        200,
      );
      assert.equal(
        (await a("/api/school/profile")).json.profile.name,
        "School A",
      );
      assert.equal(
        (await b("/api/school/profile")).json.profile.name,
        "School B",
      );
      assert.equal(
        (
          await a(
            `/api/school/classes/${classes[1].id}`,
            { name: "Hijack", capacity: 30, arms: [] },
            {},
            "PUT",
          )
        ).status,
        404,
      );
      assert.equal(
        (await a("/api/auth/logout", {}, { origin: "https://evil.test" }))
          .status,
        403,
      );
      assert.equal(
        (await a("/api/health", undefined, { host: "evil.test" })).status,
        403,
      );
      const port = server.address().port;
      await stop();
      await assert.rejects(a("/api/health"));
      await listen(port);
      assert.equal((await a("/api/auth/me")).status, 200);
      assert.equal((await b("/api/auth/me")).status, 200);
      await User.updateOne(
        { email: "lan0@preview.test" },
        { $inc: { sessionVersion: 1 } },
      );
      assert.equal((await a("/api/auth/me")).status, 401);
      assert.equal((await b("/api/auth/me")).status, 200);
    } finally {
      agentA?.destroy();
      agentB?.destroy();
      if (server?.listening) await stop();
      await mongoose.disconnect();
      await mongo.stop();
    }
  },
);
