const {
  app,
  BrowserWindow,
  session,
  utilityProcess,
  ipcMain,
  dialog,
  safeStorage,
  Menu,
} = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { randomBytes } = require("node:crypto");
const http = require("node:http");
const { findMongod } = require("./mongo.cjs");
const {
  connectionInput,
  validateAddress,
  certificateMatches,
  probeClient,
} = require("./network.cjs");
const verify = process.argv.includes("--preview-verify");
if (!verify) app.commandLine.removeSwitch("remote-debugging-port");
app.commandLine.appendSwitch("disable-background-networking");
const supplied = process.argv
  .find((a) => a.startsWith("--preview-data-dir="))
  ?.slice("--preview-data-dir=".length);
const root = path.resolve(
  supplied ||
    path.join(
      process.env.LOCALAPPDATA || app.getPath("appData"),
      "SchoolManagementDesktopPreview",
    ),
);
if (
  app.isPackaged &&
  (root.toLowerCase() === path.dirname(process.execPath).toLowerCase() ||
    root
      .toLowerCase()
      .startsWith(path.dirname(process.execPath).toLowerCase() + path.sep) ||
    path
      .dirname(process.execPath)
      .toLowerCase()
      .startsWith(root.toLowerCase() + path.sep))
)
  throw new Error(
    "School data cannot be placed inside the installation folder.",
  );
fs.mkdirSync(root, { recursive: true });
app.setPath("userData", root);
app.setPath("sessionData", path.join(root, "browser"));
const bootFile = path.join(__dirname, "boot.html"),
  bootURL = pathToFileURL(bootFile).href;
const configFile = path.join(root, "installation.json");
let window,
  child,
  origin = "",
  token = "",
  state = { message: "Starting your school installation...", error: false },
  settings,
  starting = false,
  quitting = false,
  restarting = false;
let clientRetry,
  loadingClient = false,
  lanInfo;
