const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { X509Certificate } = require("node:crypto");
function powershell(script, input) {
  return new Promise((resolve, reject) => {
    const wrapped = `[Console]::InputEncoding=[Text.UTF8Encoding]::new($false); [Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); try { ${script} } catch { [Console]::Out.Write($_.Exception.Message); exit 1 }`;
    const child = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-WindowStyle",
        "Hidden",
        "-EncodedCommand",
        Buffer.from(wrapped, "utf16le").toString("base64"),
      ],
      { windowsHide: true, stdio: ["pipe", "pipe", "ignore"] },
    );
    let output = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Windows security operation timed out."));
    }, 60000);
    child.stdout.on("data", (data) => {
      output += data;
    });
    child.stdin.on("error", () => {});
    child.on("error", reject);
    child.on("close", (code) => {
      clearTimeout(timer);
      code === 0
        ? resolve(output.trim())
        : reject(
            new Error(
              "Windows could not create or protect the local security files: " +
                output.slice(0, 500),
            ),
          );
    });
    child.stdin.end(JSON.stringify(input));
  });
}
async function protectFile(file) {
  await powershell(
    `$ErrorActionPreference='Stop'; $v=[Console]::In.ReadToEnd()|ConvertFrom-Json; $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value; & "$env:SystemRoot\\System32\\icacls.exe" $v.file '/inheritance:r' '/grant:r' ('*'+$sid+':F') '*S-1-5-18:F' '*S-1-5-32-544:F' | Out-Null; if($LASTEXITCODE -ne 0){throw 'Unable to restrict private file permissions.'}`,
    { file },
  );
}
async function ensureTls(root, serverUrl, password) {
  const folder = path.join(root, "tls");
  fs.mkdirSync(folder, { recursive: true });
  const host = new URL(serverUrl).hostname;
  // Different hostnames get separate identities. Existing certificates are never overwritten silently.
  const name = host.replaceAll(".", "_");
  const pfx = path.join(folder, name + ".pfx"),
    certificate = path.join(folder, name + ".cer");
  if (fs.existsSync(pfx) !== fs.existsSync(certificate))
    throw new Error(
      "Incomplete TLS identity. Retain these files and inspect the TLS directory before retrying.",
    );
  if (!fs.existsSync(pfx)) {
    const script = `$ErrorActionPreference='Stop'; $v=[Console]::In.ReadToEnd()|ConvertFrom-Json; $rsa=[Security.Cryptography.RSACng]::new(3072); $req=[Security.Cryptography.X509Certificates.CertificateRequest]::new('CN='+$v.host,$rsa,[Security.Cryptography.HashAlgorithmName]::SHA256,[Security.Cryptography.RSASignaturePadding]::Pkcs1); $san=[Security.Cryptography.X509Certificates.SubjectAlternativeNameBuilder]::new(); $ip=$null; if([Net.IPAddress]::TryParse($v.host,[ref]$ip)){$san.AddIpAddress($ip)}else{$san.AddDnsName($v.host)}; $req.CertificateExtensions.Add($san.Build()); $req.CertificateExtensions.Add([Security.Cryptography.X509Certificates.X509BasicConstraintsExtension]::new($false,$false,0,$true)); $usage=[Security.Cryptography.X509Certificates.X509KeyUsageFlags]::DigitalSignature -bor [Security.Cryptography.X509Certificates.X509KeyUsageFlags]::KeyEncipherment; $req.CertificateExtensions.Add([Security.Cryptography.X509Certificates.X509KeyUsageExtension]::new($usage,$true)); $oids=[Security.Cryptography.OidCollection]::new(); [void]$oids.Add([Security.Cryptography.Oid]::new('1.3.6.1.5.5.7.3.1')); $req.CertificateExtensions.Add([Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension]::new($oids,$false)); $cert=$req.CreateSelfSigned([DateTimeOffset]::UtcNow.AddMinutes(-5),[DateTimeOffset]::UtcNow.AddYears(2)); [IO.File]::WriteAllBytes($v.pfx,$cert.Export([Security.Cryptography.X509Certificates.X509ContentType]::Pfx,$v.password)); [IO.File]::WriteAllBytes($v.certificate,$cert.Export([Security.Cryptography.X509Certificates.X509ContentType]::Cert)); $cert.Dispose(); $rsa.Dispose()`;
    await powershell(script, { host, pfx, certificate, password });
  }
  await protectFile(pfx);
  const cert = new X509Certificate(fs.readFileSync(certificate));
  if (Date.parse(cert.validTo) <= Date.now())
    throw new Error(
      "The LAN certificate expired. Renew it locally and redistribute the new public identity before enabling LAN access.",
    );
  return {
    pfx: fs.readFileSync(pfx),
    passphrase: password,
    minVersion: "TLSv1.2",
    fingerprint: cert.fingerprint256.replaceAll(":", ""),
    certificate,
  };
}
module.exports = { ensureTls, protectFile };
