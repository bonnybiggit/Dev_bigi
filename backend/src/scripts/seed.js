import mongoose from "mongoose";
import { readConfig } from "../config.js";
import { connectDB } from "../db.js";
import { seedSuperAdmin } from "../services/seedSuperAdmin.js";
import { seedDiagnostic } from "./seedDiagnostics.js";
let stage = "environment validation";
try {
  const config = readConfig();
  stage = "MongoDB connection";
  await connectDB(config.MONGODB_URI, config.DNS_SERVERS);
  stage = "User index initialization";
  await mongoose.model("User").init();
  stage = "Super Admin provisioning";
  const result = await seedSuperAdmin(process.env);
  console.log(
    result.created
      ? "Super Admin created."
      : "Super Admin already exists; credentials unchanged.",
  );
} catch (error) {
  console.error(seedDiagnostic(error, stage));
  process.exitCode = 1;
} finally {
  try {
    await mongoose.disconnect();
  } catch (error) {
    console.error(seedDiagnostic(error, "MongoDB disconnect"));
    process.exitCode = 1;
  }
}
