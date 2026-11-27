const path = require("node:path");
const http = require("node:http");
const https = require("node:https");
const { pathToFileURL } = require("node:url");
const mongoose = require("mongoose");
const {
  startMongo,
  stopMongo,
  port,
  setName,
  authOptions,
} = require("./mongo.cjs");
const { ensureTls } = require("./tls.cjs");
const { connectionInput, validateAddress } = require("./network.cjs");
let server,
  lanServer,
  stopBackups,
  settings,
  closing = false;
const connections = new Map();
function trackConnections(listener, secure = false) {
  listener.on(secure ? "secureConnection" : "connection", (socket) => {
    if (!connections.has(socket)) connections.set(socket, 0);
    socket.once("close", () => connections.delete(socket));
  });
  listener.prependListener("request", (req, res) => {
    const socket = req.socket;
    connections.set(socket, (connections.get(socket) || 0) + 1);
    let done = false;
    const finished = () => {
      if (done) return;
      done = true;
      if (connections.has(socket))
        connections.set(socket, Math.max(0, connections.get(socket) - 1));
      if (closing) setImmediate(() => listener.closeIdleConnections());
    };
    res.once("finish", finished);
    res.once("close", finished);
  });
}
const send = (data) => process.parentPort.postMessage(data);
async function shutdown() {
  if (closing) return;
  closing = true;
  try {
    const backupsDone = stopBackups?.();
    const listenersClosed = Promise.all(
      [server, lanServer].filter(Boolean).map(
        (s) =>
          new Promise((resolve) => {
            s.close(resolve);
            s.closeIdleConnections();
          }),
      ),
    );
    // HTTPS browser preconnects may complete TLS without ever sending an HTTP
    // request. Node's HTTP idle-connection tracker does not close those sockets.
    for (const [socket, active] of connections)
      if (active === 0) socket.destroy();
    await listenersClosed;
    await backupsDone;
    await mongoose.disconnect();
    if (settings) await stopMongo(settings.root, settings.mongoCredentials);
    send({ type: "stopped" });
    process.exit(0);
  } catch {
    send({
      type: "error",
      message:
        "Shutdown could not complete. Persistent data was retained; inspect the local logs.",
    });
    process.exit(1);
  }
}
async function start(value) {
  settings = value;
  const connection = connectionInput(
    value.connection || { mode: "standalone" },
  );
  if (connection.mode === "client")
    throw new Error("LAN clients cannot start a local backend or MongoDB.");
  const bindAddress = await validateAddress(connection);
  if (
    !/^dev_bigi_school_local$|^school_recovery_[a-f0-9]{24}$/.test(
      value.database,
    )
  )
    throw new Error("Invalid local database selection.");
  send({
    type: "progress",
    message: "Starting your independent local MongoDB replica set...",
  });
  await startMongo(value.root, value.mongod, value.mongoCredentials);
  const uri = `mongodb://127.0.0.1:${port}/${value.database}?replicaSet=${setName}`;
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000,
    ...authOptions(value.mongoCredentials, true),
  });
  const load = (file) =>
    import(pathToFileURL(path.join(__dirname, "../backend/src", file)).href);
  const { initializeDatabase } = await load("initializeDatabase.js");
  await initializeDatabase();
  const { assertLocalDatabase } = await load("services/backupPlatform.js");
  await assertLocalDatabase(mongoose.connection.getClient(), uri);
  const { createApp } = await load("app.js");
  const { BackupService } = await load("services/backups.js");
  const { desktopGateway } = await load("services/desktopGateway.js");
  let handler;
  server = http.createServer((req, res) =>
    handler ? handler(req, res) : res.writeHead(503).end(),
  );
  trackConnections(server);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const config = {
    NODE_ENV: "development",
    MONGODB_URI: uri,
    JWT_SECRET: value.jwt,
    FRONTEND_ORIGIN: origin,
    BACKUPS_ENABLED: true,
    DESKTOP_MODE: true,
  };
  const backups = new BackupService(config, {
    folder: path.join(value.root, "backups"),
  });
  const api = createApp(config, { backups });
  handler = desktopGateway({
    origin,
    token: value.token,
    frontend: path.join(__dirname, "../frontend/dist"),
    api,
  });
  stopBackups = backups.start();
  let lan;
  if (connection.mode === "server") {
    const tls = await ensureTls(
      value.root,
      connection.serverUrl,
      value.tlsPassword,
    );
    const lanConfig = {
      ...config,
      FRONTEND_ORIGIN: connection.serverUrl,
      SECURE_COOKIES: true,
      DESKTOP_MODE: false,
      BACKUPS_ENABLED: false,
    };
    const lanApi = createApp(lanConfig, { backups: null });
    lanServer = https.createServer(
      { ...tls, handshakeTimeout: 10000 },
      desktopGateway({
        origin: connection.serverUrl,
        frontend: path.join(__dirname, "../frontend/dist"),
        api: lanApi,
        lan: true,
      }),
    );
    trackConnections(lanServer, true);
    lanServer.requestTimeout = 120000;
    lanServer.headersTimeout = 15000;
    await new Promise((resolve, reject) => {
      lanServer.once("error", reject);
      lanServer.listen(
        Number(new URL(connection.serverUrl).port),
        bindAddress,
        resolve,
      );
    });
    lan = {
      serverUrl: connection.serverUrl,
      fingerprint: tls.fingerprint,
      certificate: tls.certificate,
    };
  }
  send({ type: "ready", origin, lan });
}
process.parentPort.on("message", ({ data }) => {
  if (data.type === "start" && !settings)
    start(data.settings).catch((error) =>
      send({ type: "error", message: error.message }),
    );
  else if (data.type === "shutdown") shutdown();
});
