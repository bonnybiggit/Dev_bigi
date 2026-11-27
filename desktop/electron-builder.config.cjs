const path = require("node:path");
module.exports = {
  appId: "org.schoolmanagement.desktop.preview",
  productName: "School Management Desktop Preview",
  executableName: "School Management Desktop Preview",
  // NSIS treats the exact setup.exe filename as a compatibility-shim warning.
  // Compile under this name, then give the finished artifact its requested name.
  artifactName: "SchoolDesktopPreviewInstaller.exe",
  directories: {
    output: path.resolve(__dirname, "../release"),
    buildResources: path.join(__dirname, "installer"),
  },
  electronDist: path.resolve(__dirname, "../node_modules/electron/dist"),
  electronVersion: require("../node_modules/electron/package.json").version,
  asar: true,
  npmRebuild: false,
  forceCodeSigning: false,
  files: [
    "desktop/**/*",
    "backend/**/*",
    "frontend/dist/**/*",
    "package.json",
    "node_modules/**/*",
    "!**/.env*",
    "!**/test/**",
    "!**/tests/**",
    "!**/*.map",
    "!**/README*",
  ],
  asarUnpack: ["**/*.node", "**/prebuilds/**/*"],
  win: {
    target: [{ target: "nsis", arch: ["x64"] }],
    signAndEditExecutable: false,
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowElevation: false,
    allowToChangeInstallationDirectory: false,
    deleteAppDataOnUninstall: false,
    runAfterFinish: false,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: "School Desktop Preview",
    include: path.join(__dirname, "installer", "preserve-data.nsh"),
  },
  publish: null,
};
