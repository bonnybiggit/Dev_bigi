// No dotenv/config or production application imports: all MongoDB targets are fixed loopback literals.
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import dns from "node:dns";
import { spawn, spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import mongoose from "mongoose";
import dotenv from "dotenv";
import {
  root,
  directory,
  dbPath,
  logPath,
  configPath,
  manifestPath,
  envPath,
  frontendEnvPath,
  port,
  replicaSet,
  database,
  uri,
  directUri,
  origin,
  configuration,
  assertLocalEnvironment,
  assertLocalSocket,
} from "./config.js";

const { MongoClient } = mongoose.mongo;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const samePath = (a, b) =>
  path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
function safePath(target) {
  const workspace = fs.realpathSync(root);
  let existing = target;
  while (!fs.existsSync(existing)) existing = path.dirname(existing);
  const resolved = fs.realpathSync(existing);
  if (
    !samePath(workspace, resolved) &&
    !resolved.toLowerCase().startsWith(workspace.toLowerCase() + path.sep)
  )
    throw new Error("Refusing a local path redirected outside this workspace.");
}
function ensureDirectories() {
  for (const target of [directory, dbPath]) {
    safePath(target);
    fs.mkdirSync(target, { recursive: true });
    safePath(target);
  }
}
function loadManifest() {
  for (const target of [manifestPath, configPath, dbPath, logPath])
    safePath(target);
  if (!fs.existsSync(manifestPath))
    throw new Error(
      "Run Setup-LocalMongo.ps1 first. No database connection attempted.",
    );
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (
    manifest.version !== 1 ||
    !samePath(manifest.workspace, root) ||
    fs.readFileSync(configPath, "utf8") !== configuration()
  )
    throw new Error(
      "Local installation/configuration differs from this workspace's safe configuration. Refusing to start, stop or connect.",
    );
  return manifest;
}
function findMongod(explicit) {
  const candidates = explicit ? [path.resolve(explicit)] : [];
  if (!explicit) {
    for (const folder of (process.env.PATH || "").split(path.delimiter))
      if (folder) candidates.push(path.join(folder, "mongod.exe"));
    const installed = path.join(
      process.env.ProgramFiles || "C:\\Program Files",
      "MongoDB",
      "Server",
    );
    if (fs.existsSync(installed))
      for (const version of fs
        .readdirSync(installed)
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true })))
        candidates.push(path.join(installed, version, "bin", "mongod.exe"));
  }
  for (const binary of candidates) {
    if (!fs.existsSync(binary)) continue;
    const result = spawnSync(binary, ["--version"], {
      windowsHide: true,
      encoding: "utf8",
      timeout: 10000,
    });
    const version = result.stdout?.match(/db version v(\d+\.\d+\.\d+)/)?.[1];
    if (result.status === 0 && version && Number(version.split(".")[0]) >= 7)
      return { binary: fs.realpathSync(binary), mongoVersion: version };
  }
  throw new Error(
    "Missing prerequisite: a working MongoDB Server 7+ mongod.exe (and its Windows runtime). Install it yourself or pass -MongodPath. Nothing was downloaded, installed or registered as a service.",
  );
}
function writeOnce(file, contents) {
  safePath(file);
  try {
    fs.writeFileSync(file, contents, { flag: "wx", mode: 0o600 });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
  }
}
function setup(binary) {
  const found = findMongod(binary);
  if (
    !fs.existsSync(manifestPath) &&
    fs.existsSync(dbPath) &&
    fs.readdirSync(dbPath).length
  )
    throw new Error(
      "The proposed data directory is non-empty and has no workspace installation manifest. Refusing to adopt or alter existing data.",
    );
  ensureDirectories();
  writeOnce(configPath, configuration());
  writeOnce(
    manifestPath,
    JSON.stringify({ version: 1, workspace: root, ...found }, null, 2) + "\n",
  );
  writeOnce(
    envPath,
    `# LOCAL ONLY. Do not replace with Atlas settings.\nNODE_ENV=development\nPORT=5001\nMONGODB_URI=${uri}\nBACKUPS_ENABLED=true\nDNS_SERVERS=\nJWT_SECRET=${randomBytes(48).toString("hex")}\nFRONTEND_ORIGIN=${origin}\nSUPER_ADMIN_NAME=Local Administrator\nSUPER_ADMIN_EMAIL=\nSUPER_ADMIN_PASSWORD=\n`,
  );
  writeOnce(
    frontendEnvPath,
    "# Loaded only by --mode school-local\nVITE_API_URL=http://localhost:5001/api\n",
  );
  loadManifest();
  assertLocalEnvironment(dotenv.parse(fs.readFileSync(envPath)));
  console.log(
    `Setup ready: MongoDB ${found.mongoVersion}; loopback port ${port}; replica set ${replicaSet}.`,
  );
  console.log(
    `Persistent data: ${dbPath}\nLocal environment: ${envPath}\nNo existing .env files were read or overwritten.`,
  );
}
async function portOpen() {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.setTimeout(700);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}
async function direct() {
  const client = new MongoClient(directUri, {
    serverSelectionTimeoutMS: 1500,
    connectTimeoutMS: 1500,
  });
  try {
    await client.connect();
    return client;
  } catch (error) {
    await client.close();
    throw error;
  }
}
async function identify(client, allowUninitialized = false) {
  const opts = (await client.db("admin").command({ getCmdLineOpts: 1 })).parsed;
  if (
    !opts.storage?.dbPath ||
    !samePath(opts.storage.dbPath, dbPath) ||
    opts.net?.bindIp !== "127.0.0.1" ||
    opts.net?.port !== port ||
    opts.replication?.replSetName !== replicaSet
  )
    throw new Error(
      "Port is occupied by a different MongoDB instance. No writes or shutdown were attempted.",
    );
  let config;
  try {
    config = (await client.db("admin").command({ replSetGetConfig: 1 })).config;
  } catch (error) {
    if (error.code === 94 && allowUninitialized) return false;
    throw error;
  }
  if (
    config._id !== replicaSet ||
    config.members.length !== 1 ||
    config.members[0].host !== `127.0.0.1:${port}`
  )
    throw new Error(
      "Replica-set topology is not the dedicated single loopback member. Refusing operations.",
    );
  return true;
}
async function waitPrimary(client) {
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      if ((await client.db("admin").command({ hello: 1 })).isWritablePrimary)
        return;
    } catch {
      /* normal during election */
    }
    await sleep(500);
  }
  throw new Error(
    "Local replica set did not elect a PRIMARY within 60 seconds. Inspect .local/mongodb/mongod.log.",
  );
}
async function start() {
  const manifest = loadManifest();
  let client;
  if (await portOpen()) {
    client = await direct();
    try {
      await identify(client);
      await waitPrimary(client);
    } finally {
      await client.close();
    }
    console.log("Dedicated local replica set is already running as PRIMARY.");
    return;
  }
  if (!fs.existsSync(manifest.binary))
    throw new Error(
      "Recorded mongod.exe is missing. Restore the prerequisite; no download attempted.",
    );
  const child = spawn(manifest.binary, ["--config", configPath], {
    windowsHide: true,
    detached: true,
    stdio: "ignore",
  });
  let launchError;
  child.once("error", (error) => {
    launchError = error;
  });
  child.unref();
  for (let attempt = 0; attempt < 120; attempt++) {
    if (launchError)
      throw new Error(
        `Unable to launch local mongod (${launchError.code}). No system changes attempted.`,
      );
    if (await portOpen()) break;
    if (child.exitCode !== null)
      throw new Error(
        "Local mongod exited at startup. Inspect .local/mongodb/mongod.log; no existing process was stopped.",
      );
    await sleep(500);
  }
  client = await direct();
  try {
    if (!(await identify(client, true)))
      await client.db("admin").command({
        replSetInitiate: {
          _id: replicaSet,
          members: [{ _id: 0, host: `127.0.0.1:${port}` }],
        },
      });
    await waitPrimary(client);
    await identify(client);
  } finally {
    await client.close();
  }
  console.log(
    `Local PRIMARY ready at 127.0.0.1:${port}; replica set ${replicaSet}; persistent data retained.`,
  );
}
async function stop() {
  loadManifest();
  if (!(await portOpen())) {
    console.log("Dedicated local MongoDB is already stopped; data retained.");
    return;
  }
  const client = await direct();
  try {
    await identify(client);
    try {
      await client.db("admin").command({ shutdown: 1 });
    } catch (error) {
      if (
        !["MongoNetworkError", "MongoServerSelectionError"].includes(error.name)
      )
        throw error;
    }
  } finally {
    await client.close();
  }
  for (let attempt = 0; attempt < 120; attempt++) {
    if (!(await portOpen())) {
      console.log("Local MongoDB stopped gracefully; data retained.");
      return;
    }
    await sleep(500);
  }
  throw new Error(
    "Shutdown has not completed. No process was killed and no data was deleted.",
  );
}
async function status() {
  loadManifest();
  if (!(await portOpen())) {
    console.log("Dedicated local MongoDB is stopped.");
    return;
  }
  const client = await direct();
  try {
    await identify(client);
    const hello = await client.db("admin").command({ hello: 1 });
    console.log(
      JSON.stringify(
        {
          host: "127.0.0.1",
          port,
          replicaSet: hello.setName,
          primary: hello.isWritablePrimary,
          dbPath,
        },
        null,
        2,
      ),
    );
  } finally {
    await client.close();
  }
}
async function verify() {
  // Deliberately reject DNS and non-loopback sockets for this entire verification process.
  const originalConnect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function (...args) {
    assertLocalSocket(args);
    return originalConnect.apply(this, args);
  };
  const originalLookup = dns.lookup;
  dns.lookup = () => {
    throw new Error("Verification blocked DNS.");
  };
  let wasRunning = false;
  try {
    loadManifest();
    wasRunning = await portOpen();
    await start();
    const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
    await client.connect();
    let marker;
    const collection = client
      .db(database)
      .collection("local_replica_verification");
    try {
      await identify(client);
      await collection.createIndex({ runId: 1 }, { unique: true });
      marker = {
        runId: randomUUID(),
        value: "committed offline before restart",
        createdAt: new Date(),
      };
      const session = client.startSession();
      try {
        await session.withTransaction(
          async () => {
            await collection.insertOne(marker, { session });
            await collection.updateOne(
              { runId: marker.runId },
              { $set: { updatedInTransaction: true } },
              { session },
            );
          },
          { writeConcern: { w: "majority", j: true } },
        );
        const rollbackId = randomUUID();
        try {
          await session.withTransaction(async () => {
            await collection.insertOne({ runId: rollbackId }, { session });
            throw new Error("intentional rollback");
          });
        } catch (error) {
          if (error.message !== "intentional rollback") throw error;
        }
        if (await collection.findOne({ runId: rollbackId }))
          throw new Error("Rollback verification failed.");
      } finally {
        await session.endSession();
      }
      if (
        !(await collection.findOne({ runId: marker.runId }))
          ?.updatedInTransaction
      )
        throw new Error("Transaction write/read failed.");
      console.log(
        "PASS offline insert/update/read, transaction commit and rollback (DNS/non-loopback sockets blocked).",
      );
    } finally {
      await client.close();
    }
    await stop();
    await start();
    const restarted = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
    await restarted.connect();
    try {
      await identify(restarted);
      const retained = await restarted
        .db(database)
        .collection("local_replica_verification")
        .findOne({ runId: marker.runId });
      if (!retained?.updatedInTransaction || retained.value !== marker.value)
        throw new Error("Persistence after restart failed.");
      const indexes = await restarted
        .db(database)
        .collection("local_replica_verification")
        .listIndexes()
        .toArray();
      if (!indexes.some((index) => index.key.runId === 1 && index.unique))
        throw new Error("Index persistence after restart failed.");
      const result = {
        verifiedAt: new Date().toISOString(),
        database,
        port,
        replicaSet,
        runId: marker.runId,
        offlineGuard: true,
        transactionCommit: true,
        transactionRollback: true,
        persistentAfterRestart: true,
        indexPersistentAfterRestart: true,
        initiallyRunning: wasRunning,
      };
      const evidencePath = path.join(directory, "verification.json");
      safePath(evidencePath);
      fs.writeFileSync(evidencePath, JSON.stringify(result, null, 2) + "\n");
      console.log(
        "PASS persisted record and index after graceful stop/restart; evidence: .local/mongodb/verification.json.",
      );
    } finally {
      await restarted.close();
    }
  } finally {
    try {
      if (!wasRunning && fs.existsSync(manifestPath)) await stop();
    } finally {
      net.Socket.prototype.connect = originalConnect;
      dns.lookup = originalLookup;
    }
  }
}
async function application(mode) {
  loadManifest();
  safePath(envPath);
  safePath(frontendEnvPath);
  const local = dotenv.parse(fs.readFileSync(envPath));
  assertLocalEnvironment(local);
  if (
    dotenv.parse(fs.readFileSync(frontendEnvPath)).VITE_API_URL !==
    "http://localhost:5001/api"
  )
    throw new Error("Local frontend must target http://localhost:5001/api.");
  const childEnv = {
    ...process.env,
    ...local,
    DOTENV_CONFIG_PATH: envPath,
    DOTENV_KEY: "",
    NODE_OPTIONS: "",
    VITE_API_URL: "http://localhost:5001/api",
  };
  // config.js's dotenv/config must read only this local file, regardless of the caller's environment.
  // dotenv 16 casts this value with Boolean(); the string "false" would enable overriding.
  childEnv.DOTENV_CONFIG_OVERRIDE = "";
  const frontend = mode === "frontend";
  if (!frontend) {
    const client = await direct();
    try {
      await identify(client);
      await waitPrimary(client);
    } finally {
      await client.close();
    }
    if (
      mode === "seed" &&
      (!local.SUPER_ADMIN_EMAIL || !local.SUPER_ADMIN_PASSWORD)
    )
      throw new Error(
        "Set your own local SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD in backend/.env.local before seeding. No account was created.",
      );
  }
  const args = frontend
    ? [
        path.join(root, "node_modules", "vite", "bin", "vite.js"),
        "--mode",
        "school-local",
        "--host",
        "localhost",
        "--port",
        "5174",
        "--strictPort",
      ]
    : mode === "seed"
      ? ["src/scripts/seed.js"]
      : mode === "dev"
        ? ["--watch", "src/server.js"]
        : ["src/server.js"];
  const child = spawn(process.execPath, args, {
    cwd: path.join(root, frontend ? "frontend" : "backend"),
    env: childEnv,
    windowsHide: true,
    stdio: "inherit",
  });
  await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => {
      process.exitCode = code ?? 1;
      resolve();
    });
  });
}
const [action, option, ...extra] = process.argv.slice(2);
try {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (!(
    (major === 20 && minor >= 19) ||
    (major === 22 && minor >= 12) ||
    major > 22
  ))
    throw new Error(
      "Missing prerequisite: Node.js 20.19+ or 22.12+. No system changes attempted.",
    );
  if (process.platform !== "win32")
    throw new Error("These scripts target Windows only.");
  if (extra.length || (!["setup", "backend"].includes(action) && option))
    throw new Error("Unexpected arguments. No database connection attempted.");
  switch (action) {
    case "setup":
      setup(option);
      break;
    case "start":
      await start();
      break;
    case "stop":
      await stop();
      break;
    case "status":
      await status();
      break;
    case "verify":
      await verify();
      break;
    case "backend":
      if (!["start", "dev", "seed"].includes(option))
        throw new Error("Choose start, dev or seed.");
      await application(option);
      break;
    case "frontend":
      await application("frontend");
      break;
    default:
      throw new Error(
        "Choose setup, start, stop, status, verify, backend or frontend.",
      );
  }
} catch (error) {
  console.error(`Local MongoDB: ${error.message}`);
  process.exitCode = 1;
}
