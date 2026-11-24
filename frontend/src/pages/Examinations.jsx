import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { api } from "../lib/api";
import { configurationError } from "../lib/academicConfiguration";
import { examStateLabels } from "../lib/examinations";
import { useAuth } from "../context/AuthContext";
import useExamContext from "../hooks/useExamContext";
import ExaminationForm from "../components/ExaminationForm";
import Pagination from "../components/Pagination";
export default function Examinations() {
  const { user } = useAuth(),
    navigate = useNavigate();
  const administrator = user.role === "school_admin";
  const base = administrator ? "/school/examinations" : "/teacher/examinations";
  const { context, error: contextError, reload } = useExamContext();
  const [filters, setFilters] = useState({
      search: "",
      sessionId: "",
      termId: "",
      classId: "",
      status: "",
    }),
    [page, setPage] = useState(1),
    [revision, setRevision] = useState(0),
    [data, setData] = useState(null),
    [error, setError] = useState(""),
    [creating, setCreating] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError("");
    const timer = setTimeout(
      () =>
        api
          .get("/school/examinations", {
            params: { ...filters, page, limit: 25 },
            signal: controller.signal,
          })
          .then(({ data }) => setData(data))
          .catch((e) => {
            if (e.code !== "ERR_CANCELED") setError(configurationError(e));
          }),
      250,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [filters, page, revision]);
  function change(event) {
    setPage(1);
    setFilters((previous) => ({
      ...previous,
      [event.target.name]: event.target.value,
      ...(event.target.name === "sessionId" ? { termId: "" } : {}),
    }));
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">ACADEMIC PERFORMANCE</div>
          <h1>Examinations & results</h1>
          <p>
            {administrator
              ? "Configure assessments, review scores, approve results, and publish report cards."
              : "Enter and submit scores for your assigned classes and subjects."}
          </p>
        </div>
        {administrator && (
          <button
            className="btn primary"
            disabled={!context}
            onClick={() => setCreating(true)}
          >
            <Plus size={18} />
            Create examination
          </button>
        )}
      </div>
      {contextError && (
        <div className="alert error" role="alert">
          {contextError}
          <button onClick={reload}>Reload references</button>
        </div>
      )}
      {data && (
        <div className="stats-grid staff-stats">
          {["total", "draft", "submitted", "approved", "published"].map(
            (key) => (
              <article className="stat-card" key={key}>
                <div className="stat-top">
                  {key === "total"
                    ? "Matching examinations"
                    : examStateLabels[key]}
                </div>
                <strong className="stat-value">{data.stats[key]}</strong>
              </article>
            ),
          )}
        </div>
      )}
      <section className="panel">
        <div className="attendance-filter-panel">
          <div className="attendance-controls">
            <label>
              Search
              <input
                name="search"
                maxLength={100}
                value={filters.search}
                onChange={change}
                placeholder="Examination name"
              />
            </label>
            {[
              ["sessionId", "Session", context?.sessions || []],
              [
                "termId",
                "Term",
                (context?.terms || []).filter(
                  (item) =>
                    !filters.sessionId || item.sessionId === filters.sessionId,
                ),
              ],
              ["classId", "Class", context?.classes || []],
            ].map(([key, label, rows]) => (
              <label key={key}>
                {label}
                <select name={key} value={filters[key]} onChange={change}>
                  <option value="">All {label.toLowerCase()}s</option>
                  {rows.map((item) => (
                    <option key={item._id} value={item._id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <label>
              Result state
              <select name="status" value={filters.status} onChange={change}>
                <option value="">All states</option>
                {Object.entries(examStateLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        {error ? (
          <div className="alert error" role="alert">
            {error}
            <button onClick={() => setRevision((value) => value + 1)}>
              Retry
            </button>
          </div>
        ) : !data ? (
          <div className="loading-state">Loading examinations…</div>
        ) : !data.records.length ? (
          <div className="empty-state">
            <h3>No examinations found</h3>
            <p>
              {administrator
                ? "Create an examination or change the filters."
                : "Ask your administrator to configure examinations and assign your teaching subjects."}
            </p>
          </div>
        ) : (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Examination</th>
                    <th>Period / class</th>
                    <th>Subjects</th>
                    <th>State</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.records.map((record) => (
                    <tr key={record._id}>
                      <td>
                        <strong>{record.name}</strong>
                      </td>
                      <td>
                        {record.sessionName} · {record.termName}
                        <span className="staff-secondary">
                          {record.className}
                        </span>
                      </td>
                      <td>
                        {record.subjects
                          .map((subject) => subject.name)
                          .join(", ")}
                      </td>
                      <td>{examStateLabels[record.status]}</td>
                      <td>
                        <Link
                          className="text-link"
                          to={`${base}/${record._id}`}
                        >
                          Open workspace
                        </Link>
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
      {creating && context && (
        <ExaminationForm
          context={context}
          onClose={() => setCreating(false)}
          onSaved={(record) => navigate(`${base}/${record._id}`)}
        />
      )}
    </>
  );
}
