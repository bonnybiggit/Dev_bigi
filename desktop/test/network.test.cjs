const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  connectionInput,
  validateAddress,
  certificateMatches,
} = require("../network.cjs");
test("connection modes reject plaintext, public hosts, credentials, paths and missing pins", async () => {
  assert.deepEqual(connectionInput({ mode: "standalone" }), {
    mode: "standalone",
  });
  for (const serverUrl of [
    "http://192.168.1.2:5443",
    "https://8.8.8.8:5443",
    "https://example.com:5443",
    "https://user:pw@192.168.1.2:5443",
    "https://192.168.1.2:5443/path",
    "https://192.168.1.2:27028",
  ])
    assert.throws(() => connectionInput({ mode: "server", serverUrl }));
  assert.throws(() =>
    connectionInput({ mode: "client", serverUrl: "https://192.168.1.2:5443" }),
  );
  assert.equal(
    connectionInput({
      mode: "client",
      serverUrl: "https://192.168.1.2:5443/",
      fingerprint: "ab:".repeat(31) + "ab",
    }).fingerprint,
    "AB".repeat(32),
  );
  await validateAddress({
    mode: "server",
    serverUrl: "https://127.0.0.1:5443",
  });
  await assert.rejects(
    validateAddress({
      mode: "server",
      serverUrl: "https://192.168.254.254:5443",
    }),
  );
  assert.equal(
    certificateMatches("invalid", "127.0.0.1", "AA".repeat(32)),
    false,
  );
});
