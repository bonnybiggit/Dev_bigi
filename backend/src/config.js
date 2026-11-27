import "dotenv/config";
import { isIP } from "node:net";
import { z } from "zod";
export function readConfig(env = process.env) {
  return z
    .object({
      NODE_ENV: z
        .enum(["development", "production", "test"])
        .default("development"),
      PORT: z.coerce.number().int().min(1).max(65535).default(5000),
      MONGODB_URI: z.string().min(1),
      BACKUPS_ENABLED: z
        .enum(["true", "false"])
        .default("false")
        .transform((value) => value === "true"),
      DNS_SERVERS: z
        .string()
        .default("")
        .transform((value) =>
          value.trim() ? value.split(",").map((server) => server.trim()) : [],
        )
        .pipe(
          z.array(
            z
              .string()
              .refine(
                (server) => isIP(server) !== 0,
                "Expected a DNS server IP address",
              ),
          ),
        ),
      JWT_SECRET: z.string().min(32),
      FRONTEND_ORIGIN: z.url(),
    })
    .superRefine((config, context) => {
      if (
        config.BACKUPS_ENABLED &&
        !/^mongodb:\/\/127\.0\.0\.1:\d+\/(dev_bigi_school_local|school_recovery_[a-f0-9]{24})\?replicaSet=[A-Za-z0-9_-]+$/.test(
          config.MONGODB_URI,
        )
      )
        context.addIssue({
          code: "custom",
          path: ["MONGODB_URI"],
          message:
            "Enabled backups require the dedicated local database; no Atlas/remote startup is allowed.",
        });
    })
    .parse(env);
}
