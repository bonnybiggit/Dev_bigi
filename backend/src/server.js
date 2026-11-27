import mongoose from "mongoose";
import { readConfig } from "./config.js";
import { connectDB } from "./db.js";
import { createApp } from "./app.js";
import { initializeDatabase } from "./initializeDatabase.js";
try {
  const config = readConfig();
  await connectDB(config.MONGODB_URI, config.DNS_SERVERS);
  await initializeDatabase();
  const app = createApp(config);
  const stopBackups = app.locals.backups?.start();
  const server = app.listen(config.PORT, () =>
    console.log(`API listening on port ${config.PORT}`),
  );
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => {
      const backupsStopped = stopBackups?.();
      server.close(async () => {
        await backupsStopped;
        await mongoose.disconnect();
        process.exit(0);
      });
    });
} catch (error) {
  console.error(
    "Startup failed:",
    error.name === "ZodError"
      ? "Check required backend environment variables."
      : "Unable to connect to MongoDB.",
  );
  process.exit(1);
}
