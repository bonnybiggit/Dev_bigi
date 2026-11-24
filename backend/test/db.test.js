import { test } from "node:test";
import assert from "node:assert/strict";
import dns from "node:dns";
import mongoose from "mongoose";
import { readConfig } from "../src/config.js";
import { connectDB } from "../src/db.js";

const env = {
  MONGODB_URI: "mongodb://127.0.0.1/test",
  JWT_SECRET: "test-only-secret-at-least-32-characters",
  FRONTEND_ORIGIN: "http://localhost:5173",
};

test("DNS_SERVERS accepts trimmed comma-separated IPv4 and IPv6 addresses", () => {
  assert.deepEqual(
    readConfig({
      ...env,
      DNS_SERVERS: " 8.8.8.8, 8.8.4.4, 2001:4860:4860::8888 ",
    }).DNS_SERVERS,
    ["8.8.8.8", "8.8.4.4", "2001:4860:4860::8888"],
  );
  assert.deepEqual(readConfig(env).DNS_SERVERS, []);
  assert.deepEqual(readConfig({ ...env, DNS_SERVERS: "  " }).DNS_SERVERS, []);
});

test("DNS_SERVERS rejects hostnames, invalid IPs and empty list entries", () => {
  for (const value of [
    "dns.google",
    "999.8.8.8",
    "8.8.8.8,",
    ",8.8.8.8",
    "8.8.8.8,,8.8.4.4",
  ]) {
    assert.throws(() => readConfig({ ...env, DNS_SERVERS: value }), {
      name: "ZodError",
    });
  }
});

test("shared MongoDB connection sets DNS before mongoose.connect", async (t) => {
  const events = [];
  const servers = ["8.8.8.8", "8.8.4.4"];
  t.mock.method(dns, "setServers", (value) => events.push(["dns", value]));
  t.mock.method(mongoose, "connect", async (uri, options) => {
    events.push(["connect", uri, options]);
    return "connected";
  });
  assert.equal(
    await connectDB("mongodb+srv://example.test/test", servers),
    "connected",
  );
  assert.deepEqual(events, [
    ["dns", servers],
    [
      "connect",
      "mongodb+srv://example.test/test",
      { serverSelectionTimeoutMS: 10000 },
    ],
  ]);
});

test("omitted DNS override preserves system resolver and connection errors propagate", async (t) => {
  const resolver = t.mock.method(dns, "setServers", () => {});
  const failure = new Error("test connection failure");
  t.mock.method(mongoose, "connect", async () => {
    throw failure;
  });
  await assert.rejects(
    connectDB(env.MONGODB_URI),
    (error) => error === failure,
  );
  assert.equal(resolver.mock.callCount(), 0);
});
