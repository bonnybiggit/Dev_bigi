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
    .parse(env);
}
