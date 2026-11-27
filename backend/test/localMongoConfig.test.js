import { test } from "node:test";
import assert from "node:assert/strict";
import {
  uri,
  origin,
  configuration,
  assertLocalEnvironment,
  assertLocalSocket,
} from "../../scripts/local-mongo/config.js";

const local = {
  MONGODB_URI: uri,
  DNS_SERVERS: "",
  NODE_ENV: "development",
  PORT: "5001",
  FRONTEND_ORIGIN: origin,
  JWT_SECRET: "local-test-secret-longer-than-32-characters",
};
test("isolated local environment accepts only the dedicated loopback URI and safe app settings", () => {
  assert.doesNotThrow(() => assertLocalEnvironment(local));
  for (const [key, value] of [
    ["MONGODB_URI", "mongodb+srv://never-connect.example.test/production"],
    ["MONGODB_URI", "mongodb://127.0.0.1:27017/production"],
    ["MONGODB_URI", uri + "&directConnection=true"],
    ["DNS_SERVERS", "8.8.8.8"],
    ["PORT", "5000"],
    ["NODE_ENV", "production"],
    ["FRONTEND_ORIGIN", "https://example.test"],
    ["JWT_SECRET", "short"],
  ])
    assert.throws(() => assertLocalEnvironment({ ...local, [key]: value }));
});
test("offline verification guard permits only its loopback port in native and normalized socket calls", () => {
  assert.doesNotThrow(() =>
    assertLocalSocket([{ host: "127.0.0.1", port: 27018 }]),
  );
  assert.doesNotThrow(() =>
    assertLocalSocket([[{ host: "127.0.0.1", port: 27018 }, undefined]]),
  );
  for (const args of [
    [{ host: "example.test", port: 27018 }],
    [{ host: "127.0.0.1", port: 27017 }],
    [{ host: "::1", port: 27018 }],
    ["27018"],
    [{ path: "some-pipe" }],
  ])
    assert.throws(() => assertLocalSocket(args));
});
test("generated MongoDB configuration has persistent storage and a single loopback replica set", () => {
  const cfg = configuration();
  assert.match(cfg, /bindIp: 127\.0\.0\.1\n {2}port: 27018/);
  assert.match(cfg, /replSetName: schoolLocalRs/);
  assert.match(cfg, /dbPath: /);
  assert.doesNotMatch(cfg, /0\.0\.0\.0|bindIpAll|mongodb\+srv/);
});
