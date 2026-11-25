import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  School,
  LogOut,
  Menu,
  X,
  ShieldCheck,
  Users,
  GraduationCap,
  BookOpen,
  ClipboardCheck,
  Library,
  Wallet,
  Settings,
  CalendarDays,
  CalendarRange,
  ContactRound,
  FileBarChart,
} from "lucide-react";
import Brand from "./Brand";
import { useAuth } from "../context/AuthContext";
import { errorMessage } from "../lib/api";
export default function Layout() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const location = useLocation();
  const studentWorkspace = user.role === "student";
  const teacherWorkspace = user.role === "teacher";
  const schoolWorkspace = ["school_admin", "teacher", "student"].includes(
    user.role,
  );
  const workspaceBase = studentWorkspace
    ? "/student"
    : teacherWorkspace
      ? "/teacher"
      : "/school";
  const schoolLinks = studentWorkspace
    ? [
        ["dashboard", "Overview"],
        ["profile", "My Profile"],
        ["subjects", "My Subjects"],
        ["attendance", "My Attendance"],
        ["results", "Examinations & Results"],
        ["report-cards", "Report Cards"],
        ["fees", "School Fees"],
        ["timetable", "Timetable"],
        ["assignments", "Assignments & Homework"],
        ["announcements", "Announcements"],
        ["settings", "Settings"],
      ].map(([path, label]) => ({ path: "/" + path, label, icon: BookOpen }))
    : teacherWorkspace
      ? [
          { path: "", label: "Overview", icon: LayoutDashboard },
          ...[
            ["classes", "My Classes"],
            ["subjects", "My Subjects"],
            ["students", "My Students"],
            ["attendance", "Attendance"],
            ["examinations", "Examinations & Results"],
            ["timetable", "Timetable"],
            ["assignments", "Assignments & Homework"],
            ["announcements", "Announcements"],
            ["profile", "My Profile"],
            ["settings", "Settings"],
          ].map(([path, label]) => ({
            path: "/" + path,
            label,
            icon: BookOpen,
          })),
        ]
      : [
          { path: "", label: "Overview", icon: LayoutDashboard },
          { path: "/profile", label: "School Profile", icon: Settings },
          { path: "/sessions", label: "Academic Sessions", icon: CalendarDays },
          { path: "/terms", label: "Terms", icon: CalendarRange },
          { path: "/subjects", label: "Subjects", icon: Library },
          { path: "/students", label: "Students & Admissions", icon: Users },
          {
            path: "/applications",
            label: "Admission Applications",
            icon: ClipboardCheck,
          },
          { path: "/forms", label: "Forms & Documents", icon: BookOpen },
          {
            path: "/guardians",
            label: "Parents & Guardians",
            icon: ContactRound,
          },
          { path: "/staff", label: "Teachers & Staff", icon: GraduationCap },
          {
            path: "/teacher-assignments",
            label: "Teacher Assignments",
            icon: BookOpen,
          },
          { path: "/classes", label: "Classes", icon: BookOpen },
          {
            path: "/attendance/student",
            label: "Student Attendance",
            icon: ClipboardCheck,
          },
          {
            path: "/attendance/staff",
            label: "Staff Attendance",
            icon: ClipboardCheck,
          },
          {
            path: "/attendance/reports",
            label: "Attendance Reports",
            icon: FileBarChart,
          },
          { path: "/finance", label: "Fees & Finance", icon: Wallet },
          {
            path: "/examinations",
            label: "Examinations & Results",
            icon: GraduationCap,
          },
        ];
  async function signOut() {
    setBusy(true);
    try {
      await logout();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="app-shell">
      {open && (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        />
      )}
      <aside className={`sidebar ${open ? "is-open" : ""}`}>
        <Brand />
        <button
          className="mobile-close icon-button"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
        >
          <X />
        </button>
        <div className="workspace-label">
          {studentWorkspace
            ? "STUDENT PORTAL"
            : teacherWorkspace
              ? "TEACHER WORKSPACE"
              : schoolWorkspace
                ? "SCHOOL WORKSPACE"
                : "PLATFORM WORKSPACE"}
        </div>
        <nav aria-label="Main navigation">
          {schoolWorkspace ? (
            schoolLinks.map(({ path, label, icon: Icon }) => (
              <NavLink
                key={path}
                end={
                  ![
                    "/students",
                    "/guardians",
                    "/finance",
                    "/examinations",
                    "/report-cards",
                    "/fees",
                  ].includes(path)
                }
                to={`${workspaceBase}${path}`}
                onClick={() => setOpen(false)}
              >
                <Icon size={20} />
                {label}
              </NavLink>
            ))
          ) : (
            <>
              <NavLink end to="/" onClick={() => setOpen(false)}>
                <LayoutDashboard size={20} />
                Overview
              </NavLink>
              <NavLink to="/schools" onClick={() => setOpen(false)}>
                <School size={20} />
                Schools
              </NavLink>
            </>
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="access-card">
            <ShieldCheck size={22} />
            <strong>
              {studentWorkspace
                ? "Student access"
                : teacherWorkspace
                  ? "Teaching staff access"
                  : schoolWorkspace
                    ? "School Administrator"
                    : "Super Admin access"}
            </strong>
            <p>Your central workspace for school operations.</p>
          </div>
          <button className="logout" onClick={signOut} disabled={busy}>
            <LogOut size={18} />
            {busy ? "Signing out…" : "Sign out"}
          </button>
          {error && (
            <p className="sidebar-error" role="alert">
              {error}
            </p>
          )}
          <div className="sidebar-footer">
            Dev_Bigi School Management
            <br />
            Foundation · v1.0
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="mobile-toggle icon-button"
              aria-label="Open navigation"
              onClick={() => setOpen(true)}
            >
              <Menu />
            </button>
            <span>Workspace</span>
            <span className="slash">/</span>
            <strong>
              {studentWorkspace || teacherWorkspace
                ? schoolLinks.find(
                    (link) =>
                      `${workspaceBase}${link.path}` === location.pathname,
                  )?.label ||
                  (studentWorkspace ? "Student portal" : "Teacher workspace")
                : schoolWorkspace
                  ? schoolLinks.find(
                      (link) =>
                        `/school${link.path}` === location.pathname ||
                        ([
                          "/students",
                          "/guardians",
                          "/finance",
                          "/examinations",
                        ].includes(link.path) &&
                          location.pathname.startsWith(`/school${link.path}/`)),
                    )?.label || "Overview"
                  : location.pathname === "/schools"
                    ? "Schools"
                    : "Overview"}
            </strong>
          </div>
          <div className="account">
            <div className="account-text">
              <strong>{user.name}</strong>
              <span>
                {studentWorkspace
                  ? "Student"
                  : teacherWorkspace
                    ? "Teacher"
                    : schoolWorkspace
                      ? "School Administrator"
                      : "Super Administrator"}
              </span>
            </div>
            <span className="avatar">
              {user.name.slice(0, 1).toUpperCase()}
            </span>
          </div>
        </header>
        <main>
          <Outlet />
        </main>
        <footer className="main-footer">
          © {new Date().getFullYear()} Dev_Bigi School Management System
          <span>Built for better school operations.</span>
        </footer>
      </div>
    </div>
  );
}
