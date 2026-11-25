import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { teacherApi } from "../lib/teacher";
import { errorMessage } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import Pagination from "../components/Pagination";
export default function TeacherWorkspace({ mode }) {
  const { user, changePassword } = useAuth();
  const { id } = useParams();
  const [params] = useSearchParams();
  const [context, setContext] = useState(null),
    [data, setData] = useState(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [search, setSearch] = useState(""),
    [classId, setClassId] = useState(params.get("classId") || ""),
    [arm, setArm] = useState(params.has("arm") ? params.get("arm") : "__all__"),
    [page, setPage] = useState(1);
  useEffect(() => {
    let live = true;
    const endpoint =
      mode === "overview"
        ? "dashboard"
        : mode === "student"
          ? `students/${id}`
          : ["profile", "settings"].includes(mode)
            ? "profile"
            : "students";
    Promise.all([
      teacherApi.get("context"),
      teacherApi.get(
        endpoint,
        endpoint === "students"
          ? {
              search,
              ...(classId ? { classId } : {}),
              ...(arm !== "__all__" ? { arm } : {}),
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
  }, [mode, id, search, classId, arm, page]);
  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      if (mode === "settings") {
        if (form.get("newPassword") !== form.get("confirmPassword"))
          throw new Error("Passwords do not match.");
        await changePassword({
          currentPassword: form.get("currentPassword"),
          newPassword: form.get("newPassword"),
        });
      } else await teacherApi.updatePhone(form.get("phone"));
      setMessage("Changes saved.");
    } catch (e) {
      setError(
        e.message === "Passwords do not match." ? e.message : errorMessage(e),
      );
    } finally {
      setBusy(false);
    }
  }
  const title = {
    overview: `Welcome, ${user.name}`,
    classes: "My Classes",
    subjects: "My Subjects",
    students: "My Students",
    student: "Student profile",
    profile: "My Profile",
    settings: "Settings",
  }[mode];
  return (
    <div className="teacher-workspace">
      <div className="page-heading">
        <div>
          <div className="eyebrow">TEACHER WORKSPACE</div>
          <h1>{title}</h1>
          {context && (
            <p>
              {context.school.name} -{" "}
              {context.sessions.find((s) => s.status === "active")?.name ||
                "No active session"}{" "}
              -{" "}
              {context.terms.find(
                (t) =>
                  t.status === "active" &&
                  t.sessionId ===
                    context.sessions.find((s) => s.status === "active")?._id,
              )?.name || "No active term"}
            </p>
          )}
          {context?.school.logo && (
            <img src={context.school.logo} alt="School logo" width="64" />
          )}
        </div>
      </div>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {message && <p role="status">{message}</p>}
      {!data || !context ? (
        <div role="status">
          <p>Loading teacher workspace...</p>
          <div className="stats-grid" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="teacher-skeleton" />
            ))}
          </div>
        </div>
      ) : (
        <>
          {mode === "overview" && (
            <>
              <div className="stats-grid">
                {Object.entries(data.stats).map(([label, value]) => (
                  <section className="stat-card" key={label}>
                    <h3>{label.replace(/([A-Z])/g, " $1")}</h3>
                    <strong>{value}</strong>
                  </section>
                ))}
              </div>
              <section className="panel">
                <h2>Attendance summary</h2>
                <p>
                  Recorded attendance across your permitted classes and arms.
                </p>
                {data.attendance.length ? (
                  data.attendance.map((r) => (
                    <p key={r._id}>
                      {r._id}: {r.count}
                    </p>
                  ))
                ) : (
                  <p>No attendance recorded.</p>
                )}
              </section>
              <section className="panel">
                <h2>Quick actions</h2>
                <p>
                  <Link to="/teacher/students">Find students</Link> -{" "}
                  <Link to="/teacher/attendance">Mark attendance</Link> -{" "}
                  <Link to="/teacher/examinations">Enter scores</Link>
                </p>
              </section>
              <section className="panel">
                <h2>Recent examination activity</h2>
                {data.recent.length ? (
                  data.recent.map((e) => (
                    <p key={e._id}>
                      <Link to={`/teacher/examinations/${e._id}`}>
                        {e.name}
                      </Link>{" "}
                      - {e.className} - {e.status} -{" "}
                      {new Date(e.updatedAt).toLocaleDateString()}
                    </p>
                  ))
                ) : (
                  <p>No relevant activity yet.</p>
                )}
              </section>
            </>
          )}
          {["classes", "overview"].includes(mode) && (
            <section className="panel">
              <h2>Assigned classes and arms</h2>
              {context.assignmentMode === "legacy" && (
                <p>
                  Legacy access is retained. Ask your school administrator to
                  review your academic periods and arms in Teacher Assignments.
                </p>
              )}
              {(context.groups || context.classes).length ? (
                (context.groups || context.classes).map((c) => {
                  const groupClassId = c.classId || c._id;
                  const subjects = context.subjects.filter((s) =>
                    c.subjectIds
                      ? c.subjectIds.includes(s._id)
                      : s.classId === groupClassId,
                  );
                  return (
                    <article key={c._id}>
                      <h3>
                        {c.name}
                        {c.arm !== undefined ? " / " + (c.arm || "No arm") : ""}
                      </h3>
                      <p>
                        {c.sessionId
                          ? context.sessions.find((s) => s._id === c.sessionId)
                              ?.name
                          : "Retained legacy assignment"}{" "}
                        - {c.studentCount} eligible active students
                      </p>
                      <p>Arms: {c.arms.join(", ") || "No arms"}</p>
                      <p>
                        Subjects:{" "}
                        {subjects.map((s) => s.name).join(", ") ||
                          "No subject teaching permission"}
                      </p>
                      {c.classTeacher && (
                        <p>
                          <strong>Lead class teacher</strong> - subject scoring
                          and attendance require separate permissions.
                        </p>
                      )}
                      <p>
                        <Link
                          to={
                            "/teacher/students?classId=" +
                            groupClassId +
                            (c.arm !== undefined
                              ? "&arm=" + encodeURIComponent(c.arm)
                              : "")
                          }
                        >
                          Student directory
                        </Link>
                        {subjects.length > 0 && (
                          <>
                            {" "}
                            -{" "}
                            <Link to="/teacher/examinations">Examinations</Link>
                          </>
                        )}
                        {(c.attendancePermission ||
                          (!context.groups &&
                            context.attendanceGrants.some(
                              (g) => g.classId === groupClassId,
                            ))) && (
                          <>
                            {" "}
                            - <Link to="/teacher/attendance">Attendance</Link>
                          </>
                        )}
                      </p>
                    </article>
                  );
                })
              ) : (
                <p>
                  No current assigned classes. Historical assignments do not
                  carry forward automatically.
                </p>
              )}
            </section>
          )}
          {mode === "subjects" && (
            <section className="panel">
              {context.subjects.length ? (
                context.subjects.map((s) => (
                  <article key={s._id}>
                    <h2>{s.name}</h2>
                    <p>
                      {context.classes.find((c) => c._id === s.classId)?.name} -{" "}
                      {s.status}
                    </p>
                    {s.groups && (
                      <p>
                        Assigned arms:{" "}
                        {s.groups
                          .map((g) => `${g.className} ${g.arm || "(no arm)"}`)
                          .join(", ")}
                      </p>
                    )}
                    <Link to="/teacher/examinations">
                      Examinations & Results
                    </Link>
                  </article>
                ))
              ) : (
                <p>No assigned subjects.</p>
              )}
            </section>
          )}
          {mode === "students" && (
            <section className="panel">
              <div className="teacher-filters">
                <label>
                  Search
                  <input
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                  />
                </label>
                <label>
                  Class
                  <select
                    value={classId}
                    onChange={(e) => {
                      setClassId(e.target.value);
                      setArm("__all__");
                      setPage(1);
                    }}
                  >
                    <option value="">All assigned classes</option>
                    {context.classes.map((c) => (
                      <option key={c._id} value={c._id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Class arm
                  <select
                    value={arm}
                    onChange={(e) => {
                      setArm(e.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="__all__">All authorised arms</option>
                    {[
                      ...new Set(
                        context.classes
                          .filter((c) => !classId || c._id === classId)
                          .flatMap((c) => (c.arms.length ? c.arms : [""])),
                      ),
                    ].map((a) => (
                      <option key={a} value={a}>
                        {a || "Class without arms"}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Admission number</th>
                      <th>Class / arm</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.records.map((s) => (
                      <tr key={s._id}>
                        <td>
                          <Link to={`/teacher/students/${s._id}`}>
                            {[s.firstName, s.middleName, s.lastName]
                              .filter(Boolean)
                              .join(" ")}
                          </Link>
                        </td>
                        <td>{s.admissionNumber}</td>
                        <td>
                          {
                            context.classes.find((c) => c._id === s.classId)
                              ?.name
                          }{" "}
                          {s.arm}
                        </td>
                        <td>{s.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!data.total ? (
                <p>No students found.</p>
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
          {["profile", "student"].includes(mode) && (
            <section className="panel">
              <dl>
                {Object.entries(data.record)
                  .filter(([k]) => !["_id", "classId", "sessionId"].includes(k))
                  .map(([k, v]) => (
                    <div key={k}>
                      <dt>{k.replace(/([A-Z])/g, " $1")}</dt>
                      <dd>{v || " - "}</dd>
                    </div>
                  ))}
              </dl>
              {mode === "student" && (
                <p>
                  {
                    context.classes.find((c) => c._id === data.record.classId)
                      ?.name
                  }
                </p>
              )}
              {mode === "profile" && (
                <>
                  <h2>Assignments</h2>
                  <p>
                    {context.classes.map((c) => c.name).join(", ") ||
                      "No classes"}
                  </p>
                  <p>
                    {context.subjects.map((s) => s.name).join(", ") ||
                      "No subjects"}
                  </p>
                  <form onSubmit={save}>
                    <label>
                      Phone
                      <input
                        name="phone"
                        defaultValue={data.record.phone}
                        required
                        minLength={7}
                        maxLength={30}
                      />
                    </label>
                    <p>
                      Email changes are managed by your school administrator.
                    </p>
                    <button className="btn primary" disabled={busy}>
                      Save contact information
                    </button>
                  </form>
                </>
              )}
            </section>
          )}
          {mode === "settings" && (
            <section className="panel">
              <h2>Change password</h2>
              <form onSubmit={save}>
                {[
                  ["currentPassword", "Current password"],
                  ["newPassword", "New password"],
                  ["confirmPassword", "Confirm new password"],
                ].map(([name, label]) => (
                  <label key={name}>
                    {label}
                    <input
                      name={name}
                      type="password"
                      autoComplete={
                        name === "currentPassword"
                          ? "current-password"
                          : "new-password"
                      }
                      minLength={name === "currentPassword" ? 1 : 12}
                      maxLength={72}
                      required
                    />
                  </label>
                ))}
                <button className="btn primary" disabled={busy}>
                  Change password
                </button>
              </form>
            </section>
          )}
        </>
      )}
    </div>
  );
}
