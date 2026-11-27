import { Router } from "express";
import { z } from "zod";
import { rateLimit } from "express-rate-limit";
import { School } from "../models/School.js";
import { SchoolLogo } from "../models/SchoolLogo.js";
import { objectId } from "../validation/academic.js";
import { schoolBranding } from "../services/branding.js";
import { fail } from "../services/schoolConfiguration.js";

export function brandingRoutes() {
  const router = Router();
  router.use(
    rateLimit({
      windowMs: 60 * 1000,
      limit: 300,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  router.use((req, _res, next) => {
    z.object({}).strict().parse(req.query);
    next();
  });
  // Deliberately public identity only: required before authentication on school login pages.
  router.get("/schools/:schoolId", async (req, res) => {
    const school = await School.findOne({
      _id: objectId.parse(req.params.schoolId),
      status: "active",
    });
    if (!school) fail(404, "School branding not found.");
    res.json({ school: schoolBranding(school) });
  });
  router.get("/schools/:schoolId/logos/:logoId", async (req, res) => {
    const schoolId = objectId.parse(req.params.schoolId),
      logoId = objectId.parse(req.params.logoId);
    if (!(await School.exists({ _id: schoolId, status: "active" })))
      fail(404, "Logo not found.");
    const logo = await SchoolLogo.findOne({ _id: logoId, schoolId }).select(
      "+data",
    );
    if (!logo) fail(404, "Logo not found.");
    res
      .set({
        "Content-Type": logo.contentType,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cross-Origin-Resource-Policy": "cross-origin",
      })
      .send(logo.data);
  });
  return router;
}
