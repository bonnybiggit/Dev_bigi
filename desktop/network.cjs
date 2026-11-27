const { isIP } = require("node:net");
const os = require("node:os");
const { lookup } = require("node:dns/promises");
const { X509Certificate } = require("node:crypto");
function privateAddress(host) {
  if (!isIP(host) || host.includes(":")) return false;
  const [a, b] = host.split(".").map(Number);
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  );
}
function connectionInput(value) {
  if (!value || !["standalone", "server", "client"].includes(value.mode))
    throw new Error("Choose Standalone, Main Server or LAN Client.");
  if (value.mode === "standalone") return { mode: "standalone" };
  let url;
  try {
    url = new URL(value.serverUrl);
  } catch {
    throw new Error(
      "Enter an HTTPS server address, for example https://192.168.1.10:5443.",
    );
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    Number(url.port || 443) < 1024 ||
    Number(url.port) === 27028
  )
    throw new Error(
      "Use HTTPS, a port from 1024–65535 other than 27028, and no path or embedded credentials.",
    );
  const host = url.hostname;
  if (
    isIP(host)
      ? !privateAddress(host)
      : !/^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?(?:\.local)?$/i.test(host)
  )
    throw new Error(
      "Use a private IPv4 LAN address or a local computer name (.local is optional).",
    );
  const fingerprint = String(value.fingerprint || "")
    .replaceAll(":", "")
    .toUpperCase();
  if (value.mode === "client" && !/^[A-F0-9]{64}$/.test(fingerprint))
    throw new Error(
      "Enter the main server's SHA-256 certificate fingerprint, obtained directly from its operator.",
    );
  return {
    mode: value.mode,
    serverUrl: url.origin,
    ...(value.mode === "client" ? { fingerprint } : {}),
  };
}
async function validateAddress(connection) {
  if (connection.mode === "standalone") return;
  const host = new URL(connection.serverUrl).hostname;
  const addresses = isIP(host)
    ? [{ address: host }]
    : await lookup(host, { all: true, family: 4 });
  if (
    !addresses.length ||
    addresses.some(({ address }) => !privateAddress(address))
  )
    throw new Error(
      "The server name must resolve only to a private LAN IPv4 address.",
    );
  if (connection.mode === "server") {
    const local = Object.values(os.networkInterfaces())
      .flat()
      .filter(Boolean)
      .map((n) => n.address);
    if (addresses.some(({ address }) => !local.includes(address)))
      throw new Error("Main Server must use an address assigned to this PC.");
  }
  return addresses[0].address;
}
function certificateMatches(pem, hostname, fingerprint) {
  try {
    const cert = new X509Certificate(pem),
      now = Date.now();
    return (
      cert.fingerprint256.replaceAll(":", "").toUpperCase() === fingerprint &&
      now >= Date.parse(cert.validFrom) &&
      now <= Date.parse(cert.validTo) &&
      Boolean(
        isIP(hostname) ? cert.checkIP(hostname) : cert.checkHost(hostname),
      )
    );
  } catch {
    return false;
  }
}
async function probeClient(connection) {
  const address = await validateAddress(connection),
    url = new URL(connection.serverUrl);
  await new Promise((resolve, reject) => {
    // No HTTP request or account credential is sent until the certificate pin is verified.
    const socket = require("node:tls").connect({
      host: address,
      port: Number(url.port),
      ...(isIP(url.hostname) ? {} : { servername: url.hostname }),
      rejectUnauthorized: false,
    });
    socket.setTimeout(5000);
    socket.once("timeout", () =>
      socket.destroy(new Error("Main Server connection timed out.")),
    );
    socket.once("error", reject);
    socket.once("secureConnect", () => {
      const peer = socket.getPeerCertificate();
      const valid =
        peer.raw &&
        certificateMatches(peer.raw, url.hostname, connection.fingerprint);
      socket.end();
      valid
        ? resolve()
        : reject(
            new Error(
              "The Main Server certificate fingerprint, name or validity does not match.",
            ),
          );
    });
  });
}
module.exports = {
  privateAddress,
  connectionInput,
  validateAddress,
  certificateMatches,
  probeClient,
};
