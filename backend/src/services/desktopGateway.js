import express from "express";
import helmet from "helmet";
import { timingSafeEqual } from "node:crypto";
import path from "node:path";

export function desktopGateway({ origin, token, frontend, api, lan = false }) {
  const app = express();
  const expected = Buffer.from(token || "");
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    const supplied = Buffer.from(req.get("x-desktop-token") || "");
    if (
      req.get("host") !== new URL(origin).host ||
      (!lan &&
        (supplied.length !== expected.length ||
          !timingSafeEqual(supplied, expected) ||
          !["127.0.0.1", "::ffff:127.0.0.1"].includes(
            req.socket.remoteAddress,
          )))
    )
      return res.status(403).json({
        message: "This local service is restricted to the desktop preview.",
      });
    if (req.get("origin") && req.get("origin") !== origin)
      return res.status(403).json({ message: "Untrusted request origin." });
    res.set("Cache-Control", "no-store");
    next();
  });
  if (lan)
    app.use((req, res, next) => {
      // LAN sessions never bootstrap installations or administer machine backups.
      if (req.path === "/api/desktop/setup" && req.method === "GET")
        return res.json({ setupRequired: false, remote: true });
      if (/^\/api\/(?:desktop|backups)(?:\/|$)/.test(req.path))
        return res
          .status(403)
          .json({
            message:
              "Use the Main Server desktop for installation and backup administration.",
          });
      next();
    });
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "blob:"],
          connectSrc: ["'self'"],
          frameSrc: ["'none'"],
          objectSrc: ["'none'"],
          formAction: ["'self'"],
          upgradeInsecureRequests: null,
        },
      },
    }),
  );
  app.use((req, res, next) => {
    let decoded;
    try {
      decoded = decodeURIComponent(req.path);
    } catch {
      return res.sendStatus(400);
    }
    if (decoded.split("/").some((part) => part.startsWith(".")))
      return res.sendStatus(404);
    next();
  });
  app.use((req, res, next) =>
    req.path.startsWith("/api/") ? api(req, res, next) : next(),
  );
  app.use(express.static(frontend, { index: false, dotfiles: "deny" }));
  app.get("/{*path}", (req, res) => {
    if (path.extname(req.path)) return res.sendStatus(404);
    res.sendFile("index.html", { root: frontend });
  });
  app.use((_error, _req, res, _next) => {
    res
      .status(500)
      .json({ message: "The bundled workspace could not be loaded." });
  });
  return app;
}
