import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { api } from "../lib/api";
import { configurationError } from "../lib/academicConfiguration";
import { markText, examStateLabels } from "../lib/examinations";
import ConfirmationDialog from "./ConfirmationDialog";
import ResultHistory from "./ResultHistory";
import Pagination from "./Pagination";
export default function ScoreEntry({
  exam,
  context,
  onChanged,
  onDirtyChange,
}) {
  const [filters, setFilters] = useState({
      subjectId: "",
      arm: "",
      search: "",
    }),
    [loaded, setLoaded] = useState(null),
    [data, setData] = useState(null),
    [draft, setDraft] = useState({}),
    [page, setPage] = useState(1),
    [reason, setReason] = useState("");
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [confirmation, setConfirmation] = useState(null),
    [confirmError, setConfirmError] = useState(""),
    [history, setHistory] = useState(null);
  const assignedClass = context.classes.find(
    (item) => item._id === exam.classId,
  );
  const schoolClass =
    exam.authorisedArmsBySubject && filters.subjectId
      ? {
          ...assignedClass,
          arms: (exam.authorisedArmsBySubject[filters.subjectId] || []).filter(
            Boolean,
          ),
        }
      : assignedClass;
  const changedRows = (data?.records || []).filter(
    (row) =>
      row.editable &&
      draft[row.studentId] &&
      (exam.components.some(
        (component) =>
          String(draft[row.studentId].scores[component.key]) !==
          String(row.result?.scores[component.key] ?? ""),
      ) ||
        draft[row.studentId].teacherComment !==
          (row.result?.teacherComment || "")),
  );
  useEffect(() => {
    onDirtyChange(changedRows.length > 0);
  }, [changedRows.length, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  function base(row) {
    return (
      draft[row.studentId] || {
        scores: Object.fromEntries(
          exam.components.map((component) => [
            component.key,
            String(row.result?.scores[component.key] ?? ""),
          ]),
        ),
        teacherComment: row.result?.teacherComment || "",
      }
    );
  }
  function edit(row, key, value) {
    const values = base(row);
    setDraft((previous) => ({
      ...previous,
      [row.studentId]:
        key === "teacherComment"
          ? { ...values, teacherComment: value }
          : { ...values, scores: { ...values.scores, [key]: value } },
    }));
  }
  async function load(values, nextPage = 1) {
    setBusy(true);
    setError("");
    try {
      const { data } = await api.get(`/school/examinations/${exam._id}/sheet`, {
        params: { ...values, page: nextPage, limit: 25 },
      });
      setData(data);
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
    if (changedRows.length) {
      setConfirmError("");
      setConfirmation({
        type: "discard",
        values: { ...values },
        page: nextPage,
      });
    } else load(values, nextPage);
  }
  function requestSave() {
    if (
      changedRows.some((row) =>
        exam.components.some(
          (component) =>
            base(row).scores[component.key] === "" ||
            !Number.isFinite(Number(base(row).scores[component.key])),
        ),
      )
    )
      return setError(
        "Enter every configured component for each changed student. Blank scores are not treated as zero.",
      );
    if (changedRows.some((row) => row.result) && reason.trim().length < 3)
      return setError("Enter a correction reason of at least 3 characters.");
    setConfirmError("");
    setConfirmation({ type: "save" });
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
      if (confirmation.type === "submit")
        await api.post(`/school/examinations/${exam._id}/submit-subject`, {
          subjectId: loaded.subjectId,
          arm: loaded.arm,
        });
      else
        await api.put(`/school/examinations/${exam._id}/scores`, {
          subjectId: loaded.subjectId,
          arm: loaded.arm,
          reason: reason.trim(),
          entries: changedRows.map((row) => ({
            studentId: String(row.studentId),
            revision: row.result?.revision || 0,
            scores: Object.fromEntries(
              exam.components.map((component) => [
                component.key,
                Number(base(row).scores[component.key]),
              ]),
            ),
            teacherComment: base(row).teacherComment,
          })),
        });
      setConfirmation(null);
      setNotice(
        confirmation.type === "submit"
          ? "Subject submitted for administrator review."
          : "Scores saved and calculated by the server.",
      );
      await load(loaded, page);
      onChanged();
    } catch (e) {
      setConfirmError(configurationError(e));
    } finally {
      setBusy(false);
    }
  }
  const locked = exam.status !== "draft";
  return (
    <section className="panel finance-section">
      <div className="panel-heading">
        <div>
          <h2>Score entry</h2>
          <p>
            Enter one student or multiple students, then save the changed rows.
            Calculations are returned by the server.
          </p>
        </div>
      </div>
      <form
        className="attendance-filter-panel"
        onSubmit={(event) => {
          event.preventDefault();
          requestLoad(filters);
        }}
      >
        <fieldset className="attendance-controls" disabled={busy}>
          <label>
            Subject
            <select
              value={filters.subjectId}
              required
              onChange={(event) =>
                setFilters({
                  ...filters,
                  subjectId: event.target.value,
                  ...(exam.authorisedArmsBySubject ? { arm: "" } : {}),
                })
              }
            >
              <option value="">Select subject</option>
              {exam.subjects.map((item) => (
                <option key={item.subjectId} value={item.subjectId}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Class arm
            <select
              required={!!schoolClass?.arms.length}
              disabled={!schoolClass?.arms.length}
              value={filters.arm}
              onChange={(event) =>
                setFilters({ ...filters, arm: event.target.value })
              }
            >
              <option value="">
                {schoolClass?.arms.length ? "Select arm" : "No arms"}
              </option>
              {schoolClass?.arms.map((arm) => (
                <option key={arm} value={arm}>
                  {arm}
                </option>
              ))}
            </select>
          </label>
          <label>
            Search student
            <input
              maxLength={100}
              value={filters.search}
              onChange={(event) =>
                setFilters({ ...filters, search: event.target.value })
              }
              placeholder="Name or admission number"
            />
          </label>
          <button className="btn primary">Load score sheet</button>
        </fieldset>
      </form>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="alert success" role="status">
          {notice}
        </div>
      )}
      {locked && (
        <div className="alert info">
          This examination is {examStateLabels[exam.status].toLowerCase()}.
          Scores are locked until an administrator reopens it with a reason.
        </div>
      )}
      {!data ? (
        <div className="empty-state">
          <p>
            Choose a subject and class arm to load students and saved results.
          </p>
        </div>
      ) : !data.records.length ? (
        <div className="empty-state">
          <p>No active students or historical scores match this sheet.</p>
        </div>
      ) : (
        <>
          <div className="table-scroll">
            <table className="score-table">
              <thead>
                <tr>
                  <th>Student / admission</th>
                  {exam.components.map((component) => (
                    <th key={component.key}>
                      {component.name}
                      <span className="staff-secondary">
                        Max {component.maxMarks} · {component.weight}%
                      </span>
                    </th>
                  ))}
                  <th>Total / {exam.totalMarks}</th>
                  <th>Grade / state</th>
                  <th>Teacher comment</th>
                  <th>History</th>
                </tr>
              </thead>
              <tbody>
                {data.records.map((row) => (
                  <tr key={row.studentId}>
                    <td>
                      <strong>{row.studentName}</strong>
                      <span className="staff-secondary">
                        {row.admissionNumber}
                      </span>
                      {!row.editable && (
                        <span className="staff-secondary">Read-only</span>
                      )}
                    </td>
                    {exam.components.map((component) => (
                      <td key={component.key}>
                        <input
                          type="number"
                          min={0}
                          max={component.maxMarks}
                          step="0.01"
                          disabled={busy || locked || !row.editable}
                          aria-label={`${row.studentName} ${component.name}`}
                          value={base(row).scores[component.key]}
                          onChange={(event) =>
                            edit(row, component.key, event.target.value)
                          }
                        />
                      </td>
                    ))}
                    <td>
                      {row.result
                        ? markText(row.result.totalHundredths)
                        : "Not entered"}
                    </td>
                    <td>
                      {row.result ? (
                        <>
                          {row.result.grade}
                          <span className="staff-secondary">
                            {examStateLabels[row.result.status]}
                          </span>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      <input
                        maxLength={500}
                        aria-label={`Teacher comment for ${row.studentName}`}
                        disabled={busy || locked || !row.editable}
                        value={base(row).teacherComment}
                        onChange={(event) =>
                          edit(row, "teacherComment", event.target.value)
                        }
                      />
                    </td>
                    <td>
                      {row.result && (
                        <button
                          className="text-link action-link"
                          onClick={() => setHistory(row.result)}
                        >
                          View revisions
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
          {!locked && (
            <div className="attendance-save">
              <label>
                Correction reason (required for changes to saved
                scores/comments)
                <textarea
                  maxLength={300}
                  disabled={busy}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </label>
              <div className="button-row">
                <button
                  className="btn secondary"
                  disabled={busy || !!changedRows.length}
                  onClick={() => {
                    setConfirmError("");
                    setConfirmation({ type: "submit" });
                  }}
                >
                  Submit subject / arm
                </button>
                <button
                  className="btn primary"
                  disabled={busy || !changedRows.length}
                  onClick={requestSave}
                >
                  <Save size={17} />
                  Save {changedRows.length} changed students
                </button>
              </div>
              <p className="field-help">
                Submission requires scores for every active student in this
                subject and arm. Teachers cannot edit submitted scores until
                returned by an administrator.
              </p>
            </div>
          )}
        </>
      )}
      {confirmation && (
        <ConfirmationDialog
          title={
            confirmation.type === "discard"
              ? "Discard unsaved scores?"
              : confirmation.type === "submit"
                ? "Submit subject results?"
                : "Save scores?"
          }
          description={
            confirmation.type === "discard"
              ? "Changing the sheet or page will discard unsaved changes."
              : confirmation.type === "submit"
                ? "Submit the complete subject/arm for review? Teacher editing will be locked."
                : `Save ${changedRows.length} changed student results? Existing scores/comments will retain a new audited revision.`
          }
          busy={busy}
          error={confirmError}
          onClose={() => setConfirmation(null)}
          onConfirm={confirm}
        />
      )}
      {history && (
        <ResultHistory
          examinationId={exam._id}
          result={history}
          onClose={() => setHistory(null)}
        />
      )}
    </section>
  );
}
