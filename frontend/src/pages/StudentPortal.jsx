import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { studentPortalApi } from "../lib/studentPortal";
import { errorMessage } from "../lib/api";
import { money } from "../lib/finance";
import { markText } from "../lib/examinations";
import { useAuth } from "../context/AuthContext";
import Pagination from "../components/Pagination";
import SchoolIdentity from "../components/SchoolIdentity";
export default function StudentPortal({ mode }) {
  const { id } = useParams();
  const { user, changePassword } = useAuth();
  const [context, setContext] = useState(null),
    [data, setData] = useState(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [sessionId, setSessionId] = useState(""),
    [termId, setTermId] = useState(""),
    [page, setPage] = useState(1);
  useEffect(() => {
    let live = true;
    setData(null);
    setError("");
    const endpoint = ["profile", "settings"].includes(mode)
      ? "context"
      : ["results", "report-cards"].includes(mode)
        ? "report-cards"
        : mode === "receipt"
          ? `fees/receipts/${id}`
          : mode;
    Promise.all([
      studentPortalApi.get("context"),
      studentPortalApi.get(
        endpoint,
        ["attendance", "report-cards", "fees"].includes(endpoint)
          ? {
              ...(sessionId ? { sessionId } : {}),
              ...(termId ? { termId } : {}),
              page,
              limit: 25,
            }
          : {},
      ),
    ])
      .then(([c, d]) => {
        if (live) {
          setContext(c);
          setData(d);
        }
      })
      .catch((e) => {
        if (live) setError(errorMessage(e));
      });
    return () => {
      live = false;
    };
  }, [mode, id, sessionId, termId, page, revision]);
  async function password(e) {
    e.preventDefault();
    const formElement = e.currentTarget;
    const form = new FormData(formElement);
    setError("");
    setNotice("");
    if (form.get("newPassword") !== form.get("confirmPassword"))
      return setError("New passwords do not match.");
    setBusy(true);
    try {
      await changePassword({
        currentPassword: form.get("currentPassword"),
        newPassword: form.get("newPassword"),
      });
      formElement.reset();
      setNotice("Password changed.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const titles = {
    dashboard: "My overview",
    profile: "My Profile",
    subjects: "My Subjects",
    attendance: "My Attendance",
    results: "Examinations & Results",
    "report-cards": "Report Cards",
    fees: "School Fees",
    settings: "Settings",
    receipt: "Payment receipt",
  };
  const student = context?.student;
  const name = student
    ? [student.firstName, student.middleName, student.lastName]
        .filter(Boolean)
        .join(" ")
    : user.name;
  const summary = data?.summary || data?.attendance;
  return (
    <div className="teacher-workspace">
      <div className="page-heading no-print">
        <div>
          <div className="eyebrow">STUDENT PORTAL</div>
          <h1>{mode === "dashboard" ? `Welcome, ${name}` : titles[mode]}</h1>
          {context && (
            <p>
              {context.school.name} -{" "}
              {context.schoolClass?.name || "No current class"} {student.arm} -{" "}
              {student.admissionNumber}
            </p>
          )}
        </div>
        {context?.school && (
          <div className="no-print">
            <SchoolIdentity school={context.school} />
          </div>
        )}
      </div>
      {notice && <p role="status">{notice}</p>}
      {error && (
        <div className="alert error" role="alert">
          {error}
          {(!data || !context) && (
            <button
              className="btn secondary"
              onClick={() => setRevision((v) => v + 1)}
            >
              Try again
            </button>
          )}
        </div>
      )}
      {!data || !context ? (
        !error && <p role="status">Loading your portal...</p>
      ) : (
        <>
          {mode === "dashboard" && (
            <>
              <p>
                Session:{" "}
                {context.sessions.find((s) => s._id === student.sessionId)
                  ?.name || "Not assigned"}{" "}
                - Term:{" "}
                {context.terms.find(
                  (t) =>
                    t.sessionId === student.sessionId && t.status === "active",
                )?.name || "No active term"}
              </p>
              <div className="stats-grid">
                <section className="stat-card">
                  <h3>Subjects</h3>
                  <strong>{data.subjects}</strong>
                </section>
                <section className="stat-card">
                  <h3>Attendance</h3>
                  <strong>
                    {data.attendance.attendancePercentage === null
                      ? "No records"
                      : `${data.attendance.attendancePercentage}%`}
                  </strong>
                </section>
                <section className="stat-card">
                  <h3>Published results</h3>
                  <strong>{data.publishedResults}</strong>
                </section>
                {data.fees && (
                  <section className="stat-card">
                    <h3>Fee balance</h3>
                    <strong>{money(data.fees.balanceMinor)}</strong>
                  </section>
                )}
              </div>
              <section className="panel">
                <h2>Quick links</h2>
                <p>
                  <Link to="/student/results">My results</Link> -{" "}
                  <Link to="/student/attendance">My attendance</Link> -{" "}
                  <Link to="/student/report-cards">My report cards</Link>
                </p>
                <h2>Recent published academic activity</h2>
                {data.recent.length ? (
                  data.recent.map((c) => (
                    <p key={c._id}>
                      <Link to={`/student/report-cards/${c._id}`}>
                        {c.name}
                      </Link>{" "}
                      - {c.grade} - {markText(c.averageHundredths)}% -{" "}
                      {new Date(c.createdAt).toLocaleDateString()}
                    </p>
                  ))
                ) : (
                  <p>No published results yet.</p>
                )}
              </section>
            </>
          )}
          {mode === "profile" && (
            <section className="panel">
              <dl>
                {Object.entries({
                  "Full name": name,
                  "Admission number": student.admissionNumber,
                  School: context.school.name,
                  Class: context.schoolClass?.name,
                  Arm: student.arm || "No arm",
                  Session: context.sessions.find(
                    (s) => s._id === student.sessionId,
                  )?.name,
                  "Admission date": student.admissionDate?.slice(0, 10),
                  "Academic status": student.status,
                }).map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value || "Not available"}</dd>
                  </div>
                ))}
              </dl>
              <p>
                Ask your school administrator if an official record needs
                correcting.
              </p>
            </section>
          )}
          {mode === "subjects" && (
            <section className="panel">
              {data.records.length ? (
                data.records.map((s) => (
                  <article key={s._id}>
                    <h2>
                      {s.name} {s.code && `(${s.code})`}
                    </h2>
                    <p>{s.description || "No description available."}</p>
                    <p>Teachers: {s.teachers.join(", ") || "Not assigned"}</p>
                  </article>
                ))
              ) : (
                <p>No active subjects available for your current enrolment.</p>
              )}
            </section>
          )}
          {["attendance", "results", "report-cards", "fees"].includes(mode) && (
            <section className="panel">
              <div className="teacher-filters">
                <label>
                  Academic session
                  <select
                    value={sessionId}
                    onChange={(e) => {
                      setSessionId(e.target.value);
                      setTermId("");
                      setPage(1);
                    }}
                  >
                    <option value="">All sessions</option>
                    {context.sessions.map((s) => (
                      <option key={s._id} value={s._id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Term
                  <select
                    value={termId}
                    onChange={(e) => {
                      setTermId(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="">All terms</option>
                    {context.terms
                      .filter((t) => !sessionId || t.sessionId === sessionId)
                      .map((t) => (
                        <option key={t._id} value={t._id}>
                          {
                            context.sessions.find((s) => s._id === t.sessionId)
                              ?.name
                          }{" "}
                          - {t.name}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
              {mode === "attendance" && (
                <>
                  <h2>Recorded days</h2>
                  <p>
                    {["present", "absent", "late", "excused"]
                      .map((k) => `${k}: ${summary[k]}`)
                      .join(" - ")}
                  </p>
                  <p>
                    Total recorded: {summary.totalRecorded} - Attendance:{" "}
                    {summary.attendancePercentage === null
                      ? "No records"
                      : `${summary.attendancePercentage}%`}
                  </p>
                  <p>
                    Missing records are not absences. Excused days are excluded
                    from the percentage.
                  </p>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.records.map((r) => (
                          <tr key={r._id}>
                            <td>{r.date.slice(0, 10)}</td>
                            <td>{r.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <h2>Monthly summaries</h2>
                  {data.monthly.map((m) => (
                    <p key={m.month}>
                      {m.month}: {m.totalRecorded} recorded - Present{" "}
                      {m.present}, absent {m.absent}, late {m.late}, excused{" "}
                      {m.excused} -{" "}
                      {m.attendancePercentage === null
                        ? "No percentage"
                        : `${m.attendancePercentage}%`}
                    </p>
                  ))}
                </>
              )}
              {["results", "report-cards"].includes(mode) &&
                data.records.map((c) => (
                  <article key={c._id}>
                    <h2>{c.examinationName}</h2>
                    <p>
                      {c.sessionName} - {c.termName} - {c.grade} -{" "}
                      {markText(c.averageHundredths)}%
                    </p>
                    <Link to={`/student/report-cards/${c._id}`}>
                      View scores and printable report card
                    </Link>
                  </article>
                ))}
              {mode === "fees" && (
                <>
                  <p>
                    Billed: {money(summary.billedMinor)} - Paid:{" "}
                    {money(summary.paidMinor)} - Outstanding:{" "}
                    {money(summary.balanceMinor)}
                  </p>
                  {data.records.map((i) => (
                    <article key={i._id}>
                      <h2>{i.reference}</h2>
                      <p>
                        {i.sessionName} - {i.termName} - {i.status}
                      </p>
                      <p>
                        Billed {money(i.billedMinor)} - Discount{" "}
                        {money(i.discountMinor)} - Adjustment{" "}
                        {money(i.adjustmentMinor)} - Paid {money(i.paidMinor)} -
                        Balance {money(i.balanceMinor)}
                      </p>
                    </article>
                  ))}
                  <h2>Payment history</h2>
                  {data.payments.length ? (
                    data.payments.map((p) => (
                      <p key={p._id}>
                        {p.reference} - {money(p.amountMinor)} -{" "}
                        {p.paidOn.slice(0, 10)} - {p.status}{" "}
                        {p.status === "posted" && (
                          <Link to={`/student/fees/receipts/${p._id}`}>
                            Print receipt
                          </Link>
                        )}
                      </p>
                    ))
                  ) : (
                    <p>No payments recorded.</p>
                  )}
                </>
              )}
              {!data.total ? (
                <p>No records available.</p>
              ) : (
                <Pagination
                  page={page}
                  total={data.total}
                  limit={25}
                  onPage={setPage}
                />
              )}
            </section>
          )}
          {mode === "receipt" && (
            <>
              <button
                className="btn primary no-print"
                onClick={() => window.print()}
              >
                Print receipt / Save PDF
              </button>
              <article className="payment-receipt">
                <header>
                  <SchoolIdentity school={data.school} />
                  <h3>Payment receipt</h3>
                </header>
                {Object.entries({
                  Receipt: data.payment.reference,
                  Student: data.payment.studentName,
                  Admission: data.payment.admissionNumber,
                  Invoice: data.payment.invoiceReference,
                  Amount: money(data.payment.amountMinor),
                  Date: data.payment.paidOn.slice(0, 10),
                  Method: data.payment.methodName,
                  Status: data.payment.status,
                }).map(([label, value]) => (
                  <p key={label}>
                    <strong>{label}:</strong> {value}
                  </p>
                ))}
              </article>
            </>
          )}
          {mode === "settings" && (
            <section className="panel">
              <h2>My account</h2>
              <p>School ID: {user.schoolId}</p>
              <p>Admission number: {student.admissionNumber}</p>
              <p>Account active</p>
              <h2>Change password</h2>
              <form onSubmit={password}>
                {[
                  ["currentPassword", "Current password"],
                  ["newPassword", "New password"],
                  ["confirmPassword", "Confirm new password"],
                ].map(([key, label]) => (
                  <label key={key}>
                    {label}
                    <input
                      name={key}
                      type="password"
                      required
                      autoComplete={
                        key === "currentPassword"
                          ? "current-password"
                          : "new-password"
                      }
                      minLength={key === "currentPassword" ? 1 : 12}
                      maxLength={72}
                    />
                  </label>
                ))}
                <button className="btn primary" disabled={busy}>
                  {busy ? "Saving..." : "Change password"}
                </button>
              </form>
            </section>
          )}
        </>
      )}
    </div>
  );
}
