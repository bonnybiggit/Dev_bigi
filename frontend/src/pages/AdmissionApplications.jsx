import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Printer } from "lucide-react";
import { admissionsApi, applicationStatusLabels } from "../lib/admissions";
import { errorMessage } from "../lib/api";
import Pagination from "../components/Pagination";
import Modal from "../components/Modal";
export default function AdmissionApplications() {
  const navigate = useNavigate();
  const [options, setOptions] = useState(null),
    [stats, setStats] = useState(null),
    [data, setData] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0),
    [creating, setCreating] = useState(false);
  const [filters, setFilters] = useState({
      search: "",
      sessionId: "",
      classId: "",
      arm: "",
      status: "",
    }),
    [page, setPage] = useState(1),
    [form, setForm] = useState({
      requestKey: "",
      sessionId: "",
      classId: "",
      arm: "",
    });
  useEffect(() => {
    let live = true;
    admissionsApi
      .get("applications/options")
      .then((o) => {
        if (live) setOptions(o);
      })
      .catch((e) => {
        if (live) setError(errorMessage(e));
      });
    return () => {
      live = false;
    };
  }, [revision]);
  useEffect(() => {
    let live = true;
    setData(null);
    Promise.all([
      admissionsApi.get("applications", { ...filters, page, limit: 25 }),
      admissionsApi.get("applications/dashboard"),
    ])
      .then(([d, s]) => {
        if (live) {
          setData(d);
          setStats(s.stats);
        }
      })
      .catch((e) => {
        if (live) setError(errorMessage(e));
      });
    return () => {
      live = false;
    };
  }, [filters, page, revision]);
  function newApplication() {
    setForm({
      requestKey: crypto.randomUUID(),
      sessionId:
        options?.sessions.find((s) => s.status === "active")?._id || "",
      classId: "",
      arm: "",
    });
    setCreating(true);
    setError("");
  }
  async function create(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { application } = await admissionsApi.post("applications", form);
      navigate(`/school/applications/${application._id}`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const cls = options?.classes.find((c) => c._id === form.classId);
  return (
    <div className="admissions-workspace teacher-workspace">
      <div className="page-heading">
        <div>
          <div className="eyebrow">STUDENTS & ADMISSIONS</div>
          <h1>Admission Applications</h1>
          <p>
            Issue numbered forms, record returned applications and enrol
            approved applicants. Issuing a form creates no student or login.
          </p>
        </div>
        <button
          className="btn primary"
          disabled={!options}
          onClick={newApplication}
        >
          <Plus size={18} />
          New application
        </button>
      </div>
      {error && !creating && (
        <div className="alert error" role="alert">
          {error}
          <button
            onClick={() => {
              setError("");
              setRevision((v) => v + 1);
            }}
          >
            Retry
          </button>
        </div>
      )}
      {stats && (
        <div className="stats-grid">
          {[
            ["total", "Total applications"],
            ...Object.entries(applicationStatusLabels).map(([key, label]) => [
              key,
              key === "enrolled" ? "Enrolled applications" : label,
            ]),
          ].map(([key, label]) => (
            <section className="stat-card" key={key}>
              <h3>{label}</h3>
              <strong>{stats[key]}</strong>
            </section>
          ))}
        </div>
      )}
      <section className="panel">
        <h2>Quick actions</h2>
        <div className="button-row">
          <button
            className="btn secondary"
            disabled={!options}
            onClick={newApplication}
          >
            Generate and print a new form
          </button>
          <button
            className="btn secondary"
            onClick={() => {
              setFilters((old) => ({ ...old, status: "awaiting_form" }));
              setPage(1);
            }}
          >
            Register returned form
          </button>
          <button
            className="btn secondary"
            onClick={() => {
              setFilters((old) => ({ ...old, status: "under_review" }));
              setPage(1);
            }}
          >
            Review pending applications
          </button>
          <Link className="btn secondary" to="/school/students">
            Registered students
          </Link>
          <Link className="btn secondary" to="/school/forms">
            Forms & Documents
          </Link>
        </div>
      </section>
      <section className="panel">
        <h2>Search applications</h2>
        <div className="teacher-filters">
          <label>
            Reference, admission number, name or guardian phone
            <input
              maxLength={100}
              value={filters.search}
              onChange={(e) => {
                setFilters((old) => ({ ...old, search: e.target.value }));
                setPage(1);
              }}
            />
          </label>
          <label>
            Status
            <select
              value={filters.status}
              onChange={(e) => {
                setFilters((old) => ({ ...old, status: e.target.value }));
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              {Object.entries(applicationStatusLabels).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Session
            <select
              value={filters.sessionId}
              onChange={(e) => {
                setFilters((old) => ({ ...old, sessionId: e.target.value }));
                setPage(1);
              }}
            >
              <option value="">All sessions</option>
              {options?.sessions.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Class
            <select
              value={filters.classId}
              onChange={(e) => {
                setFilters((old) => ({
                  ...old,
                  classId: e.target.value,
                  arm: "",
                }));
                setPage(1);
              }}
            >
              <option value="">All classes</option>
              {options?.classes.map((c) => (
                <option key={c._id} value={c._id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Arm
            <select
              value={filters.arm}
              onChange={(e) => {
                setFilters((old) => ({ ...old, arm: e.target.value }));
                setPage(1);
              }}
            >
              <option value="">All arms</option>
              {options?.classes
                .find((c) => c._id === filters.classId)
                ?.arms.map((a) => (
                  <option key={a}>{a}</option>
                ))}
            </select>
          </label>
        </div>
        {!data ? (
          <p role="status">Loading applications...</p>
        ) : !data.total ? (
          <p>No applications match these filters.</p>
        ) : (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Application</th>
                    <th>Applicant</th>
                    <th>Session / Class / Arm</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.records.map((a) => (
                    <tr key={a._id}>
                      <td>
                        <Link to={`/school/applications/${a._id}`}>
                          {a.reference}
                        </Link>
                      </td>
                      <td>
                        {[
                          a.student?.firstName,
                          a.student?.middleName,
                          a.student?.lastName,
                        ]
                          .filter(Boolean)
                          .join(" ") || "Form not yet returned"}
                      </td>
                      <td>
                        {
                          options?.sessions.find((s) => s._id === a.sessionId)
                            ?.name
                        }{" "}
                        /{" "}
                        {options?.classes.find((c) => c._id === a.classId)
                          ?.name || "Class not selected"}{" "}
                        {a.arm}
                      </td>
                      <td>{applicationStatusLabels[a.status]}</td>
                      <td>
                        <Link
                          className="btn secondary"
                          to={`/school/documents/${a.documentId}`}
                        >
                          <Printer size={16} />
                          Print / reprint
                        </Link>
                        {a.studentId && (
                          <Link
                            className="text-link"
                            to={`/school/students/${a.studentId}`}
                          >
                            Registered student
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              total={data.total}
              limit={25}
              onPage={setPage}
            />
          </>
        )}
      </section>
      {creating && (
        <Modal
          title="Generate a tracked student application"
          onClose={() => {
            if (!busy) setCreating(false);
          }}
        >
          <form className="modal-body" onSubmit={create}>
            <p>
              The reference is allocated by the database and remains reserved if
              the application is cancelled. No student or account is created.
            </p>
            <label>
              Intended session
              <select
                value={form.sessionId}
                required
                onChange={(e) =>
                  setForm((old) => ({ ...old, sessionId: e.target.value }))
                }
              >
                <option value="">Choose session</option>
                {options.sessions.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Intended class (if known)
              <select
                value={form.classId}
                onChange={(e) =>
                  setForm((old) => ({
                    ...old,
                    classId: e.target.value,
                    arm: "",
                  }))
                }
              >
                <option value="">Not yet known</option>
                {options.classes
                  .filter((c) => c.status === "active")
                  .map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Intended arm (if known)
              <select
                value={form.arm}
                onChange={(e) =>
                  setForm((old) => ({ ...old, arm: e.target.value }))
                }
              >
                <option value="">Not yet known / no arms</option>
                {cls?.arms
                  .filter((a) => !cls.inactiveArms.includes(a))
                  .map((a) => (
                    <option key={a}>{a}</option>
                  ))}
              </select>
            </label>
            {error && (
              <div className="alert error" role="alert">
                {error}
              </div>
            )}
            <button className="btn primary" disabled={busy}>
              {busy ? "Generating..." : "Generate application reference"}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
