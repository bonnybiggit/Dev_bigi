import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Users,
  CircleCheck,
  CirclePause,
  LockKeyhole,
  School,
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { api, errorMessage } from "../lib/api";
import SchoolIdentity from "../components/SchoolIdentity";
export default function SchoolDashboard() {
  const { user, school } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setError("");
    try {
      const { data } = await api.get("/school/dashboard");
      setData(data);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const cards = [
    {
      key: "totalAdministrators",
      title: "Administrators",
      icon: Users,
      color: "blue",
      note: "Accounts in this school",
    },
    {
      key: "activeAdministrators",
      title: "Active accounts",
      icon: CircleCheck,
      color: "green",
      note: "Enabled administrator accounts",
    },
    {
      key: "inactiveAdministrators",
      title: "Inactive accounts",
      icon: CirclePause,
      color: "amber",
      note: "Disabled administrator accounts",
    },
    {
      key: "pendingPasswordChanges",
      title: "Password setup pending",
      icon: LockKeyhole,
      color: "purple",
      note: "Awaiting first password change",
    },
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR SCHOOL WORKSPACE</div>
          <h1>Welcome, {user.name.split(" ")[0]}.</h1>
          <p>Your school's central administration workspace.</p>
        </div>
      </div>
      {error ? (
        <div className="alert error" role="alert">
          {error}
          <button onClick={load}>Try again</button>
        </div>
      ) : !data ? (
        <div className="loading-state">Loading your school…</div>
      ) : (
        <>
          <section className="network-banner">
            <div>
              <SchoolIdentity school={school} />
              <p>
                {data.school.city}, {data.school.country} ·{" "}
                {data.school.schoolType}
              </p>
            </div>
            <span className="badge active">Active school</span>
          </section>
          <div className="stats-grid">
            {cards.map(({ key, title, icon: Icon, color, note }) => (
              <article className="stat-card" key={key}>
                <div className="stat-top">
                  <span>{title}</span>
                  <span className={`stat-icon ${color}`}>
                    <Icon size={21} />
                  </span>
                </div>
                <strong className="stat-value">
                  {data.stats[key].toLocaleString()}
                </strong>
                <p>{note}</p>
              </article>
            ))}
          </div>
          <section className="panel school-modules">
            <div className="panel-heading">
              <div>
                <h2>Your school modules</h2>
                <p>Explore the workspace for upcoming school operations.</p>
              </div>
            </div>
            <div className="module-grid">
              {[
                "students",
                "guardians",
                "staff",
                "classes",
                "profile",
                "sessions",
                "terms",
                "subjects",
                "attendance/student",
                "attendance/staff",
                "attendance/reports",
                "finance",
                "examinations",
              ].map((module) => (
                <Link to={`/school/${module}`} key={module}>
                  <strong>
                    {module === "staff"
                      ? "Teachers & Staff"
                      : module === "students"
                        ? "Students & Admissions"
                        : module === "guardians"
                          ? "Parents & Guardians"
                          : module === "finance"
                            ? "Fees & Finance"
                            : module === "examinations"
                              ? "Examinations & Results"
                              : module.startsWith("attendance/")
                                ? {
                                    "attendance/student": "Student Attendance",
                                    "attendance/staff": "Staff Attendance",
                                    "attendance/reports": "Attendance Reports",
                                  }[module]
                                : module.charAt(0).toUpperCase() +
                                  module.slice(1)}
                  </strong>
                  <span>
                    {[
                      "classes",
                      "profile",
                      "sessions",
                      "terms",
                      "subjects",
                      "staff",
                      "students",
                      "guardians",
                      "attendance/student",
                      "attendance/staff",
                      "attendance/reports",
                      "finance",
                      "examinations",
                    ].includes(module)
                      ? "Manage"
                      : "Coming soon"}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        </>
      )}
    </>
  );
}
