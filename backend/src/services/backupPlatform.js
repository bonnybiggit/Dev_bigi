import { spawn } from "node:child_process";
import { fail } from "./schoolConfiguration.js";

export function localBackupUri(uri) {
  // Parse without opening a connection or performing DNS/SRV lookup.
  const match =
    typeof uri === "string" &&
    uri.match(
      /^mongodb:\/\/127\.0\.0\.1:(\d+)\/(dev_bigi_school_local|school_recovery_[a-f0-9]{24})\?replicaSet=([A-Za-z0-9_-]+)$/,
    );
  if (!match || Number(match[1]) < 1 || Number(match[1]) > 65535)
    fail(
      403,
      "Backup & Recovery is available only on the dedicated local installation. Atlas and remote connections are refused.",
    );
  return { port: Number(match[1]), database: match[2], replicaSet: match[3] };
}
export async function assertLocalDatabase(client, uri) {
  const local = localBackupUri(uri);
  const options = client.options;
  if (
    !options ||
    options.srvHost ||
    options.dbName !== local.database ||
    options.replicaSet !== local.replicaSet ||
    options.hosts?.length !== 1 ||
    options.hosts[0].host !== "127.0.0.1" ||
    options.hosts[0].port !== local.port
  )
    fail(
      403,
      "The actual MongoDB client is not the declared local installation. No database command was sent.",
    );
  const hello = await client.db("admin").command({ hello: 1 });
  const conf = (await client.db("admin").command({ replSetGetConfig: 1 }))
    .config;
  if (
    hello.setName !== local.replicaSet ||
    !hello.isWritablePrimary ||
    conf.members.length !== 1 ||
    conf.members[0].host !== `127.0.0.1:${local.port}`
  )
    fail(
      403,
      "Backup database is not the expected single loopback replica set.",
    );
  return local;
}
export async function dpapi(value, unprotect = false) {
  if (process.platform !== "win32")
    fail(409, "Automatic backups require Windows DPAPI on this installation.");
  const operation = unprotect ? "Unprotect" : "Protect";
  const input = unprotect
    ? "[Convert]::FromBase64String($inputText)"
    : "[Text.Encoding]::UTF8.GetBytes($inputText)";
  const output = unprotect
    ? "[Text.Encoding]::UTF8.GetString($result)"
    : "[Convert]::ToBase64String($result)";
  const script = `$ErrorActionPreference='Stop'; [Console]::InputEncoding=[Text.UTF8Encoding]::new($false); [Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); Add-Type -AssemblyName System.Security; $inputText=[Console]::In.ReadToEnd(); $result=[Security.Cryptography.ProtectedData]::${operation}(${input},$null,[Security.Cryptography.DataProtectionScope]::CurrentUser); [Console]::Write(${output})`;
  return new Promise((resolve, reject) => {
    const child = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-WindowStyle",
        "Hidden",
        "-Command",
        script,
      ],
      { windowsHide: true, stdio: ["pipe", "pipe", "ignore"] },
    );
    let text = "";
    child.stdout.setEncoding("utf8");
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Windows passphrase protection timed out."));
    }, 15000);
    child.stdin.once("error", () =>
      reject(new Error("Windows passphrase protection was interrupted.")),
    );
    child.once("close", () => clearTimeout(timer));
    child.stdout.on("data", (data) => {
      text += data.toString();
    });
    child.once("error", () =>
      reject(new Error("Windows DPAPI is unavailable.")),
    );
    child.once("close", (code) =>
      code === 0
        ? resolve(text)
        : reject(
            new Error(
              "Windows cannot unlock the automatic-backup passphrase. Reconfigure it for this Windows account.",
            ),
          ),
    );
    child.stdin.end(value);
  });
}
export function summaryPdf(job) {
  const clean = (value) =>
    String(value ?? "")
      .normalize("NFKD")
      .replace(/[^\x20-\x7e]/g, "?");
  const lines = [
    "SCHOOL DATABASE BACKUP SUMMARY",
    `Backup: ${job._id}`,
    `Created: ${new Date(job.createdAt).toISOString()}`,
    `Status: ${job.status}`,
    `Type: ${job.kind}`,
    "Encryption: AES-256-GCM / scrypt; recovery passphrase required",
    `SHA-256: ${job.sha256 || "not available"}`,
    `Encrypted bytes: ${job.bytes || 0}`,
    "Schools:",
    ...(job.manifest?.schools || []).map((s) => `${s.name} [${s.id}]`),
    "Collections / retained record counts:",
    ...(job.manifest?.collections || []).map((c) => `${c.name}: ${c.count}`),
    "Includes retained accounts, records, school logos and settings.",
    "Keep the encrypted backup and recovery passphrase separately.",
    "This PDF is a summary, not a restorable database backup.",
  ];
  const wrapped = lines.flatMap(
    (line) => clean(line).match(/.{1,88}/g) || [""],
  );
  const pages = [];
  for (let i = 0; i < wrapped.length; i += 46)
    pages.push(wrapped.slice(i, i + 46));
  const objects = [
    null,
    "<< /Type /Catalog /Pages 2 0 R >>",
    null,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const children = [];
  for (const page of pages) {
    const id = objects.length,
      streamId = id + 1;
    children.push(`${id} 0 R`);
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${streamId} 0 R >>`,
    );
    const content = `BT /F1 10 Tf 40 800 Td 16 TL ${page.map((line, i) => `${i ? "T* " : ""}(${line.replace(/([\\()])/g, "\\$1")}) Tj`).join("\n")} ET`;
    objects.push(
      `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    );
  }
  objects[2] = `<< /Type /Pages /Count ${pages.length} /Kids [${children.join(" ")}] >>`;
  let pdf = "%PDF-1.4\n",
    offsets = [0];
  for (let i = 1; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const start = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((n) => `${String(n).padStart(10, "0")} 00000 n \n`)
    .join(
      "",
    )}trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return Buffer.from(pdf);
}