function saveSettings(value) {
  fs.writeFileSync(configFile + ".next", JSON.stringify(value, null, 2), {
    mode: 0o600,
  });
  fs.renameSync(configFile + ".next", configFile);
}
const log = (message) => {
  fs.mkdirSync(path.join(root, "logs"), { recursive: true });
  fs.appendFileSync(
    path.join(root, "logs", "desktop.log"),
    `${new Date().toISOString()} ${message}\n`,
  );
};
function broadcast(message, error = false) {
  state = {
    message,
    error,
    version: app.getVersion(),
    connection: settings?.connection || { mode: "standalone" },
    lan: lanInfo,
  };
  log(message);
  if (window && !window.isDestroyed())
    window.webContents.send("preview:status-update", state);
}
function sender(event) {
  const url = event.senderFrame?.url;
  if (
    event.sender !== window?.webContents ||
    !(url === bootURL || (origin && new URL(url).origin === origin))
  )
    throw new Error("Untrusted desktop request.");
}
function readSettings() {
  if (!safeStorage.isEncryptionAvailable())
    throw new Error(
      "Windows user-key protection is unavailable. The preview will not store unprotected signing secrets.",
    );
  if (fs.existsSync(configFile)) {
    const value = JSON.parse(fs.readFileSync(configFile, "utf8"));
    if (
      value.version !== 1 ||
      !/^dev_bigi_school_local$|^school_recovery_[a-f0-9]{24}$/.test(
        value.database,
      )
    )
      throw new Error(
        "Invalid persistent installation settings. Data was left unchanged.",
      );
    value.connection ||= { mode: "standalone" };
    if (value.connection.mode !== "unconfigured")
      value.connection = connectionInput(value.connection);
    return value;
  }
  const value = {
    version: 1,
    connection: {
      mode:
        verify && process.argv.includes("--preview-standalone")
          ? "standalone"
          : "unconfigured",
    },
    database: "dev_bigi_school_local",
    jwtProtected: safeStorage
      .encryptString(randomBytes(48).toString("hex"))
      .toString("base64"),
  };
  fs.writeFileSync(configFile, JSON.stringify(value, null, 2), {
    flag: "wx",
    mode: 0o600,
  });
  return value;
}
function childEnvironment() {
  const env = {};
  for (const key of [
    "SystemRoot",
    "WINDIR",
    "PATH",
    "PATHEXT",
    "COMSPEC",
    "TEMP",
    "TMP",
    "USERPROFILE",
    "LOCALAPPDATA",
    "APPDATA",
    "ProgramFiles",
    "ProgramFiles(x86)",
    "NUMBER_OF_PROCESSORS",
  ])
    if (process.env[key]) env[key] = process.env[key];
  return env;
}
async function stopChild() {
  if (!child) return;
  const processToStop = child;
  await new Promise((resolve) => {
    processToStop.once("exit", resolve);
    processToStop.postMessage({ type: "shutdown" });
  });
  if (child === processToStop) child = null;
}
async function start() {
  if (starting || child) return;
  starting = true;
  try {
    settings = readSettings();
    clearTimeout(clientRetry);
    if (settings.connection.mode === "unconfigured") {
      broadcast("Choose how this PC will connect to your school.");
      return;
    }
    await validateAddress(settings.connection);
    if (settings.connection.mode === "client") {
      origin = settings.connection.serverUrl;
      token = "";
      broadcast("Connecting securely to the Main Server...");
      await connectClient();
      return;
    }
    if (!settings.securityProtected) {
      settings.securityProtected = safeStorage
        .encryptString(
          JSON.stringify({
            adminPassword: randomBytes(48).toString("hex"),
            appPassword: randomBytes(48).toString("hex"),
            tlsPassword: randomBytes(48).toString("hex"),
          }),
        )
        .toString("base64");
      saveSettings(settings);
    }
    const security = JSON.parse(
      safeStorage.decryptString(
        Buffer.from(settings.securityProtected, "base64"),
      ),
    );
    const mongo = findMongod(settings.mongod);
    settings.mongod = mongo.path;
    saveSettings(settings);
    token = randomBytes(32).toString("hex");
    broadcast("Starting local MongoDB and the school workspace...");
    const worker = utilityProcess.fork(
      path.join(__dirname, "runtime.cjs"),
      [],
      {
        env: childEnvironment(),
        stdio: "pipe",
        serviceName: "School Local Backend",
      },
    );
    child = worker;
    worker.stdout?.on("data", () => {});
    worker.stderr?.on("data", () =>
      log("Local backend emitted a diagnostic; no request data was recorded."),
    );
    worker.on("message", (message) => {
      if (message.type === "progress") broadcast(message.message);
      else if (message.type === "error") {
        broadcast(message.message, true);
        if (
          window &&
          !window.isDestroyed() &&
          window.webContents.getURL() !== bootURL
        )
          window.loadFile(bootFile);
      } else if (message.type === "ready") {
        origin = message.origin;
        lanInfo = message.lan;
        broadcast(
          lanInfo
            ? `Main Server ready: ${lanInfo.serverUrl}`
            : "School workspace ready.",
        );
        if (window && !window.isDestroyed() && !quitting)
          window.loadURL(origin + "/");
      }
    });
    worker.once("exit", (code) => {
      if (child === worker) child = null;
      origin = "";
      if (!quitting && !restarting && code !== 0) {
        broadcast(
          "The local backend stopped unexpectedly. Your data has been retained. Retry startup.",
          true,
        );
        window?.loadFile(bootFile);
      }
    });
    worker.postMessage({
      type: "start",
      settings: {
        root,
        connection: settings.connection,
        mongoCredentials: {
          adminPassword: security.adminPassword,
          appPassword: security.appPassword,
        },
        tlsPassword: security.tlsPassword,
        database: settings.database,
        mongod: settings.mongod,
        jwt: safeStorage.decryptString(
          Buffer.from(settings.jwtProtected, "base64"),
        ),
        token,
      },
    });
  } catch (error) {
    broadcast(error.message, true);
  } finally {
    starting = false;
  }
}
async function connectClient() {
  if (quitting || settings?.connection.mode !== "client" || loadingClient)
    return;
  loadingClient = true;
  try {
    await probeClient(settings.connection);
    origin = settings.connection.serverUrl;
    await window.loadURL(origin + "/");
    broadcast("Connected to the Main Server.");
  } catch {
    broadcast(
      "Main Server unavailable or its certificate does not match. Check the address, fingerprint and LAN connection. Retrying in 5 seconds...",
      true,
    );
    if (!quitting) await window.loadFile(bootFile);
    clientRetry = setTimeout(connectClient, 5000);
  } finally {
    loadingClient = false;
  }
}
async function localRequest(route, body) {
  const cookies = await session.defaultSession.cookies.get({
    url: origin,
    name: "dev_bigi_session",
  });
  return new Promise((resolve, reject) => {
    try {
      const bytes = Buffer.from(JSON.stringify(body));
      const request = http.request(
        origin + route,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "content-length": bytes.length,
            "x-desktop-token": token,
            origin,
            cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; "),
          },
        },
        (response) => {
          let text = "";
          response.on("data", (data) => {
            text += data;
          });
          response.on("end", () => {
            const data = JSON.parse(text);
            response.statusCode === 200
              ? resolve(data)
              : reject(
                  new Error(data.message || "Desktop authorization failed."),
                );
          });
        },
      );
      request.on("error", reject);
      request.end(bytes);
    } catch (error) {
      reject(error);
    }
  });
}
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    window?.show();
    window?.focus();
  });
  app
    .whenReady()
    .then(async () => {
      Menu.setApplicationMenu(
        Menu.buildFromTemplate([
          { label: "Application", submenu: [{ role: "quit" }] },
          {
            label: "Connection settings",
            click: () => window?.loadFile(bootFile),
          },
          {
            label: "Edit",
            submenu: [
              { role: "undo" },
              { role: "redo" },
              { type: "separator" },
              { role: "cut" },
              { role: "copy" },
              { role: "paste" },
              { role: "selectAll" },
            ],
          },
          {
            label: "View",
            submenu: [
              { role: "reload" },
              { role: "resetZoom" },
              { role: "zoomIn" },
              { role: "zoomOut" },
            ],
          },
        ]),
      );
      const ses = session.defaultSession;
      ses.setCertificateVerifyProc((request, callback) => {
        const connection = settings?.connection;
        if (
          connection?.mode === "client" &&
          request.hostname === new URL(connection.serverUrl).hostname
        )
          return callback(
            certificateMatches(
              request.certificate.data,
              request.hostname,
              connection.fingerprint,
            )
              ? 0
              : -2,
          );
        callback(-3);
      });
      ses.setPermissionRequestHandler((_contents, _permission, callback) =>
        callback(false),
      );
      ses.setPermissionCheckHandler(() => false);
      ses.webRequest.onBeforeRequest(
        { urls: ["<all_urls>"] },
        (details, callback) => {
          const url = details.url;
          const local = origin && new URL(url).origin === origin;
          const boot =
            url === bootURL ||
            url === pathToFileURL(path.join(__dirname, "boot.js")).href;
          callback({ cancel: !local && !boot && !url.startsWith("devtools:") });
        },
      );
      ses.webRequest.onBeforeSendHeaders(
        { urls: ["http://127.0.0.1/*"] },
        (details, callback) => {
          if (origin && new URL(details.url).origin === origin)
            details.requestHeaders["X-Desktop-Token"] = token;
          callback({ requestHeaders: details.requestHeaders });
        },
      );
      ses.on("will-download", (_event, item) => {
        if (verify) {
          const folder = path.join(root, "verification-downloads");
          fs.mkdirSync(folder, { recursive: true });
          item.setSavePath(
            path.join(folder, path.basename(item.getFilename())),
          );
        }
      });
      window = new BrowserWindow({
        title: "School Management Desktop Preview",
        width: 1280,
        height: 900,
        minWidth: 760,
        minHeight: 600,
        show: false,
        webPreferences: {
          preload: path.join(__dirname, "preload.cjs"),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          webSecurity: true,
          webviewTag: false,
          allowRunningInsecureContent: false,
          backgroundThrottling: !verify,
        },
      });
      window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      window.webContents.on(
        "did-fail-load",
        (_event, code, _description, _url, mainFrame) => {
          if (
            mainFrame &&
            code !== -3 &&
            settings?.connection.mode === "client" &&
            !loadingClient &&
            !quitting
          ) {
            clearTimeout(clientRetry);
            broadcast("Connection lost. Retrying the Main Server...", true);
            window.loadFile(bootFile);
            clientRetry = setTimeout(connectClient, 5000);
          }
        },
      );
      window.webContents.on("will-navigate", (event, url) => {
        if (!(url === bootURL || (origin && new URL(url).origin === origin)))
          event.preventDefault();
      });
      window.once("ready-to-show", () => {
        if (!verify) window.show();
      });
      ipcMain.handle("preview:status", (event) => {
        sender(event);
        return state;
      });
      ipcMain.handle("preview:configure", async (event, value) => {
        sender(event);
        if (event.senderFrame.url !== bootURL)
          throw new Error(
            "Open Connection settings locally to change this PC's mode.",
          );
        const connection = connectionInput(value);
        await validateAddress(connection);
        clearTimeout(clientRetry);
        restarting = true;
        await stopChild();
        settings = readSettings();
        settings.connection = connection;
        saveSettings(settings);
        origin = "";
        token = "";
        lanInfo = undefined;
        restarting = false;
        // Do not await navigation: the boot renderer is replaced by the workspace.
        start();
        return true;
      });
      ipcMain.handle("preview:retry", async (event) => {
        sender(event);
        if (child) {
          restarting = true;
          await stopChild();
          restarting = false;
        }
        await start();
      });
      ipcMain.handle("preview:choose-mongo", async (event) => {
        sender(event);
        if (
          event.senderFrame.url !== bootURL ||
          settings?.connection.mode === "client"
        )
          throw new Error(
            "MongoDB selection is available only on the local server.",
          );
        const result = await dialog.showOpenDialog(window, {
          properties: ["openFile"],
          filters: [{ name: "MongoDB Server", extensions: ["exe"] }],
        });
        if (!result.canceled) {
          const found = findMongod(result.filePaths[0]);
          settings = readSettings();
          settings.mongod = found.path;
          saveSettings(settings);
          await start();
        }
      });
      ipcMain.handle("preview:activate-recovery", async (event, value) => {
        sender(event);
        if (
          settings?.connection.mode === "client" ||
          !origin ||
          typeof value?.password !== "string" ||
          value.password.length < 1 ||
          value.password.length > 72 ||
          !/^school_recovery_[a-f0-9]{24}$/.test(value.database || "")
        )
          throw new Error("Invalid recovery activation request.");
        await localRequest("/api/desktop/activate-recovery", value);
        restarting = true;
        await window.loadFile(bootFile);
        await stopChild();
        settings.database = value.database;
        saveSettings(settings);
        restarting = false;
        await start();
        return true;
      });
      await window.loadFile(bootFile);
      await start();
    })
    .catch((error) => {
      log(error.message);
      dialog.showErrorBox("Desktop preview startup failed", error.message);
      app.quit();
    });
  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", (event) => {
    if (quitting) return;
    event.preventDefault();
    quitting = true;
    clearTimeout(clientRetry);
    broadcast("Finishing local operations and safely closing MongoDB...");
    stopChild().finally(() => app.exit(0));
  });
}
