import path from "node:path";
import { fileURLToPath } from "node:url";

export const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
export const directory = path.join(root, ".local", "mongodb");
export const dbPath = path.join(directory, "data");
export const logPath = path.join(directory, "mongod.log");
export const configPath = path.join(directory, "mongod.cfg");
export const manifestPath = path.join(directory, "installation.json");
export const envPath = path.join(root, "backend", ".env.local");
export const frontendEnvPath = path.join(root, "frontend", ".env.school-local");
export const port = 27018;
export const replicaSet = "schoolLocalRs";
export const database = "dev_bigi_school_local";
export const uri = `mongodb://127.0.0.1:${port}/${database}?replicaSet=${replicaSet}`;
export const directUri = `mongodb://127.0.0.1:${port}/?directConnection=true`;
export const origin = "http://localhost:5174";
export const configuration = () =>
  `# Generated for this workspace only. Do not expose this instance to a network.\n` +
  `storage:\n  dbPath: ${JSON.stringify(dbPath)}\n` +
  `systemLog:\n  destination: file\n  path: ${JSON.stringify(logPath)}\n  logAppend: true\n` +
  `net:\n  bindIp: 127.0.0.1\n  port: ${port}\n` +
  `replication:\n  replSetName: ${replicaSet}\n`;

export function assertLocalEnvironment(env) {
  if (
    env.MONGODB_URI !== uri ||
    env.DNS_SERVERS !== "" ||
    env.NODE_ENV !== "development" ||
    env.PORT !== "5001" ||
    env.FRONTEND_ORIGIN !== origin ||
    !env.JWT_SECRET ||
    env.JWT_SECRET.length < 32
  )
    throw new Error(
      "Local environment must retain the generated loopback URI, blank DNS_SERVERS, development mode, ports/origin and a private JWT secret of at least 32 characters. No connection was attempted.",
    );
}

export function assertLocalSocket(args) {
  // net.connect normalizes its arguments to an array before calling Socket.connect.
  const options = Array.isArray(args[0]) ? args[0][0] : args[0];
  if (
    !options ||
    typeof options !== "object" ||
    options.host !== "127.0.0.1" ||
    Number(options.port) !== port
  )
    throw new Error("Verification blocked a non-loopback socket.");
}
