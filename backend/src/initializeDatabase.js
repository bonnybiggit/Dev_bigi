import { initializeSchoolConfiguration } from "./services/schoolConfiguration.js";
import { Staff } from "./models/Staff.js";
import { Student } from "./models/Student.js";
import { User } from "./models/User.js";
import { StudentPortalAudit } from "./models/StudentPortalAudit.js";
import { TeacherAssignment } from "./models/TeacherAssignment.js";
import { TeacherAudit } from "./models/TeacherAudit.js";
import { initialiseAdmissions } from "./models/Admissions.js";
import { Guardian } from "./models/Guardian.js";
import { StudentGuardian } from "./models/StudentGuardian.js";
import { SchoolLogo } from "./models/SchoolLogo.js";
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
export async function initializeDatabase() {
  await initializeSchoolConfiguration();
  await Staff.init();
  await Student.init();
  await Promise.all([
    User.init(),
    StudentPortalAudit.init(),
    TeacherAssignment.init(),
    TeacherAudit.init(),
  ]);
  await initialiseAdmissions();
  await SchoolLogo.init();
  await Promise.all([
    Guardian.init(),
    StudentGuardian.init(),
    Attendance.init(),
    AttendanceAudit.init(),
  ]);
  await initializeFinance();
  await Promise.all(
    [
      Examination,
      Result,
      ResultRevision,
      ExaminationAudit,
      ResultComment,
      ReportCard,
    ].map((model) => model.init()),
  );
}
