import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import mongoose from "mongoose";
import { ZodError } from "zod";
import { authRoutes } from "./routes/auth.js";
import { schoolRoutes } from "./routes/schools.js";
import { schoolWorkspaceRoutes } from "./routes/schoolWorkspace.js";
import { ConfigurationError } from "./services/schoolConfiguration.js";
import { examinationRoutes } from "./routes/examinations.js";
import { teacherRoutes } from "./routes/teacher.js";
import { studentPortalRoutes } from "./routes/studentPortal.js";
export function createApp(config) {
  const app = express();
  app.disable("x-powered-by");
  app.use(
    helmet(),
    cors({ origin: config.FRONTEND_ORIGIN, credentials: true }),
    express.json({ limit: "64kb" }),
    cookieParser(),
  );
  app.use("/api", (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (
      !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
      req.get("origin") !== config.FRONTEND_ORIGIN
    )
      return res.status(403).json({ message: "Untrusted request origin." });
    next();
  });
  app.get("/api/health", (_req, res) => {
    const connected = mongoose.connection.readyState === 1;
    res.status(connected ? 200 : 503).json({
      status: connected ? "ok" : "unavailable",
      database: connected ? "connected" : "disconnected",
    });
  });
  app.use("/api/auth", authRoutes(config));
  app.use("/api/teacher", teacherRoutes(config));
  app.use("/api/student", studentPortalRoutes(config));
  app.use("/api/schools", schoolRoutes(config));
  app.use("/api/school/examinations", examinationRoutes(config));
  app.use("/api/school", schoolWorkspaceRoutes(config));
  app.use((_req, res) =>
    res.status(404).json({ message: "Endpoint not found." }),
  );
  app.use((error, _req, res, _next) => {
    if (error instanceof ConfigurationError)
      return res.status(error.status).json({
        message: error.message,
        ...(error.code ? { code: error.code } : {}),
      });
    if (error instanceof ZodError)
      return res.status(400).json({
        message: "Please check the submitted data.",
        errors: error.issues.map(({ path, message }) => ({
          field: path.join("."),
          message,
        })),
      });
    if (error.code === 11000)
      return res.status(409).json({ message: "This record already exists." });
    if (error.type === "entity.parse.failed")
      return res.status(400).json({ message: "Invalid JSON body." });
    if (error.type === "entity.too.large")
      return res.status(413).json({ message: "Request is too large." });
    console.error("API request failed; raw error details suppressed.");
    res.status(500).json({ message: "An unexpected server error occurred." });
  });
  return app;
}
