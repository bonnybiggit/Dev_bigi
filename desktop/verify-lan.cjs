// Real installed Electron server + separate client profile, plus TLS browser sessions.
// --keep-server waits for Enter after automated checks for a second-device drill.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const https = require("node:https");
const assert = require("node:assert/strict");
const { spawn, spawnSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const { X509Certificate } = require("node:crypto");
const resume = process.argv
  .find((v) => v.startsWith("--resume-run="))
  ?.slice(13);
if (resume && !/^lan-drill-\d+$/.test(resume))
  throw new Error("Invalid synthetic LAN fixture directory");
const root = path.resolve(__dirname, ".."),
  run = path.join(root, ".local", resume || `lan-drill-${Date.now()}`),
  install = path.join(run, "application");
const mainData = path.join(run, "main"),
  clientData = path.join(run, "client");
const ip = Object.values(os.networkInterfaces())
  .flat()
  .find(
    (n) =>
      n?.family === "IPv4" &&
      !n.internal &&
      /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(n.address),
  )?.address;
assert(ip, "Connect this PC to a private IPv4 LAN first.");
const serverUrl = `https://${ip}:5443`,
  password = "Synthetic-LAN-test-2026!",
  email = "admin@lan-preview.test";
const executable = path.join(install, "School Management Desktop Preview.exe");
const bootURL = pathToFileURL(
  path.join(install, "resources", "app.asar", "desktop", "boot.html"),
).href;
const checks = [],
  processes = [];
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
class Desktop {
  constructor(data, port) {
    this.data = data;
    this.port = port;
    this.id = 0;
    this.pending = new Map();
  }
  async launch(standalone = false) {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    this.child = spawn(
      executable,
      [
        "--preview-verify",
        ...(standalone ? ["--preview-standalone"] : []),
        `--preview-data-dir=${this.data}`,
        `--remote-debugging-port=${this.port}`,
        "--remote-debugging-address=127.0.0.1",
      ],
      { env, windowsHide: true, stdio: "ignore" },
    );
    processes.push(this);
    for (let i = 0; i < 180; i++) {
      try {
        const pages = await (
          await fetch(`http://127.0.0.1:${this.port}/json/list`, {
            signal: AbortSignal.timeout(1500),
          })
        ).json();
        const page = pages.find(
          (p) =>
            p.type === "page" &&
            (p.url.startsWith("http") || p.url === bootURL),
        );
        if (page) {
          this.socket = new WebSocket(page.webSocketDebuggerUrl);
          await new Promise((resolve, reject) => {
            this.socket.onopen = resolve;
            this.socket.onerror = reject;
          });
          this.socket.onmessage = ({ data }) => {
            const r = JSON.parse(data),
              p = this.pending.get(r.id);
            if (p) {
              this.pending.delete(r.id);
              clearTimeout(p.timer);
              r.error
                ? p.reject(new Error(r.error.message))
                : p.resolve(r.result);
            }
          };
          for (let j = 0; j < 60; j++) {
            try {
              if (
                await this.evaluate(
                  "document.readyState === 'complete' && Boolean(window.desktopPreview)",
                )
              ) {
                await pause(200);
                return;
              }
            } catch {
              /* wait for renderer */
            }
            await pause(250);
          }
          throw new Error("Renderer did not finish its initial navigation");
        }
      } catch {
        /* Wait for Electron to create its page. */
      }
      assert.equal(this.child.exitCode, null, "Desktop exited at startup");
      await pause(1000);
    }
    throw new Error("Desktop startup timed out");
  }
  call(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out: ${method}`));
      }, 45000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const r = await this.call("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails)
      throw new Error(
        r.exceptionDetails.exception?.description || r.exceptionDetails.text,
      );
    return r.result.value;
  }
  async waitOrigin(origin) {
    for (let i = 0; i < 120; i++) {
      try {
        if (
          await this.evaluate(
            `location.origin === ${JSON.stringify(origin)} && document.readyState === 'complete'`,
          )
        )
          return;
      } catch {
        /* Navigation replaces contexts. */
      }
      await pause(500);
    }
    throw new Error("Workspace did not load " + origin);
  }
  async configure(connection) {
    if ((await this.evaluate("location.href")) !== bootURL)
      await this.call("Page.navigate", { url: bootURL });
    for (let i = 0; i < 60; i++) {
      try {
        if (
          await this.evaluate(
            "document.readyState === 'complete' && Boolean(window.desktopPreview)",
          )
        )
          break;
      } catch {
        /* navigation */
      }
      await pause(250);
    }
    await pause(500);
    await this.evaluate(
      `window.desktopPreview.configure(${JSON.stringify(connection)})`,
    );
  }
  async api(route, body, expected = 200) {
    const r = await this.evaluate(
      `(async()=>{let r=await fetch(${JSON.stringify("/api" + route)},{method:${JSON.stringify(body ? "POST" : "GET")},headers:{"Content-Type":"application/json"},${body ? `body:JSON.stringify(${JSON.stringify(body)}),` : ""}});let t=await r.text();return {status:r.status,body:t?JSON.parse(t):null}})()`,
    );
    assert.equal(r.status, expected, JSON.stringify(r.body));
    return r.body;
  }
  async stop() {
    if (this.child.exitCode !== null) return;
    this.socket.send(
      JSON.stringify({ id: ++this.id, method: "Browser.close" }),
    );
    for (let i = 0; i < 120 && this.child.exitCode === null; i++)
      await pause(500);
    assert.notEqual(this.child.exitCode, null, "Graceful shutdown timed out");
    this.socket.close();
  }
}
function browser(origin, ca) {
  const agent = new https.Agent({ ca });
  let cookie = "";
  return {
    agent,
    request: (route, body) =>
      new Promise((resolve, reject) => {
        const request = https.request(
          origin + route,
          {
            agent,
            timeout: 5000,
            method: body ? "POST" : "GET",
            headers: {
              ...(body ? { "Content-Type": "application/json", origin } : {}),
              ...(cookie ? { cookie } : {}),
            },
          },
          (res) => {
            if (res.headers["set-cookie"])
              cookie = res.headers["set-cookie"][0].split(";")[0];
            let text = "";
            res.on("data", (v) => {
              text += v;
            });
            res.on("end", () => resolve({ status: res.statusCode, text }));
          },
        );
        request.on("error", reject);
        request.on("timeout", () =>
          request.destroy(new Error("Request timed out")),
        );
        request.end(body ? JSON.stringify(body) : undefined);
      }),
  };
}
(async () => {
  fs.mkdirSync(run, { recursive: true });
  const installed = resume
    ? { status: 0 }
    : spawnSync(
        path.join(root, "release", "setup.exe"),
        ["/S", `/D=${install}`],
        { windowsHide: true, windowsVerbatimArguments: true, timeout: 180000 },
      );
  assert.equal(installed.status, 0);
  const main = new Desktop(mainData, 9340);
  await main.launch(true);
  for (let i = 0; i < 120; i++) {
    try {
      if ((await main.evaluate("location.protocol")) === "http:") break;
    } catch {
      /* wait */
    }
    await pause(500);
  }
  if (!resume)
    await main.api(
      "/desktop/setup",
      {
        mode: "school",
        owner: {
          name: "Synthetic LAN Owner",
          email: "owner@lan-preview.test",
          password,
        },
        administrator: { name: "Synthetic LAN Administrator", email, password },
        school: {
          name: "Synthetic LAN Verification School",
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
  await main.configure({ mode: "server", serverUrl });
  let lan;
  for (let i = 0; i < 120; i++) {
    try {
      lan = (await main.evaluate("window.desktopPreview.status()"))?.lan;
      if (lan) break;
    } catch {
      /* wait for restarted server */
    }
    await pause(500);
  }
  assert(lan, "Main Server did not publish its TLS identity");
  const cert = new X509Certificate(fs.readFileSync(lan.certificate));
  const a = browser(serverUrl, cert.toString()),
    b = browser(serverUrl, cert.toString());
  assert.equal((await a.request("/")).status, 200);
  assert.equal(
    (await a.request("/api/auth/school-login", { email, password })).status,
    200,
  );
  assert.equal((await b.request("/api/school/profile")).status, 401);
  assert.equal(
    (await b.request("/api/auth/school-login", { email, password })).status,
    200,
  );
  checks.push(
    "installed Main Server serves two independent authenticated HTTPS sessions on its LAN interface",
  );
  const client = new Desktop(clientData, 9341);
  await client.launch();
  assert(
    !fs.existsSync(path.join(clientData, "mongodb")),
    "Unconfigured client started MongoDB",
  );
  await client.configure({
    mode: "client",
    serverUrl,
    fingerprint: lan.fingerprint,
  });
  await client.waitOrigin(serverUrl);
  assert.equal(
    (await client.api("/auth/school-login", { email, password })).user.role,
    "school_admin",
  );
  assert(
    !fs.existsSync(path.join(clientData, "mongodb")),
    "Client created local database files",
  );
  assert(
    !JSON.parse(fs.readFileSync(path.join(clientData, "installation.json")))
      .securityProtected,
    "Client created local server credentials",
  );
  checks.push(
    "separate installed LAN Client profile connects with a certificate pin and starts no local MongoDB/backend",
  );
  await client.configure({
    mode: "client",
    serverUrl,
    fingerprint: "00".repeat(32),
  });
  await pause(7000);
  assert.equal(await client.evaluate("location.protocol"), "file:");
  checks.push(
    "desktop client rejects an incorrect server certificate fingerprint",
  );
  await client.configure({
    mode: "client",
    serverUrl,
    fingerprint: lan.fingerprint,
  });
  await client.waitOrigin(serverUrl);
  await main.stop();
  await pause(7000);
  assert(
    (await client.evaluate("document.body.innerText")).includes(
      "Server connection lost",
    ),
  );
  const restarted = new Desktop(mainData, 9340);
  await restarted.launch();
  for (let i = 0; i < 120; i++) {
    try {
      if ((await a.request("/api/health")).status === 200) break;
    } catch {
      /* wait for main restart */
    }
    await pause(500);
  }
  assert.equal((await a.request("/api/auth/me")).status, 200);
  await pause(7000);
  assert(
    (await client.evaluate("document.body.innerText")).includes(
      "Server connection restored",
    ),
  );
  checks.push(
    "server restart preserves LAN sessions and database records; the client detects loss and recovery",
  );
  assert.equal((await a.request("/api/backups/")).status, 403);
  checks.push("LAN backup administration remains denied");
  await client.stop();
  a.agent.destroy();
  b.agent.destroy();
  const access = {
    serverUrl,
    fingerprint: lan.fingerprint,
    certificate: lan.certificate,
    email,
    password,
    syntheticOnly: true,
  };
  fs.writeFileSync(
    path.join(run, "access.json"),
    JSON.stringify(access, null, 2),
  );
  console.log(
    JSON.stringify(
      { checks, access, evidence: path.join(run, "result.json") },
      null,
      2,
    ),
  );
  if (process.argv.includes("--keep-server")) {
    console.log(
      "Synthetic Main Server remains running for the second-device check. Press Enter to stop it gracefully.",
    );
    await new Promise((resolve) => {
      process.stdin.resume();
      process.stdin.once("data", resolve);
    });
  }
  await restarted.stop();
  const uninstaller = fs
    .readdirSync(install)
    .find((n) => /^Uninstall.*\.exe$/i.test(n));
  assert.equal(
    spawnSync(path.join(install, uninstaller), ["/S"], {
      windowsHide: true,
      windowsVerbatimArguments: true,
      timeout: 180000,
    }).status,
    0,
  );
  fs.writeFileSync(
    path.join(run, "result.json"),
    JSON.stringify(
      {
        verifiedAt: new Date().toISOString(),
        checks,
        mainData,
        clientData,
        syntheticOnly: true,
        physicalSecondDevice: "requires user confirmation",
      },
      null,
      2,
    ),
  );
  process.stdin.pause();
})().catch(async (error) => {
  console.error(error.message);
  fs.writeFileSync(
    path.join(run, "failure.json"),
    JSON.stringify({ checks, error: error.message }, null, 2),
  );
  for (const p of processes.reverse()) {
    try {
      await p.stop();
    } catch {
      /* retain fixture on shutdown failure */
    }
  }
  process.exitCode = 1;
});
