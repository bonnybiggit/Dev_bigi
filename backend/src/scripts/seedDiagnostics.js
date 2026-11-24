// Never print driver messages, stacks, key values, hosts, or validation inputs:
// those can contain connection strings and credentials. Emit known labels only.
const fields = new Set([
  "NODE_ENV",
  "PORT",
  "MONGODB_URI",
  "DNS_SERVERS",
  "JWT_SECRET",
  "FRONTEND_ORIGIN",
  "SUPER_ADMIN_NAME",
  "SUPER_ADMIN_EMAIL",
  "SUPER_ADMIN_PASSWORD",
  "name",
  "email",
  "passwordHash",
  "role",
  "schoolId",
  "isActive",
]);
const networkCodes = new Set([
  "ECONNREFUSED",
  "ENOTFOUND",
  "ETIMEDOUT",
  "ECONNRESET",
  "EAI_AGAIN",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ESERVFAIL",
  "ETIMEOUT",
]);
const tlsCodes = new Set([
  "ERR_SSL_TLSV1_ALERT_INTERNAL_ERROR",
  "CERT_HAS_EXPIRED",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "SELF_SIGNED_CERT_IN_CHAIN",
]);

function causes(error, seen = new Set()) {
  if (!error || typeof error !== "object" || seen.has(error)) return [];
  seen.add(error);
  const nested = [
    error.cause,
    error.reason,
    ...(Array.isArray(error.errors) ? error.errors : []),
  ];
  if (error.servers instanceof Map) {
    for (const server of error.servers.values()) nested.push(server.error);
  }
  return [error, ...nested.flatMap((item) => causes(item, seen))];
}

export function seedDiagnostic(error, stage) {
  const prefix = `Seed failed during ${stage}.`;
  if (error?.name === "ZodError") {
    const invalid = [
      ...new Set(
        (error.issues || [])
          .map((issue) => issue.path?.[0])
          .filter((field) => fields.has(field)),
      ),
    ];
    return `${prefix} Invalid configuration fields: ${invalid.join(", ") || "unrecognized field"}. Check required values and formats in backend/.env.example; SUPER_ADMIN_PASSWORD requires 12–72 characters and at most 72 UTF-8 bytes. Values are omitted.`;
  }
  if (error?.code === 11000) {
    const email =
      Object.hasOwn(error.keyPattern || {}, "email") ||
      Object.hasOwn(error.keyValue || {}, "email");
    return `${prefix} MongoDB duplicate key (11000)${email ? " on email" : " on a unique index"}. An account may have been created concurrently. Rerun the seed; verify account ownership if the conflict persists. Conflicting values are omitted.`;
  }
  if (error?.code === "SEED_EMAIL_ROLE_CONFLICT") {
    return `${prefix} The configured Super Admin email belongs to a school account. Refusing to elevate its permissions; use a separate Super Admin email.`;
  }
  if (error?.name === "ValidationError") {
    const invalid = Object.keys(error.errors || {}).filter((field) =>
      fields.has(field),
    );
    return `${prefix} Mongoose validation failed for: ${invalid.join(", ") || "unrecognized field"}. Check the User schema and seed configuration. Values are omitted.`;
  }
  const chain = causes(error);
  if (
    chain.some(
      (item) => item.code === 18 || item.codeName === "AuthenticationFailed",
    )
  ) {
    return `${prefix} MongoDB authentication failed (18). Check the database username, password, authSource, and URI encoding in the private backend environment.`;
  }
  if (
    chain.some((item) => item.code === 13 || item.codeName === "Unauthorized")
  ) {
    return `${prefix} MongoDB authorization failed (13). The database account needs permission to read/write users and initialize indexes in the selected database.`;
  }
  const network = chain.find((item) => networkCodes.has(item.code));
  if (network) {
    const dns = ["querySrv", "queryTxt", "getaddrinfo"].includes(
      network.syscall,
    );
    return `${prefix} MongoDB ${dns ? "DNS lookup" : "network connection"} failed (${network.code}${dns ? `; ${network.syscall}` : ""}). ${dns ? "Check DNS availability and the configured MongoDB hostname; SRV connections require DNS SRV/TXT support." : "Check MongoDB is running, network/firewall access, and Atlas IP access rules if applicable."}`;
  }
  if (
    chain.some(
      (item) =>
        tlsCodes.has(item.code) ||
        /TLS|SSL|certificate/i.test(item.message || ""),
    )
  ) {
    return `${prefix} MongoDB TLS/certificate negotiation failed. Check system time, trusted certificates, and database TLS requirements; do not disable certificate verification.`;
  }
  if (
    chain.some((item) =>
      ["MongoParseError", "MongoInvalidArgumentError"].includes(item.name),
    )
  ) {
    return `${prefix} Invalid MongoDB connection configuration. Check the URI scheme, options, and percent-encoding of credentials in the private backend environment.`;
  }
  if (
    chain.some((item) =>
      [
        "MongooseServerSelectionError",
        "MongoServerSelectionError",
        "MongoNetworkError",
        "MongoNetworkTimeoutError",
      ].includes(item.name),
    )
  ) {
    return `${prefix} MongoDB could not select or reach a server within the connection timeout. Check DNS, database availability, firewall/Atlas IP access rules, and TLS configuration.`;
  }
  return `${prefix} An unclassified error occurred. Raw error details are suppressed to protect credentials. Check the operation indicated above and database-side logs.`;
}
