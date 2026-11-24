import { Router } from "express";
import { z } from "zod";
import { Guardian } from "../models/Guardian.js";
import { StudentGuardian } from "../models/StudentGuardian.js";
import { objectId, statusInput } from "../validation/academic.js";
import {
  guardianInput,
  guardianListInput,
  relationshipInput,
} from "../validation/guardian.js";
import {
  ownedGuardian,
  saveGuardian,
  guardianDetails,
  guardianListFields,
  relatedRecords,
  changeRelationship,
  relationshipDetails,
} from "../services/guardian.js";
import { mutateConfiguration } from "../services/schoolConfiguration.js";
const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function guardianRoutes() {
  const router = Router();
  router.get("/", async (req, res) => {
    const input = guardianListInput.parse(req.query),
      schoolId = req.user.schoolId;
    const filter = { schoolId };
    if (input.status) filter.status = input.status;
    if (input.search)
      filter.$or = [
        "fullName",
        "email",
        "primaryPhone",
        "alternativePhone",
      ].map((field) => ({
        [field]: { $regex: escape(input.search), $options: "i" },
      }));
    if (input.linkage) {
      const ids = await StudentGuardian.distinct("guardianId", {
        schoolId,
        isActive: true,
      });
      filter._id = { [input.linkage === "linked" ? "$in" : "$nin"]: ids };
    }
    const [records, total] = await Promise.all([
      Guardian.find(filter)
        .select(guardianListFields)
        .sort({ createdAt: -1, _id: -1 })
        .skip((input.page - 1) * input.limit)
        .limit(input.limit),
      Guardian.countDocuments(filter),
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
      totalGuardians,
      activeGuardians,
      inactiveGuardians,
      students,
      relationships,
    ] = await Promise.all([
      Guardian.countDocuments({ schoolId }),
      Guardian.countDocuments({ schoolId, status: "active" }),
      Guardian.countDocuments({ schoolId, status: "inactive" }),
      StudentGuardian.distinct("studentId", { schoolId, isActive: true }),
      StudentGuardian.countDocuments({ schoolId, isActive: true }),
    ]);
    res.json({
      totalGuardians,
      activeGuardians,
      inactiveGuardians,
      linkedStudents: students.length,
      relationships,
    });
  });
  router.post("/", async (req, res) =>
    res
      .status(201)
      .json({
        record: guardianDetails(
          await saveGuardian({
            schoolId: req.user.schoolId,
            userId: req.user._id,
            input: guardianInput.parse(req.body),
          }),
        ),
      }),
  );
  router.get("/:id", async (req, res) =>
    res.json({
      record: guardianDetails(
        await ownedGuardian(req.user.schoolId, objectId.parse(req.params.id)),
      ),
    }),
  );
  router.put("/:id", async (req, res) =>
    res.json({
      record: guardianDetails(
        await saveGuardian({
          schoolId: req.user.schoolId,
          userId: req.user._id,
          id: objectId.parse(req.params.id),
          input: guardianInput.parse(req.body),
        }),
      ),
    }),
  );
  router.patch("/:id/status", async (req, res) => {
    const id = objectId.parse(req.params.id),
      { status } = statusInput.parse(req.body);
    const record = await mutateConfiguration(
      req.user.schoolId,
      async (session) => {
        const record = await ownedGuardian(req.user.schoolId, id, session);
        record.status = status;
        record.updatedBy = req.user._id;
        return record.save({ session });
      },
    );
    res.json({ record: guardianDetails(record) });
  });
  router.delete("/:id", async (req, res) => {
    await ownedGuardian(req.user.schoolId, objectId.parse(req.params.id));
    res
      .status(405)
      .set("Allow", "GET, PUT, PATCH")
      .json({
        message:
          "Permanent deletion is disabled. Deactivate the guardian to retain records and relationships.",
      });
  });
  router.get("/:id/students", async (req, res) =>
    res.json({
      records: await relatedRecords({
        schoolId: req.user.schoolId,
        guardianId: objectId.parse(req.params.id),
      }),
    }),
  );
  for (const [method, operation] of [
    ["post", "create"],
    ["put", "edit"],
    ["delete", "remove"],
  ]) {
    router[method]("/:id/students/:studentId", async (req, res) => {
      const guardianId = objectId.parse(req.params.id),
        studentId = objectId.parse(req.params.studentId);
      const input =
        operation === "remove"
          ? z
              .object({})
              .strict()
              .parse(req.body || {})
          : relationshipInput.parse(req.body);
      const record = await changeRelationship({
        schoolId: req.user.schoolId,
        userId: req.user._id,
        guardianId,
        studentId,
        relationship: input.relationship,
        operation,
      });
      if (operation === "remove") return res.status(204).end();
      res
        .status(operation === "create" ? 201 : 200)
        .json({ relationship: relationshipDetails(record) });
    });
  }
  return router;
}
