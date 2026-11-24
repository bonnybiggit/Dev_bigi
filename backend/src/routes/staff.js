import { Router } from "express";
import { z } from "zod";
import { Staff } from "../models/Staff.js";
import { User } from "../models/User.js";
import { objectId, statusInput } from "../validation/academic.js";
import { staffInput, staffListInput } from "../validation/staff.js";
import { ownedStaff, saveStaff } from "../services/staff.js";
import { mutateConfiguration } from "../services/schoolConfiguration.js";
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Mounted after authentication, school_admin authorization and password-change checks.
export function staffRoutes() {
  const router = Router();
  router.get("/", async (req, res) => {
    const input = staffListInput.parse(req.query);
    const filter = { schoolId: req.user.schoolId };
    for (const field of ["category", "status", "employmentType"])
      if (input[field]) filter[field] = input[field];
    if (input.department)
      filter.department = {
        $regex: `^${escapeRegex(input.department)}$`,
        $options: "i",
      };
    if (input.search)
      filter.$or = [
        "employeeId",
        "fullName",
        "email",
        "phone",
        "department",
        "designation",
      ].map((field) => ({
        [field]: { $regex: escapeRegex(input.search), $options: "i" },
      }));
    const [records, total] = await Promise.all([
      Staff.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((input.page - 1) * input.limit)
        .limit(input.limit),
      Staff.countDocuments(filter),
    ]);
    res.json({ records, total, page: input.page, limit: input.limit });
  });
  router.use((req, _res, next) => {
    z.object({}).strict().parse(req.query);
    next();
  });
  router.get("/stats", async (req, res) => {
    const schoolId = req.user.schoolId;
    const [
      totalStaff,
      teachingStaff,
      nonTeachingStaff,
      activeStaff,
      inactiveStaff,
    ] = await Promise.all([
      Staff.countDocuments({ schoolId }),
      Staff.countDocuments({ schoolId, category: "teaching" }),
      Staff.countDocuments({ schoolId, category: "non_teaching" }),
      Staff.countDocuments({ schoolId, status: "active" }),
      Staff.countDocuments({ schoolId, status: "inactive" }),
    ]);
    res.json({
      totalStaff,
      teachingStaff,
      nonTeachingStaff,
      activeStaff,
      inactiveStaff,
    });
  });
  router.post("/", async (req, res) =>
    res.status(201).json({
      record: await saveStaff({
        schoolId: req.user.schoolId,
        userId: req.user._id,
        input: staffInput.parse(req.body),
      }),
    }),
  );
  router.get("/:id", async (req, res) =>
    res.json({
      record: await ownedStaff(
        req.user.schoolId,
        objectId.parse(req.params.id),
      ),
    }),
  );
  router.put("/:id", async (req, res) =>
    res.json({
      record: await saveStaff({
        schoolId: req.user.schoolId,
        userId: req.user._id,
        id: objectId.parse(req.params.id),
        input: staffInput.parse(req.body),
      }),
    }),
  );
  router.patch("/:id/status", async (req, res) => {
    const id = objectId.parse(req.params.id),
      { status } = statusInput.parse(req.body);
    const record = await mutateConfiguration(
      req.user.schoolId,
      async (session) => {
        const record = await ownedStaff(req.user.schoolId, id, session);
        record.status = status;
        record.updatedBy = req.user._id;
        await User.updateMany(
          { schoolId: req.user.schoolId, staffId: record._id, role: "teacher" },
          { $inc: { sessionVersion: 1 } },
          { session },
        );
        return record.save({ session });
      },
    );
    res.json({ record });
  });
  router.delete("/:id", async (req, res) => {
    await ownedStaff(req.user.schoolId, objectId.parse(req.params.id));
    res.status(405).set("Allow", "GET, PUT, PATCH").json({
      message:
        "Permanent deletion is disabled. Deactivate the staff record to preserve references.",
    });
  });
  return router;
}
