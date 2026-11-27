const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const root = path.resolve(__dirname, ".."),
  stage = path.join(root, ".local", "desktop-stage"),
  output = path.join(root, ".local", `desktop-package-${Date.now()}`);
function run(file, args, cwd = root, extra = {}) {
  const result = spawnSync(file, args, {
    cwd,
    stdio: "inherit",
    windowsHide: true,
    env: {
      ...process.env,
      CSC_IDENTITY_AUTO_DISCOVERY: "false",
      npm_config_offline: "false",
      ELECTRON_BUILDER_CACHE: path.join(
        root,
        ".local",
        "electron-builder-cache",
      ),
      ...extra,
    },
  });
  if (result.error || result.status !== 0)
    throw new Error(
      `Build step failed: ${path.basename(file)} (${result.error?.code || result.status}).`,
    );
}
function inspect(folder, prefix = "") {
  const entries = [];
  for (const item of fs.readdirSync(folder, { withFileTypes: true })) {
    const relative = path.join(prefix, item.name);
    if (item.isSymbolicLink()) throw new Error("Unexpected build-stage link.");
    if (item.isDirectory())
      entries.push(...inspect(path.join(folder, item.name), relative));
    else entries.push(relative.replaceAll("\\", "/"));
  }
  return entries;
}
try {
  if (process.platform !== "win32")
    throw new Error("Build this Windows preview on Windows.");
  if (
    !fs.existsSync(
      path.join(root, "node_modules", "electron", "dist", "electron.exe"),
    )
  )
    throw new Error(
      "Electron Windows runtime is missing. Run the Electron package installer first.",
    );
  const sourcePackage = JSON.parse(
    fs.readFileSync(path.join(__dirname, "package.json")),
  );
  if (!/^\d+\.\d+\.\d+$/.test(sourcePackage.version))
    throw new Error("Invalid preview version.");
  // Only this generated, marked staging directory is ever removed; persistent data is elsewhere.
  if (fs.existsSync(stage)) {
    const marker = path.join(stage, ".preview-stage");
    if (
      !fs.existsSync(marker) ||
      path.resolve(stage) !== path.join(root, ".local", "desktop-stage") ||
      fs.realpathSync(stage).toLowerCase() !== stage.toLowerCase()
    )
      throw new Error("Refusing to replace an unrecognized build directory.");
    fs.rmSync(stage, { recursive: true });
  }
  fs.mkdirSync(stage, { recursive: true });
  fs.writeFileSync(
    path.join(stage, ".preview-stage"),
    "generated build staging only\n",
  );
  run(
    process.execPath,
    [
      path.join(root, "node_modules", "vite", "bin", "vite.js"),
      "build",
      "--mode",
      "desktop",
    ],
    path.join(root, "frontend"),
    { VITE_API_URL: "/api" },
  );
  fs.mkdirSync(path.join(stage, "desktop"));
  for (const name of [
    "main.cjs",
    "runtime.cjs",
    "mongo.cjs",
    "network.cjs",
    "tls.cjs",
    "preload.cjs",
    "boot.html",
    "boot.js",
  ])
    fs.copyFileSync(
      path.join(__dirname, name),
      path.join(stage, "desktop", name),
    );
  fs.cpSync(
    path.join(root, "frontend", "dist"),
    path.join(stage, "frontend", "dist"),
    { recursive: true },
  );
  fs.mkdirSync(path.join(stage, "backend"));
  fs.copyFileSync(
    path.join(root, "backend", "package.json"),
    path.join(stage, "backend", "package.json"),
  );
  fs.cpSync(
    path.join(root, "backend", "src"),
    path.join(stage, "backend", "src"),
    {
      recursive: true,
      filter: (source) => {
        const relative = path
          .relative(path.join(root, "backend", "src"), source)
          .replaceAll("\\", "/");
        return (
          !relative.startsWith("scripts") &&
          ![
            "server.js",
            "config.js",
            "db.js",
            "services/seedSuperAdmin.js",
          ].includes(relative)
        );
      },
    },
  );
  const dependencies = {};
  for (const name of Object.keys(
    require("../backend/package.json").dependencies,
  ))
    dependencies[name] = require(
      path.join(root, "node_modules", name, "package.json"),
    ).version;
  fs.writeFileSync(
    path.join(stage, "package.json"),
    JSON.stringify({ ...sourcePackage, dependencies }, null, 2),
  );
  const npmCli = path.join(
    path.dirname(process.execPath),
    "node_modules",
    "npm",
    "bin",
    "npm-cli.js",
  );
  run(
    process.execPath,
    [
      npmCli,
      "install",
      "--omit=dev",
      "--ignore-scripts",
      "--workspaces=false",
      "--offline=false",
      "--cache",
      path.join(root, ".local", "npm-cache"),
      "--no-audit",
      "--no-fund",
    ],
    stage,
  );
  const files = inspect(stage);
  if (
    files.some((file) =>
      /(^|\/)(\.env[^/]*|\.git|\.local|\.aws|\.codex|\.agents)(\/|$)|\.schoolbackup$|\/mongod\.log$/.test(
        file,
      ),
    )
  )
    throw new Error(
      "A private environment or data file entered the build stage.",
    );
  fs.writeFileSync(
    path.join(root, ".local", "desktop-build-manifest.json"),
    JSON.stringify(
      {
        version: sourcePackage.version,
        createdAt: new Date().toISOString(),
        applicationFiles: files.filter((f) => !f.startsWith("node_modules/")),
        personalDataBundled: false,
        environmentFilesBundled: false,
      },
      null,
      2,
    ),
  );
  run(process.execPath, [
    path.join(root, "node_modules", "electron-builder", "out", "cli", "cli.js"),
    "--projectDir",
    stage,
    "--config",
    path.join(__dirname, "electron-builder.config.cjs"),
    `--config.directories.output=${output}`,
    "--win",
    "nsis",
    "--x64",
    "--publish",
    "never",
  ]);
  const setup = path.join(root, "release", "setup.exe");
  fs.mkdirSync(path.dirname(setup), { recursive: true });
  fs.copyFileSync(
    path.join(output, "SchoolDesktopPreviewInstaller.exe"),
    `${setup}.next`,
  );
  fs.renameSync(`${setup}.next`, setup);
  const blockmap = path.join(
    output,
    "SchoolDesktopPreviewInstaller.exe.blockmap",
  );
  if (fs.existsSync(blockmap)) fs.copyFileSync(blockmap, `${setup}.blockmap`);
  fs.writeFileSync(
    path.join(root, "release", "setup.exe.sha256"),
    `${createHash("sha256").update(fs.readFileSync(setup)).digest("hex")}  setup.exe\n`,
  );
  console.log("Desktop preview installer created: release/setup.exe");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
