import { test } from "node:test";
import assert from "node:assert/strict";
import { seedDiagnostic } from "../src/scripts/seedDiagnostics.js";

const secret =
  "mongodb://private-user:private-password@private-host/db?secret=jwt-secret";
const stage = "MongoDB connection";
function diagnostic(error) {
  const output = seedDiagnostic(error, stage);
  for (const value of [
    secret,
    "private-user",
    "private-password",
    "private-host",
    "jwt-secret",
  ]) {
    assert.equal(output.includes(value), false);
  }
  return output;
}

test("seed diagnostic reports DNS refusal without driver message or hostname", () => {
  assert.match(
    diagnostic({
      name: "Error",
      code: "ECONNREFUSED",
      syscall: "querySrv",
      message: secret,
      hostname: secret,
    }),
    /DNS lookup failed \(ECONNREFUSED; querySrv\)/,
  );
});

test("seed diagnostic traverses server-selection causes safely", () => {
  const error = {
    name: "MongooseServerSelectionError",
    message: secret,
    reason: {
      servers: new Map([
        [secret, { error: { code: "ETIMEDOUT", message: secret } }],
      ]),
    },
  };
  error.cause = error;
  assert.match(diagnostic(error), /network connection failed \(ETIMEDOUT\)/);
  assert.match(
    diagnostic({ name: "MongoServerSelectionError", message: secret }),
    /could not select or reach a server/,
  );
});

test("seed diagnostic distinguishes duplicate email and account role conflict", () => {
  assert.match(
    diagnostic({ code: 11000, keyValue: { email: secret }, message: secret }),
    /duplicate key \(11000\) on email/,
  );
  assert.match(
    diagnostic({ code: "SEED_EMAIL_ROLE_CONFLICT", message: secret }),
    /belongs to a school account/,
  );
});

test("seed diagnostic reports only allowed validation field names", () => {
  const output = diagnostic({
    name: "ZodError",
    issues: [
      { path: ["SUPER_ADMIN_PASSWORD"], message: secret, input: secret },
      { path: [secret], message: secret },
    ],
  });
  assert.match(output, /SUPER_ADMIN_PASSWORD/);
  assert.match(
    diagnostic({
      name: "ValidationError",
      errors: {
        email: { value: secret, message: secret },
        [secret]: { message: secret },
      },
    }),
    /validation failed for: email/,
  );
});

test("seed diagnostic handles authentication, authorization, TLS and URI errors", () => {
  for (const [error, expected] of [
    [{ code: 18 }, /authentication failed \(18\)/],
    [{ cause: { code: 13 } }, /authorization failed \(13\)/],
    [{ code: "CERT_HAS_EXPIRED" }, /TLS\/certificate/],
    [{ name: "MongoParseError" }, /Invalid MongoDB connection configuration/],
    [{ name: "Error" }, /unclassified error/],
  ])
    assert.match(
      diagnostic({ ...error, message: secret, stack: secret }),
      expected,
    );
});
