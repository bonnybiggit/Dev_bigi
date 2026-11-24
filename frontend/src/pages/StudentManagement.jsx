import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Plus,
  Search,
  Users,
  CircleCheck,
  Archive,
  ClipboardList,
} from "lucide-react";
import { api } from "../lib/api";
import { configurationError } from "../lib/academicConfiguration";
import { studentName, studentLabels } from "../lib/students";
import useStudentOptions from "../hooks/useStudentOptions";
import StudentForm from "../components/StudentForm";
import StudentStatusActions from "../components/StudentStatusActions";
import Pagination from "../components/Pagination";
import { StatusBadge } from "../components/SchoolTable";
const initialFilters = {
  search: "",
  sessionId: "",
  classId: "",
  arm: "",
  status: "",
  admissionStatus: "",
};
export default function StudentManagement() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [registering, setRegistering] = useState(false);
  const [notice, setNotice] = useState("");
  const { options, error: optionsError, reload } = useStudentOptions();
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const timer = setTimeout(async () => {
      try {
        const [list, counts] = await Promise.all([
          api.get("/school/students", {
            params: { ...filters, page, limit: 10 },
            signal: controller.signal,
          }),
          api.get("/school/students/stats", { signal: controller.signal }),
        ]);
        if (page > 1 && !list.data.records.length && list.data.total > 0) {
          setPage(Math.ceil(list.data.total / 10));
          return;
        }
        setData(list.data);
        setStats(counts.data);
      } catch (e) {
        if (e.code !== "ERR_CANCELED") setError(configurationError(e));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [filters, page, revision]);
  function filter(name, value) {
    setFilters((previous) => ({
      ...previous,
      [name]: value,
      ...(name === "classId" ? { arm: "" } : {}),
    }));
    setPage(1);
  }
  const selectedClass = options?.classes.find(
    (item) => item._id === filters.classId,
  );
  const ready =
    options?.sessions.some((item) => item.status === "active") &&
    options?.classes.some(
      (item) =>
        item.status === "active" &&
        (!item.arms.length ||
          item.arms.some((arm) => !item.inactiveArms?.includes(arm))),
    );
  const cards = [
    {
      key: "totalStudents",
      title: "Total students",
      icon: Users,
      color: "blue",
    },
    {
      key: "activeStudents",
      title: "Active students",
      icon: CircleCheck,
      color: "green",
    },
    {
      key: "pendingAdmissions",
      title: "Pending admissions",
      icon: ClipboardList,
      color: "amber",
    },
    {
      key: "archivedStudents",
      title: "Archived students",
      icon: Archive,
      color: "purple",
    },
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">STUDENTS & ADMISSIONS</div>
          <h1>Students & admissions</h1>
          <p>
            Register students, manage placements, and maintain admission
            records.
          </p>
        </div>
        <button
          className="btn primary"
          disabled={!ready}
          onClick={() => setRegistering(true)}
        >
          <Plus size={18} />
          Register student
        </button>
      </div>
      {options && !ready && (
        <div className="alert info">
          Activate an academic session and a class with an available arm before
          registration.{" "}
          <Link className="text-link" to="/school/sessions">
            Sessions
          </Link>{" "}
          ·{" "}
          <Link className="text-link" to="/school/classes">
            Classes
          </Link>
        </div>
      )}
      {optionsError && (
        <div className="alert error" role="alert">
          {optionsError}
          <button onClick={reload}>Reload placement options</button>
        </div>
      )}
      {notice && (
        <div className="alert success" role="status">
          {notice}
        </div>
      )}
      {error ? (
        <div className="alert error" role="alert">
          {error}
          <button onClick={() => setRevision((value) => value + 1)}>
            Retry
          </button>
        </div>
      ) : (
        !loading &&
        stats && (
          <div className="stats-grid staff-stats">
            {cards.map(({ key, title, icon: Icon, color }) => (
              <article className="stat-card" key={key}>
                <div className="stat-top">
                  <span>{title}</span>
                  <span className={`stat-icon ${color}`}>
                    <Icon size={21} />
                  </span>
                </div>
                <strong className="stat-value">
                  {stats[key].toLocaleString()}
                </strong>
                <p>
                  {key === "activeStudents"
                    ? `${stats.inactiveStudents} inactive students`
                    : key === "pendingAdmissions"
                      ? "Non-archived pending applications"
                      : "Across this school · all records"}
                </p>
              </article>
            ))}
          </div>
        )
      )}
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Student directory</h2>
            <p>Review student profiles and academic placements.</p>
          </div>
        </div>
        <div className="student-filters">
          <div className="search-field">
            <Search size={18} />
            <input
              type="search"
              aria-label="Search students by name or admission number"
              value={filters.search}
              maxLength={100}
              placeholder="Search name or admission number…"
              onChange={(event) => filter("search", event.target.value)}
            />
          </div>
          {[
            ["sessionId", "All sessions", options?.sessions || []],
            ["classId", "All classes", options?.classes || []],
          ].map(([key, label, records]) => (
            <select
              key={key}
              aria-label={label}
              value={filters[key]}
              onChange={(event) => filter(key, event.target.value)}
            >
              <option value="">{label}</option>
              {records.map((item) => (
                <option key={item._id} value={item._id}>
                  {item.name}
                  {item.status !== "active" ? " (inactive)" : ""}
                </option>
              ))}
            </select>
          ))}
          <select
            aria-label="Class arm filter"
            value={filters.arm}
            disabled={!selectedClass?.arms.length}
            onChange={(event) => filter("arm", event.target.value)}
          >
            <option value="">All arms</option>
            {selectedClass?.arms.map((arm) => (
              <option key={arm} value={arm}>
                {arm}
              </option>
            ))}
          </select>
          {[
            [
              "status",
              "All student statuses",
              ["active", "inactive", "archived"],
            ],
            [
              "admissionStatus",
              "All admission statuses",
              ["pending", "admitted", "waitlisted", "rejected"],
            ],
          ].map(([key, label, statuses]) => (
            <select
              key={key}
              aria-label={label}
              value={filters[key]}
              onChange={(event) => filter(key, event.target.value)}
            >
              <option value="">{label}</option>
              {statuses.map((value) => (
                <option key={value} value={value}>
                  {studentLabels[value]}
                </option>
              ))}
            </select>
          ))}
        </div>
        {loading ? (
          <div className="loading-state" role="status">
            Loading students…
          </div>
        ) : error ? (
          <div className="empty-state">
            <p>Student records could not be loaded. Please retry above.</p>
          </div>
        ) : !data?.records.length ? (
          <div className="empty-state">
            <Users size={34} />
            <h3>No students found</h3>
            <p>Register your first student or adjust the search and filters.</p>
            {Object.values(filters).some(Boolean) && (
              <button
                className="btn secondary"
                onClick={() => {
                  setFilters(initialFilters);
                  setPage(1);
                }}
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Admission number</th>
                    <th>Session</th>
                    <th>Class / arm</th>
                    <th>Admission</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.records.map((record) => (
                    <tr key={record._id}>
                      <td>
                        <strong>{studentName(record)}</strong>
                      </td>
                      <td>{record.admissionNumber}</td>
                      <td>
                        {options?.sessions.find(
                          (item) => item._id === record.sessionId,
                        )?.name || "—"}
                      </td>
                      <td>
                        {options?.classes.find(
                          (item) => item._id === record.classId,
                        )?.name || "—"}
                        {record.arm ? ` / ${record.arm}` : ""}
                      </td>
                      <td>{studentLabels[record.admissionStatus]}</td>
                      <td>
                        <StatusBadge status={record.status} />
                      </td>
                      <td>
                        <div className="student-row-actions">
                          <Link
                            className="text-link"
                            to={`/school/students/${record._id}`}
                          >
                            View profile
                          </Link>
                          <StudentStatusActions
                            record={record}
                            onUpdated={() => {
                              setNotice(
                                "Student status updated; all linked records retained.",
                              );
                              setRevision((value) => value + 1);
                            }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} total={data.total} onPage={setPage} />
          </>
        )}
      </section>
      {registering && options && (
        <StudentForm
          options={options}
          onClose={() => setRegistering(false)}
          onSaved={(record) => navigate(`/school/students/${record._id}`)}
        />
      )}
    </>
  );
}
