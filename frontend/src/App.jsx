import { Navigate, Route, Routes, Outlet } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import AdmissionApplications from "./pages/AdmissionApplications";
import AdmissionApplicationDetail from "./pages/AdmissionApplicationDetail";
import FormsDocuments from "./pages/FormsDocuments";
import RegistrationFormPreview from "./pages/RegistrationFormPreview";
import TeacherAssignments from "./pages/TeacherAssignments";
import TeacherWorkspace from "./pages/TeacherWorkspace";
import TeacherAttendance from "./pages/TeacherAttendance";
import ComingSoon from "./pages/ComingSoon";
import StudentLogin from "./pages/StudentLogin";
import StudentPortal from "./pages/StudentPortal";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Schools from "./pages/Schools";
import Layout from "./components/Layout";
import ChangePassword from "./pages/ChangePassword";
import SchoolDashboard from "./pages/SchoolDashboard";
import AcademicStructure from "./pages/AcademicStructure";
import SchoolProfile from "./pages/SchoolProfile";
import StaffManagement from "./pages/StaffManagement";
import StudentManagement from "./pages/StudentManagement";
import StudentProfile from "./pages/StudentProfile";
import GuardianManagement from "./pages/GuardianManagement";
import GuardianProfile from "./pages/GuardianProfile";
import AttendanceMarking from "./pages/AttendanceMarking";
import AttendanceReports from "./pages/AttendanceReports";
import FinanceLayout from "./components/FinanceLayout";
import FeeStructures from "./pages/FeeStructures";
import StudentInvoices from "./pages/StudentInvoices";
import InvoiceAccount from "./pages/InvoiceAccount";
import FinancePayments from "./pages/FinancePayments";
import PaymentReceipt from "./pages/PaymentReceipt";
import FinancialReports from "./pages/FinancialReports";
import Examinations from "./pages/Examinations";
import ExaminationWorkspace from "./pages/ExaminationWorkspace";
import StudentReportCard from "./pages/StudentReportCard";
import { dashboardPath } from "./lib/navigation";
function Protected({ role, passwordPage = false }) {
  const { user, loading } = useAuth();
  if (loading)
    return <div className="screen-loading">Opening your workspace…</div>;
  if (!user)
    return (
      <Navigate
        to={
          role === "student"
            ? "/student-login"
            : role === "teacher"
              ? "/teacher-login"
              : "/login"
        }
        replace
      />
    );
  if (user.mustChangePassword && !passwordPage)
    return <Navigate to="/change-password" replace />;
  if (passwordPage && !user.mustChangePassword)
    return <Navigate to={dashboardPath(user)} replace />;
  if (role && !(Array.isArray(role) ? role : [role]).includes(user.role))
    return <Navigate to={dashboardPath(user)} replace />;
  return <Outlet />;
}
export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/school-login" element={<Login schoolLogin />} />
      <Route path="/student-login" element={<StudentLogin />} />
      <Route path="/teacher-login" element={<Login teacherLogin />} />
      <Route
        element={
          <Protected
            role={["school_admin", "teacher", "student"]}
            passwordPage
          />
        }
      >
        <Route path="/change-password" element={<ChangePassword />} />
      </Route>
      <Route element={<Protected role="super_admin" />}>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="schools" element={<Schools />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
      <Route element={<Protected role="school_admin" />}>
        <Route path="school" element={<Layout />}>
          <Route index element={<SchoolDashboard />} />
          <Route path="staff" element={<StaffManagement />} />
          <Route path="teacher-assignments" element={<TeacherAssignments />} />
          <Route path="students" element={<StudentManagement />} />
          <Route path="applications" element={<AdmissionApplications />} />
          <Route
            path="applications/:id"
            element={<AdmissionApplicationDetail />}
          />
          <Route path="forms" element={<FormsDocuments />} />
          <Route
            path="forms/templates/:type"
            element={<RegistrationFormPreview generic />}
          />
          <Route path="documents/:id" element={<RegistrationFormPreview />} />
          <Route path="students/:id" element={<StudentProfile />} />
          <Route path="guardians" element={<GuardianManagement />} />
          <Route path="guardians/:id" element={<GuardianProfile />} />
          <Route path="examinations" element={<Examinations />} />
          <Route path="examinations/:id" element={<ExaminationWorkspace />} />
          <Route
            path="examinations/:id/report-cards/:studentId"
            element={<StudentReportCard />}
          />
          <Route
            path="attendance"
            element={<Navigate to="/school/attendance/student" replace />}
          />
          <Route
            path="attendance/student"
            element={<AttendanceMarking key="student" kind="student" />}
          />
          <Route
            path="attendance/staff"
            element={<AttendanceMarking key="staff" kind="staff" />}
          />
          <Route path="attendance/reports" element={<AttendanceReports />} />
          <Route
            path="teachers"
            element={<Navigate to="/school/staff" replace />}
          />
          <Route path="profile" element={<SchoolProfile />} />
          <Route
            path="settings"
            element={<Navigate to="/school/profile" replace />}
          />
          <Route
            path="academics"
            element={<Navigate to="/school/sessions" replace />}
          />
          {["sessions", "terms", "classes", "subjects"].map((kind) => (
            <Route
              key={kind}
              path={kind}
              element={<AcademicStructure key={kind} kind={kind} />}
            />
          ))}
          <Route path="finance" element={<FinanceLayout />}>
            <Route
              index
              element={<Navigate to="/school/finance/reports" replace />}
            />
            <Route path="structures" element={<FeeStructures />} />
            <Route path="invoices" element={<StudentInvoices />} />
            <Route path="invoices/:id" element={<InvoiceAccount />} />
            <Route
              path="payments"
              element={<FinancePayments key="payments" />}
            />
            <Route
              path="receipts"
              element={<FinancePayments key="receipts" receipts />}
            />
            <Route path="receipts/:id" element={<PaymentReceipt />} />
            <Route path="reports" element={<FinancialReports />} />
          </Route>
        </Route>
      </Route>
      <Route element={<Protected role="student" />}>
        <Route path="student" element={<Layout />}>
          <Route index element={<Navigate to="/student/dashboard" replace />} />
          {[
            "dashboard",
            "profile",
            "subjects",
            "attendance",
            "results",
            "report-cards",
            "fees",
            "settings",
          ].map((mode) => (
            <Route
              key={mode}
              path={mode}
              element={<StudentPortal key={mode} mode={mode} />}
            />
          ))}
          <Route
            path="report-cards/:cardId"
            element={<StudentReportCard portal />}
          />
          <Route
            path="fees/receipts/:id"
            element={<StudentPortal mode="receipt" />}
          />
          {["timetable", "assignments", "announcements"].map((module) => (
            <Route
              key={module}
              path={module}
              element={
                <ComingSoon
                  module={
                    module === "assignments" ? "Assignments & Homework" : module
                  }
                />
              }
            />
          ))}
        </Route>
      </Route>
      <Route element={<Protected role="teacher" />}>
        <Route path="teacher" element={<Layout />}>
          <Route
            index
            element={<TeacherWorkspace key="overview" mode="overview" />}
          />
          <Route path="examinations" element={<Examinations />} />
          <Route path="attendance" element={<TeacherAttendance />} />
          {["classes", "subjects", "students", "profile", "settings"].map(
            (mode) => (
              <Route
                key={mode}
                path={mode}
                element={<TeacherWorkspace key={mode} mode={mode} />}
              />
            ),
          )}
          <Route
            path="students/:id"
            element={<TeacherWorkspace key="student" mode="student" />}
          />
          {["timetable", "assignments", "announcements"].map((module) => (
            <Route
              key={module}
              path={module}
              element={
                <ComingSoon
                  module={
                    module === "assignments" ? "Assignments & Homework" : module
                  }
                />
              }
            />
          ))}

          <Route path="examinations/:id" element={<ExaminationWorkspace />} />
        </Route>
      </Route>
    </Routes>
  );
}
