import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { configurationError } from "../lib/academicConfiguration";
import { markText, examStateLabels } from "../lib/examinations";
import { useAuth } from "../context/AuthContext";
import useExamContext from "../hooks/useExamContext";
import ExaminationForm from "../components/ExaminationForm";
import ScoreEntry from "../components/ScoreEntry";
import Modal from "../components/Modal";
import Pagination from "../components/Pagination";
export default function ExaminationWorkspace() {
  const { id } = useParams(),
    { user } = useAuth(),
    navigate = useNavigate();
  const administrator = user.role === "school_admin";
  const { context, error: contextError, reload } = useExamContext();
  const [exam, setExam] = useState(null),
    [summary, setSummary] = useState(null),
    [page, setPage] = useState(1),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [editing, setEditing] = useState(false),
    [action, setAction] = useState(null),
    [text, setText] = useState(""),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [formError, setFormError] = useState("");
  const [scoreDirty, setScoreDirty] = useState(false);
  const load = useCallback(async () => {
    setError("");
    try {
      const [record, summary] = await Promise.all([
        api.get(`/school/examinations/${id}`),
        administrator
          ? api.get(`/school/examinations/${id}/summary`, {
              params: { page, limit: 25 },
            })
          : null,
      ]);
      setExam(record.data.record);
      setSummary(summary?.data || null);
    } catch (e) {
      setError(configurationError(e));
    }
  }, [id, administrator, page]);
  useEffect(() => {
    load();
  }, [load]);
  function open(value) {
    setFormError("");
    setReason("");
    setText(
      value.kind === "clone"
        ? `${exam.name} (new)`
        : value.row?.administratorComment || "",
    );
    setAction(value);
  }
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setFormError("");
    try {
      if (action.kind === "clone") {
        const { data } = await api.post(`/school/examinations/${id}/clone`, {
          name: text,
        });
        setAction(null);
        navigate(`/school/examinations/${data.record._id}`);
        return;
      }
      if (action.kind === "comment")
        await api.put(
          `/school/examinations/${id}/comments/${action.row.studentId}`,
          { comment: text, reason },
        );
      else
        await api.post(`/school/examinations/${id}/state`, {
          state: action.state,
          revision: exam.revision,
          reason,
        });
      setAction(null);
      setNotice("Examination changes saved with audit history.");
      await load();
    } catch (e) {
      setFormError(configurationError(e));
    } finally {
      setBusy(false);
    }
  }
  const next =
    exam &&
    { draft: "submitted", submitted: "approved", approved: "published" }[
      exam.status
    ];
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">EXAMINATION WORKSPACE</div>
          <h1>{exam?.name || "Examination"}</h1>
          <p>
            <Link
              className="text-link"
              to={administrator ? "/school/examinations" : "/teacher"}
            >
              Return to examination list
            </Link>
          </p>
        </div>
        {administrator && exam && (
          <div className="button-row">
            <button
              className="btn secondary"
              disabled={!context || scoreDirty}
              onClick={() => setEditing(true)}
            >
              Edit configuration
            </button>
            <button
              className="btn secondary"
              onClick={() => open({ kind: "clone" })}
              disabled={scoreDirty}
            >
              Duplicate configuration
            </button>
          </div>
        )}
      </div>
      {error && (
        <div className="alert error" role="alert">
          {error}
          <button onClick={load}>Retry</button>
        </div>
      )}
      {contextError && (
        <div className="alert error" role="alert">
          {contextError}
          <button onClick={reload}>Reload references</button>
        </div>
      )}
      {notice && (
        <div className="alert success" role="status">
          {notice}
        </div>
      )}
      {!exam
        ? !error && <div className="loading-state">Loading examination…</div>
        : !error && (
            <>
              <section className="network-banner">
                <div>
                  <h2>
                    {exam.sessionName} · {exam.termName} · {exam.className}
                  </h2>
                  <p>
                    {examStateLabels[exam.status]} · {exam.totalMarks} final
                    marks · Configuration v{exam.configRevision} ·{" "}
                    {exam.subjects.length}{" "}
                    {administrator ? "configured" : "assigned"} subjects
                  </p>
                </div>
                {administrator && (
                  <div className="button-row">
                    {next && (
                      <button
                        className="btn primary"
                        onClick={() => open({ kind: "state", state: next })}
                        disabled={scoreDirty}
                      >
                        {next === "submitted"
                          ? "Submit examination"
                          : next === "approved"
                            ? "Approve results"
                            : "Publish report cards"}
                      </button>
                    )}
                    <button
                      className="btn secondary"
                      onClick={() => open({ kind: "state", state: "draft" })}
                      disabled={scoreDirty}
                    >
                      Reopen / return to draft
                    </button>
                  </div>
                )}
              </section>
              {context && (
                <ScoreEntry
                  key={`${exam._id}-${exam.status}`}
                  exam={exam}
                  context={context}
                  onChanged={load}
                  onDirtyChange={setScoreDirty}
                />
              )}
              {administrator && summary && (
                <>
                  <section className="panel finance-section">
                    <div className="panel-heading">
                      <div>
                        <h2>Complete-student result summaries</h2>
                        <p>
                          Only students with every configured subject are
                          ranked. Whole-class submission requires every active
                          or previously scored student to be complete.
                        </p>
                      </div>
                    </div>
                    {!summary.students.length ? (
                      <div className="empty-state">
                        <p>
                          No complete results yet. Enter all configured subjects
                          for each student.
                        </p>
                      </div>
                    ) : (
                      <>
                        <div className="table-scroll">
                          <table>
                            <thead>
                              <tr>
                                <th>Student / arm</th>
                                <th>Overall average</th>
                                <th>Class position</th>
                                <th>Comments / report card</th>
                              </tr>
                            </thead>
                            <tbody>
                              {summary.students.map((row) => (
                                <tr key={row.studentId}>
                                  <td>
                                    <strong>{row.studentName}</strong>
                                    <span className="staff-secondary">
                                      {row.admissionNumber}
                                      {row.arm ? ` / ${row.arm}` : ""}
                                    </span>
                                  </td>
                                  <td>{markText(row.averageHundredths)}%</td>
                                  <td>{row.position ?? "Not enabled"}</td>
                                  <td>
                                    <div className="table-actions">
                                      {["draft", "submitted"].includes(
                                        exam.status,
                                      ) && (
                                        <button
                                          className="text-link action-link"
                                          onClick={() =>
                                            open({ kind: "comment", row })
                                          }
                                        >
                                          Administrator comment
                                        </button>
                                      )}
                                      {exam.publicationNumber > 0 && (
                                        <Link
                                          className="text-link"
                                          to={`/school/examinations/${id}/report-cards/${row.studentId}`}
                                        >
                                          Published report card
                                        </Link>
                                      )}
                                    </div>
                                    {row.administratorComment && (
                                      <span className="staff-secondary">
                                        {row.administratorComment}
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <Pagination
                          page={page}
                          total={summary.total}
                          limit={25}
                          onPage={setPage}
                        />
                      </>
                    )}
                  </section>
                  <section className="panel finance-section">
                    <div className="panel-heading">
                      <h2>Subject averages</h2>
                    </div>
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Subject</th>
                            <th>Marked students</th>
                            <th>Average total / {exam.totalMarks}</th>
                            <th>Average %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {summary.subjects.map((row) => (
                            <tr key={row.subjectId}>
                              <td>{row.name}</td>
                              <td>{row.count}</td>
                              <td>{markText(row.averageTotalHundredths)}</td>
                              <td>{markText(row.averageHundredths)}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                </>
              )}
            </>
          )}
      {editing && context && exam && (
        <ExaminationForm
          record={exam}
          context={context}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            setNotice("Configuration saved.");
            load();
          }}
        />
      )}
      {action && exam && (
        <Modal
          title={
            action.kind === "clone"
              ? "Duplicate examination configuration"
              : action.kind === "comment"
                ? "Administrator comment"
                : action.state === "draft"
                  ? "Reopen results with a reason"
                  : `Confirm ${examStateLabels[action.state].toLowerCase()} state`
          }
          onClose={() => {
            if (!busy) setAction(null);
          }}
        >
          <form className="modal-body" onSubmit={submit}>
            {action.kind === "clone" ? (
              <>
                <label htmlFor="exam-clone-name">New examination name</label>
                <input
                  id="exam-clone-name"
                  required
                  minLength={2}
                  maxLength={120}
                  disabled={busy}
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                />
              </>
            ) : (
              <>
                <p className="muted form-description">
                  {action.kind === "comment"
                    ? `Comment for ${action.row.studentName}. It will be included when report cards are published.`
                    : action.state === "draft"
                      ? "Existing report-card publications and result revisions are retained. All current scores return to draft for authorised corrections."
                      : action.state === "published"
                        ? "Publish the complete approved class cohort? Report cards, attendance summaries, comments and tied positions will be saved as a retained publication."
                        : "Confirm the next review stage for the complete examination. Submitted/approved scores are locked until reopened."}
                </p>
                {action.kind === "comment" && (
                  <>
                    <label htmlFor="exam-admin-comment">
                      Administrator comment
                    </label>
                    <textarea
                      className="finance-textarea"
                      id="exam-admin-comment"
                      maxLength={1000}
                      disabled={busy}
                      value={text}
                      onChange={(event) => setText(event.target.value)}
                    />
                  </>
                )}
                <label htmlFor="exam-action-reason">
                  Reason{" "}
                  {action.kind === "comment" || action.state === "draft"
                    ? "(required)"
                    : "(optional)"}
                </label>
                <textarea
                  className="finance-textarea"
                  id="exam-action-reason"
                  required={
                    action.kind === "comment" || action.state === "draft"
                  }
                  minLength={
                    action.kind === "comment" || action.state === "draft"
                      ? 3
                      : undefined
                  }
                  maxLength={300}
                  disabled={busy}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </>
            )}
            {formError && (
              <div className="alert error" role="alert">
                {formError}
              </div>
            )}
            <div className="button-row">
              <button
                type="button"
                className="btn secondary"
                disabled={busy}
                onClick={() => setAction(null)}
              >
                Cancel
              </button>
              <button className="btn primary" disabled={busy}>
                {busy ? "Saving…" : "Confirm"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
