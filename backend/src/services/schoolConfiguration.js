import mongoose from "mongoose";
import { School } from "../models/School.js";
import { AcademicSession } from "../models/AcademicSession.js";
import { AcademicTerm } from "../models/AcademicTerm.js";
import { SchoolClass } from "../models/SchoolClass.js";
import { Subject } from "../models/Subject.js";

export const initializeSchoolConfiguration = () =>
  Promise.all(
    [AcademicSession, AcademicTerm, SchoolClass, Subject].map((Model) =>
      Model.init(),
    ),
  );

export class ConfigurationError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export const fail = (status, message, code) => {
  throw new ConfigurationError(status, message, code);
};

// The school write serializes configuration transactions across processes, preventing
// overlap/activation races that read-then-write validation alone would allow.
export async function mutateConfiguration(schoolId, operation) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const school = await School.findOneAndUpdate(
        { _id: schoolId, status: "active" },
        { $inc: { configurationRevision: 1 } },
        { new: true, session },
      );
      if (!school) fail(403, "School access is unavailable.");
      result = await operation(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}
