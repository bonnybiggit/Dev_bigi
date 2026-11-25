import { createHash } from "node:crypto";
import {
  DocumentCounter,
  ReferenceReservation,
  AdmissionAudit,
} from "../models/Admissions.js";
import { Student } from "../models/Student.js";
import { fail } from "./schoolConfiguration.js";
export const fingerprint = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const issueYear = () =>
  Number(
    new Intl.DateTimeFormat("en", {
      timeZone: "Africa/Lagos",
      year: "numeric",
    }).format(new Date()),
  );
export async function allocateReference(school, kind, targetId, session) {
  const year = issueYear();
  for (let attempt = 0; attempt < 1000; attempt++) {
    const counter = await DocumentCounter.findOneAndUpdate(
      { schoolId: school._id, kind, year },
      { $inc: { sequence: 1 } },
      { upsert: true, new: true, session },
    );
    if (
      !Number.isSafeInteger(counter.sequence) ||
      counter.sequence > 9999999999
    )
      fail(
        409,
        "Reference sequence capacity reached. Contact the school administrator.",
      );
    const reference = `${school.documentPrefix || "SCH"}/${kind}/${year}/${String(counter.sequence).padStart(4, "0")}`;
    if (
      await ReferenceReservation.exists({
        schoolId: school._id,
        reference,
      }).session(session)
    )
      continue;
    if (
      kind === "STD" &&
      (await Student.exists({
        schoolId: school._id,
        admissionNumber: reference,
      })
        .collation({ locale: "en", strength: 2 })
        .session(session))
    )
      continue;
    await ReferenceReservation.create(
      [
        {
          schoolId: school._id,
          reference,
          kind,
          year,
          sequence: counter.sequence,
          targetId,
        },
      ],
      { session },
    );
    return reference;
  }
  fail(
    409,
    "Too many existing identifiers overlap this sequence. Review numbering settings; no existing identifiers were changed.",
  );
}
export async function admissionsAudit(
  req,
  action,
  links,
  details,
  reason = "",
  session = null,
) {
  await AdmissionAudit.create(
    [
      {
        schoolId: req.user.schoolId,
        actorId: req.user._id,
        action,
        ...links,
        details,
        reason,
      },
    ],
    session ? { session } : {},
  );
}
