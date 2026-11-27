// Explicit local-only recovery launcher; never imports the ordinary dotenv/config.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import mongoose from "mongoose";
import {
  assertLocalDatabase,
  localBackupUri,
} from "../services/backupPlatform.js";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const name = process.argv[2];
try {
  if (
    !/^school_recovery_[a-f\d]{24}$/.test(name || "") ||
    process.argv.length !== 3
  )
    throw new Error(
      "Provide the verified school_recovery_<24 hex digits> database name.",
    );
  const envPath = path.join(root, "backend", ".env.local");
  const env = dotenv.parse(fs.readFileSync(envPath));
  const source = localBackupUri(env.MONGODB_URI);
  if (source.port !== 27018 || source.replicaSet !== "schoolLocalRs")
    throw new Error(
      "Use the dedicated Windows local replica-set configuration.",
    );
  const uri = `mongodb://127.0.0.1:27018/${name}?replicaSet=schoolLocalRs`;
  const client = new mongoose.mongo.MongoClient(uri, {
    serverSelectionTimeoutMS: 5000,
  });
  try {
    await client.connect();
    await assertLocalDatabase(client, uri);
    const options = (await client.db("admin").command({ getCmdLineOpts: 1 }))
      .parsed;
    if (
      !options.storage?.dbPath ||
      path.resolve(options.storage.dbPath).toLowerCase() !==
        path.join(root, ".local", "mongodb", "data").toLowerCase() ||
      options.net?.bindIp !== "127.0.0.1"
    )
      throw new Error(
        "The running MongoDB instance does not use this workspace's dedicated local storage.",
      );
    const proof = await client
      .db(name)
      .collection("_recoveryProof")
      .findOne({ _id: "verified", targetDatabase: name });
    if (!proof)
      throw new Error(
        "Recovery database has no completed integrity verification. Refusing activation.",
      );
    const schools = await client
      .db(name)
      .collection("schools")
      .find({}, { projection: { _id: 1 } })
      .toArray();
    if (
      JSON.stringify(schools.map((s) => String(s._id)).sort()) !==
      JSON.stringify([...proof.schoolIds].sort())
    )
      throw new Error(
        "Recovery school identity no longer matches the verification proof.",
      );
  } finally {
    await client.close();
  }
  const child = spawn(process.execPath, ["src/server.js"], {
    cwd: path.join(root, "backend"),
    stdio: "inherit",
    windowsHide: true,
    env: {
      ...process.env,
      ...env,
      NODE_OPTIONS: "",
      DOTENV_KEY: "",
      DOTENV_CONFIG_PATH: envPath,
      // dotenv 16 treats the nonempty string "false" as truthy. Empty prevents overwrite.
      DOTENV_CONFIG_OVERRIDE: "",
      MONGODB_URI: uri,
      DNS_SERVERS: "",
      BACKUPS_ENABLED: "true",
      NODE_ENV: "development",
      PORT: "5001",
      FRONTEND_ORIGIN: "http://localhost:5174",
    },
  });
  await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => {
      process.exitCode = code ?? 1;
      resolve();
    });
  });
} catch (error) {
  console.error(`Recovery launch refused: ${error.message}`);
  process.exitCode = 1;
}
