// Opt-in Windows integration drill. Uses synthetic accounts and a separate retained data directory.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { spawn, spawnSync } = require("node:child_process");
const { randomBytes } = require("node:crypto");
const resume = process.argv
  .find((v) => v.startsWith("--resume-run="))
  ?.slice(13);
if (resume && !/^desktop-drill-\d+$/.test(resume))
  throw new Error("Invalid synthetic drill directory");
const root = path.resolve(__dirname, ".."),
  run = path.join(root, ".local", resume || `desktop-drill-${Date.now()}`),
  install = path.join(run, "application"),
  data = path.join(run, "persistent"),
  setup = path.join(root, "release", "setup.exe"),
  executable = path.join(install, "School Management Desktop Preview.exe");
const password = randomBytes(24).toString("hex"),
  passphrase = randomBytes(32).toString("hex");
const checks = [];
let child,
  socket,
  nextId = 0;
const pending = new Map();
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
function installed() {
  const result = spawnSync(setup, ["/S", `/D=${install}`], {
    windowsHide: true,
    windowsVerbatimArguments: true,
    timeout: 180000,
  });
  assert.equal(result.status, 0, "NSIS installation failed");
  assert(fs.existsSync(executable));
}
async function cdp(method, params = {}) {
  const id = ++nextId;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error(`Desktop verification timed out: ${method}`));
    }, 90000);
    pending.set(id, {
      resolve: (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      reject: (error) => {
        clearTimeout(timer);
        reject(error);
      },
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
}
async function evaluate(expression) {
  const r = await cdp("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (r.exceptionDetails)
    throw new Error(
      r.exceptionDetails.text + " " + r.exceptionDetails.exception?.description,
    );
  return r.result.value;
}
async function launch() {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  child = spawn(
    executable,
    [
      "--preview-verify",
      "--preview-standalone",
      `--preview-data-dir=${data}`,
      "--remote-debugging-port=9338",
      "--remote-debugging-address=127.0.0.1",
    ],
    { windowsHide: true, stdio: "ignore", env },
  );
  for (let i = 0; i < 180; i++) {
    try {
      const pages = await (
        await fetch("http://127.0.0.1:9338/json/list")
      ).json();
      const page = pages.find(
        (p) => p.type === "page" && p.url.startsWith("http://127.0.0.1:"),
      );
      if (page) {
        socket = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((resolve, reject) => {
          socket.onopen = resolve;
          socket.onerror = reject;
        });
        socket.onmessage = ({ data: message }) => {
          const r = JSON.parse(message),
            p = pending.get(r.id);
          if (p) {
            pending.delete(r.id);
            r.error
              ? p.reject(new Error(r.error.message))
              : p.resolve(r.result);
          }
        };
        return;
      }
    } catch {
      /* Startup may include replica-set election. */
    }
    if (child.exitCode !== null)
      throw new Error("Desktop exited during startup");
    await pause(1000);
  }
  throw new Error("Desktop startup timed out; inspect retained drill logs");
}
async function api(route, body, expected = 200) {
  const r = await evaluate(
    `(async()=>{const r=await fetch(${JSON.stringify("/api" + route)}, {method:${JSON.stringify(body ? "POST" : "GET")},headers:{"Content-Type":"application/json"},${body ? `body:JSON.stringify(${JSON.stringify(body)}),` : ""}}); const text=await r.text(); return {status:r.status,body:text?JSON.parse(text):null}})()`,
  );
  assert.equal(r.status, expected, JSON.stringify(r.body));
  return r.body;
}
async function close() {
  if (!child || child.exitCode !== null) return;
  // Chromium may close the socket without replying to Browser.close.
  socket.send(JSON.stringify({ id: ++nextId, method: "Browser.close" }));
  for (let i = 0; i < 120 && child.exitCode === null; i++) await pause(500);
  assert.notEqual(child.exitCode, null, "Graceful desktop shutdown timed out");
  socket?.close();
}
async function login(school = false) {
  return api(school ? "/auth/school-login" : "/auth/login", {
    email: school ? "admin@preview.test" : "owner@preview.test",
    password,
  });
}
(async () => {
  assert.equal(process.platform, "win32");
  fs.mkdirSync(run, { recursive: true });
  if (!resume) installed();
  assert(fs.existsSync(executable));
  checks.push("NSIS silent installation");
  console.log("Installed; opening bundled application.");
  await launch();
  for (let i = 0; i < 30; i++) {
    if (
      (await evaluate("document.body?.innerText || ''")).includes(
        "Set up your school installation",
      )
    )
      break;
    await pause(1000);
  }
  assert(
    (await evaluate("document.body.innerText")).includes(
      "Set up your school installation",
    ),
  );
  assert.equal((await api("/desktop/setup")).setupRequired, true);
  const registration = await api(
    "/desktop/setup",
    {
      mode: "school",
      owner: { name: "Synthetic Owner", email: "owner@preview.test", password },
      administrator: {
        name: "Synthetic Administrator",
        email: "admin@preview.test",
        password,
      },
      school: {
        name: "Synthetic Offline Preview School",
        address: "1 Test Road",
        city: "Lagos",
        country: "Nigeria",
        phone: "",
        email: "",
        schoolType: "Primary",
        logoUrl: "",
      },
    },
    201,
  );
  checks.push("empty independent first-run school and account registration");
  assert.equal((await login(true)).user.role, "school_admin");
  await api("/auth/logout", {}, 204);
  assert.equal((await login()).user.role, "super_admin");
  checks.push("school administrator and owner login");
  console.log("First-run registration and both logins passed.");
  const external = await evaluate(
    'fetch("https://example.com").then(()=>false,()=>true)',
  );
  assert.equal(external, true);
  checks.push("renderer external network blocked");
  const origin = await evaluate("location.origin");
  assert.equal((await fetch(origin + "/api/health")).status, 403);
  checks.push("outside localhost client rejected without launch token");
  const backup = (
    await api("/backups/", { currentPassword: password, passphrase }, 201)
  ).backup;
  const archive = path.join(data, "backups", backup._id + ".schoolbackup");
  assert(fs.statSync(archive).size > 0);
  await api(`/backups/${backup._id}/inspect`, {
    currentPassword: password,
    passphrase,
  });
  const recovery = (
    await api(
      `/backups/${backup._id}/restore`,
      {
        currentPassword: password,
        passphrase,
        schoolIds: [registration.schoolId],
        confirmation: "RESTORE",
        reason: "Synthetic desktop integration drill",
      },
      201,
    )
  ).recovery;
  checks.push("encrypted backup and verified restore");
  console.log("Backup and restore passed; checking reinstall persistence.");
  await close();
  installed();
  checks.push("NSIS reinstall over existing version");
  assert(fs.existsSync(archive));
  await launch();
  assert.equal((await api("/desktop/setup")).setupRequired, false);
  await login();
  assert((await api("/backups/")).backups.some((b) => b._id === backup._id));
  checks.push(
    "restart and reinstall preserve accounts, school and backup history/files",
  );
  console.log("Reinstall persistence passed; activating verified recovery.");
  // Exercise the same protected IPC used by the recovery activation button.
  await evaluate(
    `window.desktopPreview.activateRecovery(${JSON.stringify(recovery.targetDatabase)},${JSON.stringify(password)})`,
  ).catch(() => {});
  await pause(5000);
  socket.close();
  // Reconnect to the new renderer/backend origin after activation.
  for (let i = 0; i < 60; i++) {
    const settings = JSON.parse(
      fs.readFileSync(path.join(data, "installation.json")),
    );
    if (settings.database === recovery.targetDatabase) break;
    await pause(1000);
  }
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(data, "installation.json"))).database,
    recovery.targetDatabase,
  );
  // Close through a fresh browser connection after navigation.
  const browser = await (
    await fetch("http://127.0.0.1:9338/json/version")
  ).json();
  socket = new WebSocket(browser.webSocketDebuggerUrl);
  await new Promise((r) => {
    socket.onopen = r;
  });
  socket.onmessage = ({ data: message }) => {
    const r = JSON.parse(message),
      p = pending.get(r.id);
    if (p) {
      pending.delete(r.id);
      p.resolve(r.result);
    }
  };
  await close();
  await launch();
  await login();
  assert.equal((await api("/desktop/setup")).setupRequired, false);
  checks.push(
    "verified recovery activation, restored login and persistent selection after restart",
  );
  await close();
  const uninstaller = fs
    .readdirSync(install)
    .find((name) => /^Uninstall.*\.exe$/i.test(name));
  assert(uninstaller, "NSIS uninstaller missing");
  const removed = spawnSync(path.join(install, uninstaller), ["/S"], {
    windowsHide: true,
    windowsVerbatimArguments: true,
    timeout: 180000,
  });
  assert.equal(removed.status, 0, "NSIS uninstall failed");
  for (let i = 0; i < 120 && fs.existsSync(executable); i++) await pause(500);
  assert(!fs.existsSync(executable), "Uninstall did not remove program files");
  assert(fs.existsSync(archive));
  assert(fs.existsSync(path.join(data, "mongodb", "data", "WiredTiger")));
  assert.equal(
    JSON.parse(fs.readFileSync(path.join(data, "installation.json"))).database,
    recovery.targetDatabase,
  );
  checks.push(
    "uninstall retains databases, recovery selection and encrypted backups",
  );
  fs.writeFileSync(
    path.join(run, "result.json"),
    JSON.stringify(
      {
        verifiedAt: new Date().toISOString(),
        checks,
        data,
        install,
        syntheticOnly: true,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify(
      { checks, evidence: path.join(run, "result.json") },
      null,
      2,
    ),
  );
})().catch(async (error) => {
  console.error(error);
  fs.writeFileSync(
    path.join(run, "failure.json"),
    JSON.stringify({ checks, error: error.message }, null, 2),
  );
  try {
    await close();
  } catch {
    /* Retain evidence and do not force-kill database. */
  }
  process.exitCode = 1;
});
