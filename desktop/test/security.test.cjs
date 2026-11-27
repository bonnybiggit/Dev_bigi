const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { randomBytes, X509Certificate } = require("node:crypto");
const { spawn } = require("node:child_process");
const mongoose = require("mongoose");
const {
  startMongo,
  stopMongo,
  authOptions,
  findMongod,
  port,
  setName,
} = require("../mongo.cjs");
const { ensureTls } = require("../tls.cjs");
const { certificateMatches } = require("../network.cjs");
test(
  "Windows TLS identity persists, pins reject mismatches, and encrypted PFX opens",
  { skip: process.platform !== "win32", timeout: 90000 },
  async () => {
    const root = path.resolve(
      __dirname,
      "../../.local",
      `tls-test-${Date.now()}`,
    );
    const password = randomBytes(32).toString("hex");
    const tls = await ensureTls(root, "https://127.0.0.1:5443", password);
    const cert = new X509Certificate(fs.readFileSync(tls.certificate));
    assert(certificateMatches(cert.toString(), "127.0.0.1", tls.fingerprint));
    assert(
      !certificateMatches(cert.toString(), "192.168.1.9", tls.fingerprint),
    );
    assert(!certificateMatches(cert.toString(), "127.0.0.1", "00".repeat(32)));
    require("node:tls").createSecureContext(tls);
    assert.equal(
      (await ensureTls(root, "https://127.0.0.1:5443", password)).fingerprint,
      tls.fingerprint,
    );
  },
);
test(
  "existing desktop data upgrades to authenticated loopback MongoDB and survives restarts",
  { skip: process.platform !== "win32", timeout: 180000 },
  async () => {
    const root = path.resolve(
        __dirname,
        "../../.local",
        `mongo-auth-test-${Date.now()}`,
      ),
      folder = path.join(root, "mongodb"),
      data = path.join(folder, "data"),
      binary = findMongod().path;
    fs.mkdirSync(data, { recursive: true });
    const legacy = `storage:\n  dbPath: ${JSON.stringify(data)}\nsystemLog:\n  destination: file\n  path: ${JSON.stringify(path.join(folder, "mongod.log"))}\n  logAppend: true\nnet:\n  bindIp: 127.0.0.1\n  port: ${port}\nreplication:\n  replSetName: ${setName}\n`;
    fs.writeFileSync(path.join(folder, "mongod.cfg"), legacy);
    const old = spawn(binary, ["--config", path.join(folder, "mongod.cfg")], {
      windowsHide: true,
      stdio: "ignore",
    });
    const direct = `mongodb://127.0.0.1:${port}/?directConnection=true`;
    const legacyClient = new mongoose.mongo.MongoClient(direct, {
      serverSelectionTimeoutMS: 15000,
    });
    const credentials = {
      adminPassword: randomBytes(32).toString("hex"),
      appPassword: randomBytes(32).toString("hex"),
    };
    let secured = false;
    try {
      await legacyClient.connect();
      assert.equal(
        path.resolve(
          (await legacyClient.db("admin").command({ getCmdLineOpts: 1 })).parsed
            .storage.dbPath,
        ),
        data,
        "Test port belongs to another instance; refusing writes",
      );
      await legacyClient.db("admin").command({
        replSetInitiate: {
          _id: setName,
          members: [{ _id: 0, host: `127.0.0.1:${port}` }],
        },
      });
      for (let i = 0; i < 120; i++) {
        if (
          (await legacyClient.db("admin").command({ hello: 1 }))
            .isWritablePrimary
        )
          break;
        await new Promise((r) => setTimeout(r, 500));
      }
      await legacyClient
        .db("dev_bigi_school_local")
        .collection("retained_test")
        .insertOne({
          _id: "original",
          value: "keep across security migration",
        });
      await legacyClient.close();
      await startMongo(root, binary, credentials);
      secured = true;
      const app = new mongoose.mongo.MongoClient(
        `mongodb://127.0.0.1:${port}/dev_bigi_school_local?replicaSet=${setName}`,
        authOptions(credentials, true),
      );
      await app.connect();
      assert.equal(
        (
          await app
            .db()
            .collection("retained_test")
            .findOne({ _id: "original" })
        ).value,
        "keep across security migration",
      );
      const opts = (await app.db("admin").command({ getCmdLineOpts: 1 }))
        .parsed;
      assert.equal(opts.security.authorization, "enabled");
      assert.equal(opts.net.bindIp, "127.0.0.1");
      await assert.rejects(
        app
          .db("admin")
          .command({ createUser: "forbidden", pwd: "test", roles: [] }),
        (e) => e.code === 13,
      );
      await app.close();
      const anonymous = new mongoose.mongo.MongoClient(direct);
      await anonymous.connect();
      await assert.rejects(
        anonymous
          .db("dev_bigi_school_local")
          .collection("retained_test")
          .findOne(),
        (e) => e.code === 13,
      );
      await anonymous.close();
      await stopMongo(root, credentials);
      secured = false;
      await startMongo(root, binary, credentials);
      secured = true;
      const reconnected = new mongoose.mongo.MongoClient(
        direct,
        authOptions(credentials, true),
      );
      await reconnected.connect();
      assert.equal(
        await reconnected
          .db("dev_bigi_school_local")
          .collection("retained_test")
          .countDocuments(),
        1,
      );
      await reconnected.close();
    } catch (error) {
      console.error("Security migration test:", error.message);
      throw error;
    } finally {
      await legacyClient.close();
      if (secured) await stopMongo(root, credentials);
      else if (old.exitCode === null) {
        const c = new mongoose.mongo.MongoClient(direct, {
          serverSelectionTimeoutMS: 3000,
        });
        try {
          await c.connect();
          const opts = (await c.db("admin").command({ getCmdLineOpts: 1 }))
            .parsed;
          if (path.resolve(opts.storage.dbPath) === data)
            await c.db("admin").command({ shutdown: 1 });
        } catch {
          /* retain database on failed bootstrap */
        } finally {
          await c.close();
        }
      }
    }
  },
);
