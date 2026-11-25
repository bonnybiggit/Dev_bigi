import { useEffect, useState } from "react";
import { teacherApi } from "../lib/teacher";
import { errorMessage } from "../lib/api";
import Pagination from "../components/Pagination";
export default function TeacherAttendance() {
  const [context, setContext] = useState(null),
    [grant, setGrant] = useState(""),
    [sessionId, setSessionId] = useState(""),
    [date, setDate] = useState(
      new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(
        new Date(),
      ),
    ),
    [page, setPage] = useState(1),
    [data, setData] = useState(null),
    [marks, setMarks] = useState({}),
    [reason, setReason] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0),
    [history, setHistory] = useState(null);
  useEffect(() => {
    teacherApi
      .get("context")
      .then((c) => {
        setContext(c);
        setSessionId(c.sessions.find((s) => s.status === "active")?._id || "");
      })
      .catch((e) => setError(errorMessage(e)));
  }, []);
  useEffect(() => {
    setData(null);
    setMarks({});
    setHistory(null);
    if (!context || grant === "" || !sessionId || !date) return;
    let live = true;
    teacherApi
      .get("attendance/student/roster", {
        classId: context.attendanceGrants[Number(grant)].classId,
        arm: context.attendanceGrants[Number(grant)].arm,
        sessionId,
        date,
        page,
        limit: 25,
      })
      .then((d) => {
        if (live) {
          setData(d);
          setError("");
        }
      })
      .catch((e) => {
        if (live) setError(errorMessage(e));
      });
    return () => {
      live = false;
    };
  }, [context, grant, sessionId, date, page, revision]);
  async function save() {
    setBusy(true);
    setError("");
    try {
      const placement = context.attendanceGrants[Number(grant)];
      await teacherApi.mark({
        classId: placement.classId,
        arm: placement.arm,
        sessionId,
        date,
        correctionReason: reason,
        entries: data.records
          .filter((r) => marks[r.personId])
          .map((r) => ({
            personId: r.personId,
            status: marks[r.personId],
            revision: r.attendance?.revision || 0,
          })),
      });
      setReason("");
      setRevision((v) => v + 1);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="teacher-workspace">
      <div className="page-heading">
        <div>
          <h1>Attendance</h1>
          <p>Only explicitly authorised classes and arms are available.</p>
        </div>
      </div>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {!context ? (
        <p role="status">Loading permissions - </p>
      ) : !context.attendanceGrants.length ? (
        <section className="panel">
          <p>
            No attendance permissions. Ask your school administrator to
            authorise a class and arm.
          </p>
        </section>
      ) : (
        <section className="panel">
          <div className="teacher-filters">
            <label>
              Class and arm
              <select
                value={grant}
                onChange={(e) => {
                  setGrant(e.target.value);
                  const selected =
                    context.attendanceGrants[Number(e.target.value)];
                  if (selected?.sessionId) setSessionId(selected.sessionId);
                  setPage(1);
                }}
              >
                <option value="">Select placement</option>
                {context.attendanceGrants.map((g, i) => (
                  <option key={i} value={i}>
                    {
                      (context.attendanceClasses || context.classes).find(
                        (c) => c._id === g.classId,
                      )?.name
                    }{" "}
                    {g.arm}{" "}
                    {g.sessionId
                      ? " / " +
                        context.sessions.find((s) => s._id === g.sessionId)
                          ?.name
                      : ""}{" "}
                    {g.termId
                      ? " / " +
                        context.terms.find((t) => t._id === g.termId)?.name
                      : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Session
              <select
                disabled={Boolean(
                  context.attendanceGrants[Number(grant)]?.sessionId,
                )}
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
              >
                <option value="">Choose session</option>
                {context.sessions.map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Date
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
          </div>
          {grant !== "" && !data && <p role="status">Loading roster - </p>}
          {data && (
            <>
              <p>
                Expected: {data.summary.expected} - Recorded:{" "}
                {data.summary.totalRecorded} - Present: {data.summary.present} -
                Absent: {data.summary.absent} - Late: {data.summary.late} -
                Excused: {data.summary.excused}
              </p>
              <label>
                Bulk mark this page
                <select
                  defaultValue=""
                  onChange={(e) => {
                    const status = e.target.value;
                    if (status)
                      setMarks(
                        Object.fromEntries(
                          data.records
                            .filter((r) => r.markable)
                            .map((r) => [r.personId, status]),
                        ),
                      );
                  }}
                >
                  <option value="">Select status</option>
                  {["present", "absent", "late", "excused"].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Admission number</th>
                      <th>Status</th>
                      <th>History</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.records.map((r) => (
                      <tr key={r.personId}>
                        <td>{r.personName}</td>
                        <td>{r.identifier}</td>
                        <td>
                          <select
                            aria-label={`Attendance for ${r.personName}`}
                            disabled={!r.markable || busy}
                            value={
                              marks[r.personId] || r.attendance?.status || ""
                            }
                            onChange={(e) =>
                              setMarks((v) => ({
                                ...v,
                                [r.personId]: e.target.value,
                              }))
                            }
                          >
                            <option value="">Unmarked</option>
                            {["present", "absent", "late", "excused"].map(
                              (s) => (
                                <option key={s}>{s}</option>
                              ),
                            )}
                          </select>
                        </td>
                        <td>
                          {r.attendance && (
                            <button
                              className="btn secondary"
                              onClick={async () => {
                                try {
                                  setHistory(
                                    await teacherApi.get(
                                      `attendance/records/${r.attendance._id}/audit`,
                                    ),
                                  );
                                } catch (e) {
                                  setError(errorMessage(e));
                                }
                              }}
                            >
                              Revision history
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!data.total ? (
                <p>No eligible students.</p>
              ) : (
                <Pagination
                  page={page}
                  total={data.total}
                  limit={25}
                  onPage={setPage}
                />
              )}
              <label>
                Correction reason (required when changing recorded attendance)
                <input
                  value={reason}
                  maxLength={300}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <button
                className="btn primary"
                disabled={busy || !Object.keys(marks).length}
                onClick={save}
              >
                {busy ? "Saving - " : "Save attendance"}
              </button>
            </>
          )}
          {history && (
            <section>
              <h2>Attendance revision history</h2>
              {history.records.map((r) => (
                <p key={r._id}>
                  Revision {r.revision} -{" "}
                  {r.reason ||
                    r.correctionReason ||
                    r.event ||
                    "Attendance recorded"}{" "}
                  - {new Date(r.createdAt).toLocaleString()}
                </p>
              ))}
            </section>
          )}
        </section>
      )}
    </div>
  );
}
