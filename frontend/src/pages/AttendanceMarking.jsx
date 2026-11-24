import { useState } from "react";
import { Save, ClipboardCheck } from "lucide-react";
import { api } from "../lib/api";
import { configurationError } from "../lib/academicConfiguration";
import { attendanceToday, attendanceLabels } from "../lib/attendance";
import useStudentOptions from "../hooks/useStudentOptions";
import AttendancePlacementFields from "../components/AttendancePlacementFields";
import AttendanceSummary from "../components/AttendanceSummary";
import AttendanceAudit from "../components/AttendanceAudit";
import ConfirmationDialog from "../components/ConfirmationDialog";
import Pagination from "../components/Pagination";
export default function AttendanceMarking({ kind }) {
  const { options, error: optionsError, reload } = useStudentOptions();
  const [filters, setFilters] = useState({
    date: attendanceToday(),
    sessionId: "",
    classId: "",
    arm: "",
    category: "",
    search: "",
  });
  const [loaded, setLoaded] = useState(null),
    [data, setData] = useState(null),
    [page, setPage] = useState(1),
    [draft, setDraft] = useState({});
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [bulk, setBulk] = useState("present"),
    [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState(null),
    [confirmError, setConfirmError] = useState(""),
    [audit, setAudit] = useState(null);
  const changes = (data?.records || [])
    .filter(
      (row) =>
        row.markable &&
        draft[row.personId] &&
        draft[row.personId] !== row.attendance?.status,
    )
    .map((row) => ({
      personId: String(row.personId),
      status: draft[row.personId],
      revision: row.attendance?.revision || 0,
    }));
  const corrections = changes.filter(
    (change) =>
      data.records.find((row) => String(row.personId) === change.personId)
        ?.attendance,
  ).length;
  function change(event) {
    const { name, value } = event.target;
    setFilters((previous) => ({
      ...previous,
      [name]: value,
      ...(name === "classId" ? { arm: "" } : {}),
    }));
  }
  function context(values) {
    return kind === "student"
      ? {
          date: values.date,
          sessionId: values.sessionId,
          classId: values.classId,
          arm: values.arm,
        }
      : { date: values.date };
  }
  async function load(values, nextPage = 1) {
    setBusy(true);
    setError("");
    try {
      const query = {
        ...context(values),
        search: values.search,
        page: nextPage,
        limit: 25,
        ...(kind === "staff" ? { category: values.category } : {}),
      };
      const [roster, staff] = await Promise.all([
        api.get(`/school/attendance/${kind}/roster`, { params: query }),
        kind === "student"
          ? api.get("/school/attendance/staff/roster", {
              params: { date: values.date, limit: 1 },
            })
          : null,
      ]);
      setData({ ...roster.data, staffSummary: staff?.data.summary });
      setLoaded({ ...values });
      setPage(nextPage);
      setDraft({});
      setReason("");
    } catch (e) {
      setError(configurationError(e));
    } finally {
      setBusy(false);
    }
  }
  function requestLoad(values, nextPage = 1) {
    if (changes.length) {
      setConfirmError("");
      setConfirmation({
        type: "discard",
        values: { ...values },
        page: nextPage,
      });
    } else load(values, nextPage);
  }
  async function confirm() {
    if (confirmation.type === "discard") {
      const target = confirmation;
      setConfirmation(null);
      return load(target.values, target.page);
    }
    setBusy(true);
    setConfirmError("");
    try {
      await api.put(`/school/attendance/${kind}`, {
        ...context(loaded),
        entries: changes,
        correctionReason: reason.trim(),
      });
      setConfirmation(null);
      setNotice(
        "Attendance saved. Creation and corrections are recorded in the audit history.",
      );
      await load(loaded, page);
    } catch (e) {
      setConfirmError(configurationError(e));
    } finally {
      setBusy(false);
    }
  }
  function requestSave() {
    setConfirmError("");
    if (corrections && reason.trim().length < 3)
      return setError("Enter a correction reason of at least 3 characters.");
    setError("");
    setConfirmation({ type: "save" });
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">ATTENDANCE MANAGEMENT</div>
          <h1>
            {kind === "student" ? "Student attendance" : "Staff attendance"}
          </h1>
          <p>
            Mark a daily register or correct a saved status with an audit
            reason.
          </p>
        </div>
      </div>
      {optionsError && kind === "student" && (
        <div className="alert error" role="alert">
          {optionsError}
          <button onClick={reload}>Reload academic options</button>
        </div>
      )}
      <form
        className="panel attendance-filter-panel"
        onSubmit={(event) => {
          event.preventDefault();
          requestLoad(filters);
        }}
      >
        <fieldset className="attendance-controls" disabled={busy}>
          <label>
            Date (WAT)
            <input
              name="date"
              type="date"
              max={attendanceToday()}
              required
              value={filters.date}
              onChange={change}
            />
          </label>
          {kind === "student" ? (
            <AttendancePlacementFields
              options={options}
              values={filters}
              onChange={change}
            />
          ) : (
            <label>
              Staff category
              <select
                name="category"
                value={filters.category}
                onChange={change}
              >
                <option value="">All staff</option>
                <option value="teaching">Teaching</option>
                <option value="non_teaching">Non-teaching</option>
              </select>
            </label>
          )}
          <label>
            Search name or ID
            <input
              name="search"
              value={filters.search}
              maxLength={100}
              onChange={change}
            />
          </label>
          <button className="btn primary">Load register</button>
        </fieldset>
      </form>
      {error && (
        <div className="alert error" role="alert">
          {error}
          {loaded && (
            <button onClick={() => requestLoad(loaded, page)}>
              Reload register
            </button>
          )}
        </div>
      )}
      {notice && (
        <div className="alert success" role="status">
          {notice}
        </div>
      )}
      {busy && !data ? (
        <div className="loading-state">Loading register…</div>
      ) : !data ? (
        <section className="panel empty-state">
          <ClipboardCheck size={32} />
          <h3>Choose a register to begin</h3>
          <p>No statuses are assigned until you select and save them.</p>
        </section>
      ) : (
        <>
          <AttendanceSummary summary={data.summary} roster />
          {data.staffSummary && (
            <section className="panel attendance-staff-summary">
              <h2>Staff summary · {loaded.date}</h2>
              <div>
                {[
                  ["expected", "Expected"],
                  ["present", "Present"],
                  ["absent", "Absent"],
                  ["late", "Late"],
                  ["excused", "Excused"],
                  ["unmarked", "Unmarked"],
                ].map(([key, label]) => (
                  <span key={key}>
                    {label}: <strong>{data.staffSummary[key]}</strong>
                  </span>
                ))}
              </div>
            </section>
          )}
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>
                  {loaded.date} ·{" "}
                  {kind === "student"
                    ? `${options?.classes.find((item) => item._id === loaded.classId)?.name || "Class"}${loaded.arm ? ` / ${loaded.arm}` : ""}`
                    : "Staff register"}
                </h2>
                <p>
                  Saved counts cover the complete selected roster, before name
                  search. Changes apply only to this page.
                </p>
              </div>
              <button
                className="btn secondary"
                disabled={busy}
                onClick={() => requestLoad(loaded, page)}
              >
                Reload
              </button>
            </div>
            {!data.contextActive && (
              <div className="alert info">
                This academic context is inactive. Existing records can be
                corrected for active people; new attendance cannot be created
                here.
              </div>
            )}
            {data.records.length ? (
              <>
                <div className="attendance-bulk">
                  <label>
                    Bulk status
                    <select
                      value={bulk}
                      disabled={busy}
                      onChange={(event) => setBulk(event.target.value)}
                    >
                      {Object.entries(attendanceLabels).map(
                        ([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  <button
                    className="btn secondary"
                    disabled={busy}
                    onClick={() => {
                      const values = { ...draft };
                      for (const row of data.records)
                        if (row.markable) values[row.personId] = bulk;
                      setDraft(values);
                    }}
                  >
                    Apply to editable people on this page
                  </button>
                  <span>{changes.length} unsaved changes</span>
                </div>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>
                          {kind === "student"
                            ? "Admission number"
                            : "Employee ID"}
                        </th>
                        <th>Status</th>
                        <th>Last marked / modified</th>
                        <th>History</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.records.map((row) => (
                        <tr key={row.personId}>
                          <td>
                            <strong>{row.personName}</strong>
                            {!row.markable && (
                              <span className="staff-secondary">
                                Read-only for this register
                              </span>
                            )}
                          </td>
                          <td>{row.identifier}</td>
                          <td>
                            <select
                              aria-label={`Attendance for ${row.personName}`}
                              disabled={busy || !row.markable}
                              value={
                                draft[row.personId] ??
                                row.attendance?.status ??
                                ""
                              }
                              onChange={(event) =>
                                setDraft({
                                  ...draft,
                                  [row.personId]: event.target.value,
                                })
                              }
                            >
                              {!row.attendance && (
                                <option value="">Unmarked</option>
                              )}
                              {Object.entries(attendanceLabels).map(
                                ([value, label]) => (
                                  <option key={value} value={value}>
                                    {label}
                                  </option>
                                ),
                              )}
                            </select>
                          </td>
                          <td>
                            {row.attendance ? (
                              <>
                                {row.attendance.updatedByName}
                                <span className="staff-secondary">
                                  {new Date(
                                    row.attendance.updatedAt,
                                  ).toLocaleString("en-GB", {
                                    timeZone: "Africa/Lagos",
                                  })}{" "}
                                  WAT
                                </span>
                              </>
                            ) : (
                              "Not saved"
                            )}
                          </td>
                          <td>
                            {row.attendance && (
                              <button
                                className="text-link action-link"
                                onClick={() => setAudit(row.attendance)}
                              >
                                View audit
                              </button>
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
                  onPage={(next) => requestLoad(loaded, next)}
                />
                <div className="attendance-save">
                  {corrections > 0 && (
                    <label>
                      Correction reason
                      <textarea
                        maxLength={300}
                        minLength={3}
                        value={reason}
                        disabled={busy}
                        onChange={(event) => setReason(event.target.value)}
                        placeholder="Explain why saved attendance is changing"
                      />
                    </label>
                  )}
                  <button
                    className="btn primary"
                    disabled={busy || !changes.length}
                    onClick={requestSave}
                  >
                    <Save size={18} />
                    {busy ? "Saving…" : `Save ${changes.length} changes`}
                  </button>
                </div>
              </>
            ) : (
              <div className="empty-state">
                <h3>No eligible people or saved records</h3>
                <p>
                  Check the date, current placement, status, and search filters.
                </p>
              </div>
            )}
          </section>
        </>
      )}
      {confirmation && (
        <ConfirmationDialog
          title={
            confirmation.type === "discard"
              ? "Discard unsaved changes?"
              : "Save attendance?"
          }
          description={
            confirmation.type === "discard"
              ? "Loading another register or page will discard unsaved changes on this page."
              : `Save ${changes.length} entries, including ${corrections} corrections? People left unmarked will remain unmarked. All changes record your name and time.`
          }
          error={confirmError}
          busy={busy}
          onClose={() => setConfirmation(null)}
          onConfirm={confirm}
        />
      )}
      {audit && (
        <AttendanceAudit record={audit} onClose={() => setAudit(null)} />
      )}
    </>
  );
}
