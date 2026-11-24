import mongoose from "mongoose";
import { readConfig } from "./config.js";
import { connectDB } from "./db.js";
import { createApp } from "./app.js";
import { initializeSchoolConfiguration } from "./services/schoolConfiguration.js";
import { Staff } from "./models/Staff.js";
import { Student } from "./models/Student.js";
import { Guardian } from "./models/Guardian.js";
import { StudentGuardian } from "./models/StudentGuardian.js";
import { Attendance } from "./models/Attendance.js";
import { AttendanceAudit } from "./models/AttendanceAudit.js";
import { initializeFinance } from "./models/Finance.js";
import { Examination } from "./models/Examination.js";
import {
  Result,
  ResultRevision,
  ExaminationAudit,
  ResultComment,
  ReportCard,
} from "./models/Result.js";
try {
  const config = readConfig();
  await connectDB(config.MONGODB_URI, config.DNS_SERVERS);
  await initializeSchoolConfiguration();
  await Staff.init();
  await Student.init();
  await Promise.all([Guardian.init(), StudentGuardian.init()]);
  await Promise.all([Attendance.init(), AttendanceAudit.init()]);
  await initializeFinance();
  await Promise.all(
    [
      Examination,
      Result,
      ResultRevision,
      ExaminationAudit,
      ResultComment,
      ReportCard,
    ].map((Model) => Model.init()),
  );
  const server = createApp(config).listen(config.PORT, () =>
    console.log(`API listening on port ${config.PORT}`),
  );
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () =>
      server.close(async () => {
        await mongoose.disconnect();
        process.exit(0);
      }),
    );
} catch (error) {
  console.error(
    "Startup failed:",
    error.name === "ZodError"
      ? "Check required backend environment variables."
      : "Unable to connect to MongoDB.",
  );
  process.exit(1);
}
