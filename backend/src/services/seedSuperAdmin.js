import bcrypt from "bcrypt";
import { z } from "zod";
import { User } from "../models/User.js";
export async function seedSuperAdmin(env) {
  const {
    SUPER_ADMIN_NAME: name,
    SUPER_ADMIN_EMAIL: email,
    SUPER_ADMIN_PASSWORD: password,
  } = z
    .object({
      SUPER_ADMIN_NAME: z.string().trim().min(2),
      SUPER_ADMIN_EMAIL: z.email().transform((v) => v.toLowerCase()),
      SUPER_ADMIN_PASSWORD: z
        .string()
        .min(12)
        .max(72)
        .refine(
          (v) => Buffer.byteLength(v, "utf8") <= 72,
          "Password must be at most 72 UTF-8 bytes",
        ),
    })
    .parse(env);
  const existing = await User.findOne({ email });
  if (existing) {
    if (existing.role !== "super_admin")
      throw Object.assign(
        new Error(
          "Email belongs to a school account; refusing to elevate permissions.",
        ),
        { code: "SEED_EMAIL_ROLE_CONFLICT" },
      );
    return { created: false };
  }
  await User.create({
    name,
    email,
    role: "super_admin",
    passwordHash: await bcrypt.hash(password, 12),
  });
  return { created: true };
}
