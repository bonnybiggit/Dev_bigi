import { useEffect, useState } from "react";
import { assignmentApi } from "../lib/teacherAssignments";
import { errorMessage } from "../lib/api";
import EntityPicker from "../components/EntityPicker";
import Pagination from "../components/Pagination";
import Modal from "../components/Modal";
const empty = {
  sessionId: "",
  termId: "",
  classId: "",
  arm: "",
  kind: "teaching",
  subjectIds: [],
  status: "active",
  adoptLegacy: false,
  reason: "",
};
const initialFilters = {
  search: "",
  classId: "",
  subjectId: "",
  sessionId: "",
  termId: "",
  status: "",
};
export default function TeacherAssignments() {
  const [context, setContext] = useState(null),
    [data, setData] = useState(null),
    [legacy, setLegacy] = useState(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0);
  const [teacher, setTeacher] = useState(null),
    [form, setForm] = useState(empty),
    [editing, setEditing] = useState(null),
    [filters, setFilters] = useState(initialFilters),
    [onlyTeacher, setOnlyTeacher] = useState(false),
    [page, setPage] = useState(1),
    [legacyPage, setLegacyPage] = useState(1),
    [selected, setSelected] = useState([]);
  const [confirmation, setConfirmation] = useState(null),
    [dialogError, setDialogError] = useState(""),
    [history, setHistory] = useState(null),
    [transfer, setTransfer] = useState(null),
    [target, setTarget] = useState(null),
    [transferReason, setTransferReason] = useState(""),
    [adoptTarget, setAdoptTarget] = useState(false);
  const [targetPeriod, setTargetPeriod] = useState({
    sessionId: "",
    termId: "",
    reason: "",
  });
  useEffect(() => {
    let live = true;
    assignmentApi
      .get("/context")
      .then((c) => {
        if (live) {
          setContext(c);
          setForm((old) => ({
            ...old,
            sessionId:
              old.sessionId ||
              c.sessions.find((s) => s.status === "active")?._id ||
              "",
          }));
        }
      })
      .catch((e) => {
        if (live) setError(errorMessage(e));
      });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    let live = true;
    setData(null);
    const params = Object.fromEntries(
      Object.entries({
        ...filters,
        ...(onlyTeacher && teacher ? { staffId: teacher._id } : {}),
        page,
        limit: 25,
      }).filter(([, v]) => v !== ""),
    );
    assignmentApi
      .get("", params)
      .then((d) => {
        if (live) setData(d);
      })
      .catch((e) => {
        if (live) setError(errorMessage(e));
      });
    return () => {
      live = false;
    };
  }, [filters, onlyTeacher, teacher, page, revision]);
  useEffect(() => {
    let live = true;
    assignmentApi
      .get("/legacy-review", { page: legacyPage, limit: 25 })
      .then((d) => {
        if (live) setLegacy(d);
      })
      .catch((e) => {
        if (live) setError(errorMessage(e));
      });
    return () => {
      live = false;
    };
  }, [legacyPage, revision]);
  const name = (kind, id) =>
    context?.[kind]?.find((x) => x._id === id)?.name || "Unavailable";
  function change(e) {
    const { name, value } = e.target;
    setForm((old) => ({
      ...old,
      [name]: value,
      ...(name === "sessionId" ? { termId: "" } : {}),
      ...(name === "classId" ? { arm: "", subjectIds: [] } : {}),
      ...(name === "kind" ? { subjectIds: [] } : {}),
    }));
  }
  function prepareSave(e) {
    e.preventDefault();
    setError("");
    if (
      !teacher ||
      teacher.status !== "active" ||
      teacher.category === "non_teaching"
    )
      return setError("Choose an active teaching staff record.");
    if (form.kind === "teaching" && !form.subjectIds.length)
      return setError("Choose at least one subject.");
    if (editing && form.subjectIds.length > 1)
      return setError(
        "Edit one existing subject assignment at a time. Create a separate batch for more subjects.",
      );
    if (teacher.assignmentMode !== "explicit" && !form.adoptLegacy)
      return setError(
        "Review and confirm the switch from legacy arrays to explicit assignment access.",
      );
    setDialogError("");
    setConfirmation({
      type: "save",
      input: {
        ...form,
        staffId: teacher._id,
        ...(editing ? { revision: editing.revision } : {}),
      },
      id: editing?._id,
    });
  }
  function ask(action) {
    setDialogError("");
    setConfirmation(action);
  }
  async function perform() {
    setBusy(true);
    setDialogError("");
    setError("");
    setNotice("");
    try {
      const c = confirmation;
      if (c.type === "save") {
        if (c.id) await assignmentApi.edit(c.id, c.input);
        else await assignmentApi.create(c.input);
        setEditing(null);
        setForm((old) => ({ ...empty, sessionId: old.sessionId }));
        setTeacher((old) => ({ ...old, assignmentMode: "explicit" }));
      } else if (c.type === "deactivate")
        await assignmentApi.action(`/${c.record._id}/deactivate`, {
          revision: c.record.revision,
          reason: c.reason,
        });
      else if (c.type === "transfer")
        await assignmentApi.action(`/${c.record._id}/transfer`, c.input);
      else if (c.type === "attendance")
        await assignmentApi.action("/attendance", c.input);
      else if (c.type === "copy") {
        await assignmentApi.action("/copy-period", {
          ids: selected,
          ...targetPeriod,
        });
        setSelected([]);
      }
      setConfirmation(null);
      setRevision((v) => v + 1);
      setNotice(
        "Assignment changes saved and audited. Affected teachers must sign in again.",
      );
    } catch (e) {
      setDialogError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  function edit(row) {
    setEditing(row);
    setTeacher({
      _id: row.staffId,
      fullName: row.teacherName,
      employeeId: row.employeeId,
      status: row.teacherStatus,
      category: "teaching",
      assignmentMode: "explicit",
    });
    setForm({
      ...empty,
      sessionId: row.sessionId,
      termId: row.termId || "",
      classId: row.classId,
      arm: row.arm,
      kind: row.kind,
      subjectIds: row.subjectId ? [row.subjectId] : [],
      status: row.status,
    });
    document
      .getElementById("assignment-editor")
      ?.scrollIntoView({ behavior: "smooth" });
  }
  async function showHistory(row, nextPage = 1) {
    try {
      const d = await assignmentApi.get(`/${row._id}/history`, {
        page: nextPage,
        limit: 25,
      });
      setHistory({ ...d, assignment: row });
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  function attendance(row, enabled, termId = row.termId) {
    ask({
      type: "attendance",
      input: {
        staffId: row.staffId,
        sessionId: row.sessionId,
        termId: termId || null,
        classId: row.classId,
        arm: row.arm,
        enabled,
        reason: "",
      },
      description: `${enabled ? "Grant" : "Revoke"} attendance for ${row.teacherName}, ${name("classes", row.classId)} ${row.arm}, ${name("sessions", row.sessionId)} / ${termId ? name("terms", termId) : "all session terms"}. Teaching and class-teacher appointments do not grant attendance automatically.`,
    });
  }
  function describeSnapshot(snapshot) {
    if (!snapshot) return "No previous assignment";
    if (!snapshot.classId)
      return snapshot.sourceId
        ? "Linked source assignment retained in history"
        : "Recorded change";
    return [
      name("sessions", snapshot.sessionId),
      snapshot.termId ? name("terms", snapshot.termId) : "All session terms",
      name("classes", snapshot.classId),
      snapshot.arm || "No arm",
      snapshot.kind === "class_teacher"
        ? "Lead class teacher"
        : name("subjects", snapshot.subjectId),
      snapshot.status,
    ].join(" / ");
  }
  function describeLegacy(person) {
    return (
      "Retained classes: " +
      ((person.classIds || []).map((id) => name("classes", id)).join(", ") ||
        "none") +
      ". Retained subjects: " +
      ((person.subjectIds || []).map((id) => name("subjects", id)).join(", ") ||
        "none") +
      ". Attendance grants: " +
      ((person.attendanceGrants || [])
        .map((g) => name("classes", g.classId) + " / " + (g.arm || "no arm"))
        .join(", ") || "none") +
      ". Periods and any missing arm scope require your review."
    );
  }
  const cls = context?.classes.find((c) => c._id === form.classId);
  return (
    <div className="teacher-workspace assignment-workspace">
      <div className="page-heading">
        <div>
          <div className="eyebrow">ACADEMIC MANAGEMENT</div>
          <h1>Teacher Assignments</h1>
          <p>
            Manage exact subjects, class arms and academic periods.
            Class-teacher appointments and attendance permissions are separate
            responsibilities.
          </p>
        </div>
      </div>
      {error && (
        <div className="alert error" role="alert">
          {error}
          <button
            className="btn secondary"
            onClick={() => {
              setError("");
              setRevision((v) => v + 1);
            }}
          >
            Retry
          </button>
        </div>
      )}
      {notice && (
        <p className="alert success" role="status">
          {notice}
        </p>
      )}
      {!context ? (
        <p role="status">Loading academic configuration...</p>
      ) : (
        <>
          <section className="panel" id="assignment-editor">
            <h2>{editing ? "Edit assignment" : "Create assignments"}</h2>
            <EntityPicker
              kind="staff"
              teachingOnly
              activeOnly
              selected={teacher}
              disabled={Boolean(editing) || busy}
              onSelect={(t) => {
                setTeacher(t);
                setForm((old) => ({ ...old, adoptLegacy: false }));
              }}
            />
            {teacher && teacher.assignmentMode !== "explicit" && (
              <p className="alert info">{describeLegacy(teacher)}</p>
            )}
            <form onSubmit={prepareSave} className="assignment-form">
              <div className="teacher-filters">
                <label>
                  Academic session
                  <select
                    name="sessionId"
                    value={form.sessionId}
                    onChange={change}
                    required
                  >
                    <option value="">Choose session</option>
                    {context.sessions.map((s) => (
                      <option key={s._id} value={s._id}>
                        {s.name} ({s.status})
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Term
                  <select name="termId" value={form.termId} onChange={change}>
                    <option value="">All terms in this session</option>
                    {context.terms
                      .filter((t) => t.sessionId === form.sessionId)
                      .map((t) => (
                        <option key={t._id} value={t._id}>
                          {t.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Class
                  <select
                    name="classId"
                    value={form.classId}
                    onChange={change}
                    required
                  >
                    <option value="">Choose class</option>
                    {context.classes
                      .filter((c) => c.status === "active")
                      .map((c) => (
                        <option key={c._id} value={c._id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Class arm
                  <select
                    name="arm"
                    value={form.arm}
                    onChange={change}
                    required={Boolean(cls?.arms.length)}
                  >
                    {cls?.arms.length ? (
                      <>
                        <option value="">Choose arm</option>
                        {cls.arms
                          .filter((a) => !cls.inactiveArms.includes(a))
                          .map((a) => (
                            <option key={a}>{a}</option>
                          ))}
                      </>
                    ) : (
                      <option value="">Class without arms</option>
                    )}
                  </select>
                </label>
                <label>
                  Responsibility
                  <select name="kind" value={form.kind} onChange={change}>
                    <option value="teaching">Subject teaching</option>
                    <option value="class_teacher">Lead class teacher</option>
                  </select>
                </label>
                <label>
                  Status
                  <select name="status" value={form.status} onChange={change}>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive (retained)</option>
                  </select>
                </label>
              </div>
              {form.kind === "teaching" ? (
                <fieldset>
                  <legend>Subjects in the selected class</legend>
                  <div className="assignment-options">
                    {context.subjects
                      .filter(
                        (s) =>
                          s.classId === form.classId && s.status === "active",
                      )
                      .map((s) => (
                        <label key={s._id}>
                          <input
                            type="checkbox"
                            checked={form.subjectIds.includes(s._id)}
                            onChange={(e) =>
                              setForm((old) => ({
                                ...old,
                                subjectIds: e.target.checked
                                  ? [...old.subjectIds, s._id]
                                  : old.subjectIds.filter((id) => id !== s._id),
                              }))
                            }
                          />
                          {s.name}
                        </label>
                      ))}
                  </div>
                  {!context.subjects.some(
                    (s) => s.classId === form.classId && s.status === "active",
                  ) && <p>No active subjects in this class.</p>}
                </fieldset>
              ) : (
                <p>
                  Only one active lead appointment may cover a class arm for an
                  overlapping academic period. This appointment grants no
                  subject scoring or attendance access.
                </p>
              )}
              {teacher && teacher.assignmentMode !== "explicit" && (
                <label className="assignment-check">
                  <input
                    type="checkbox"
                    checked={form.adoptLegacy}
                    onChange={(e) =>
                      setForm((old) => ({
                        ...old,
                        adoptLegacy: e.target.checked,
                      }))
                    }
                  />
                  I reviewed the legacy records below. Use only explicit records
                  for this teacher after saving. Retain the old arrays as
                  history; their unconfirmed period and arm permissions will no
                  longer apply.
                </label>
              )}
              <label>
                Reason
                <input
                  name="reason"
                  value={form.reason}
                  onChange={change}
                  minLength={3}
                  maxLength={500}
                  required
                />
              </label>
              <div className="button-row">
                <button className="btn primary" disabled={busy || !teacher}>
                  {editing
                    ? "Review assignment changes"
                    : "Review and save assignments"}
                </button>
                {editing && (
                  <button
                    type="button"
                    className="btn secondary"
                    onClick={() => {
                      setEditing(null);
                      setForm({ ...empty, sessionId: form.sessionId });
                    }}
                  >
                    Cancel edit
                  </button>
                )}
              </div>
            </form>
          </section>
          <section className="panel">
            <h2>Assignment overview</h2>
            <div className="teacher-filters">
              <label>
                Teacher name or employee ID
                <input
                  value={filters.search}
                  onChange={(e) => {
                    setFilters((old) => ({ ...old, search: e.target.value }));
                    setPage(1);
                  }}
                  maxLength={100}
                />
              </label>
              {[
                ["sessionId", "Session", context.sessions],
                [
                  "termId",
                  "Term",
                  context.terms.filter(
                    (t) =>
                      !filters.sessionId || t.sessionId === filters.sessionId,
                  ),
                ],
                ["classId", "Class", context.classes],
                [
                  "subjectId",
                  "Subject",
                  context.subjects.filter(
                    (s) => !filters.classId || s.classId === filters.classId,
                  ),
                ],
              ].map(([key, label, options]) => (
                <label key={key}>
                  {label}
                  <select
                    value={filters[key]}
                    onChange={(e) => {
                      setFilters((old) => ({
                        ...old,
                        [key]: e.target.value,
                        ...(key === "sessionId" ? { termId: "" } : {}),
                        ...(key === "classId" ? { subjectId: "" } : {}),
                      }));
                      setPage(1);
                    }}
                  >
                    <option value="">All</option>
                    {options.map((o) => (
                      <option key={o._id} value={o._id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
              <label>
                Status
                <select
                  value={filters.status}
                  onChange={(e) => {
                    setFilters((old) => ({ ...old, status: e.target.value }));
                    setPage(1);
                  }}
                >
                  <option value="">All</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </label>
            </div>
            <label className="assignment-check">
              <input
                type="checkbox"
                checked={onlyTeacher}
                disabled={!teacher}
                onChange={(e) => {
                  setOnlyTeacher(e.target.checked);
                  setPage(1);
                }}
              />
              Only the teacher selected above
              {teacher ? `: ${teacher.fullName}` : ""}
            </label>
            {!data ? (
              <p role="status">Loading assignments...</p>
            ) : !data.total ? (
              <p>No assignments match these filters.</p>
            ) : (
              <>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Select</th>
                        <th>Teacher / Employee ID</th>
                        <th>Session / Term</th>
                        <th>Class / Arm</th>
                        <th>Subject</th>
                        <th>Class teacher</th>
                        <th>Attendance</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.records.map((r) => (
                        <tr key={r._id}>
                          <td>
                            <input
                              aria-label={`Select assignment for ${r.teacherName} ${r.arm}`}
                              type="checkbox"
                              checked={selected.includes(r._id)}
                              onChange={(e) =>
                                setSelected((old) =>
                                  e.target.checked
                                    ? [...old, r._id]
                                    : old.filter((id) => id !== r._id),
                                )
                              }
                            />
                          </td>
                          <td>
                            {r.teacherName}
                            <span className="staff-secondary">
                              {r.employeeId} - staff {r.teacherStatus}
                            </span>
                          </td>
                          <td>
                            {name("sessions", r.sessionId)}
                            <span className="staff-secondary">
                              {r.termId
                                ? name("terms", r.termId)
                                : "All session terms"}
                            </span>
                          </td>
                          <td>
                            {name("classes", r.classId)} / {r.arm || "No arm"}
                          </td>
                          <td>
                            {r.subjectId
                              ? name("subjects", r.subjectId)
                              : "No subject permission"}
                          </td>
                          <td>{r.kind === "class_teacher" ? "Lead" : "No"}</td>
                          <td>
                            {r.attendancePermission ? "Granted" : "Not granted"}
                          </td>
                          <td>{r.status}</td>
                          <td>
                            <div className="button-row">
                              <button
                                className="btn secondary"
                                onClick={() => edit(r)}
                              >
                                Edit
                              </button>
                              {r.status === "active" && (
                                <>
                                  <button
                                    className="btn secondary"
                                    onClick={() =>
                                      ask({
                                        type: "deactivate",
                                        record: r,
                                        reason: "",
                                      })
                                    }
                                  >
                                    Deactivate
                                  </button>
                                  <button
                                    className="btn secondary"
                                    onClick={() => {
                                      setTransfer(r);
                                      setTarget(null);
                                      setTransferReason("");
                                      setAdoptTarget(false);
                                    }}
                                  >
                                    Transfer
                                  </button>
                                  <button
                                    className="btn secondary"
                                    onClick={() => attendance(r, true)}
                                  >
                                    Grant attendance
                                  </button>
                                  {(r.attendanceGrants || []).map((g) => (
                                    <button
                                      key={
                                        g._id || `${g.sessionId}:${g.termId}`
                                      }
                                      className="btn secondary"
                                      onClick={() =>
                                        attendance(r, false, g.termId)
                                      }
                                    >
                                      Revoke {g.termId ? "term" : "session"}{" "}
                                      attendance
                                    </button>
                                  ))}
                                </>
                              )}
                              <button
                                className="btn secondary"
                                onClick={() => showHistory(r)}
                              >
                                History
                              </button>
                            </div>
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
            <h3>Copy selected assignments to another period</h3>
            <p>
              {selected.length} selected. Copying is explicit and atomic;
              invalid or duplicate rows stop the whole copy. Attendance grants
              are not copied.
            </p>
            <div className="teacher-filters">
              <label>
                Target session
                <select
                  value={targetPeriod.sessionId}
                  onChange={(e) =>
                    setTargetPeriod((old) => ({
                      ...old,
                      sessionId: e.target.value,
                      termId: "",
                    }))
                  }
                >
                  <option value="">Choose target session</option>
                  {context.sessions.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Target term
                <select
                  value={targetPeriod.termId}
                  onChange={(e) =>
                    setTargetPeriod((old) => ({
                      ...old,
                      termId: e.target.value,
                    }))
                  }
                >
                  <option value="">All session terms</option>
                  {context.terms
                    .filter((t) => t.sessionId === targetPeriod.sessionId)
                    .map((t) => (
                      <option key={t._id} value={t._id}>
                        {t.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Copy reason
                <input
                  value={targetPeriod.reason}
                  maxLength={500}
                  onChange={(e) =>
                    setTargetPeriod((old) => ({
                      ...old,
                      reason: e.target.value,
                    }))
                  }
                />
              </label>
            </div>
            <button
              className="btn secondary"
              disabled={
                !selected.length ||
                !targetPeriod.sessionId ||
                targetPeriod.reason.trim().length < 3
              }
              onClick={() => ask({ type: "copy" })}
            >
              Review copy
            </button>
            <button
              className="btn secondary"
              disabled={!selected.length}
              onClick={() => setSelected([])}
            >
              Clear selection
            </button>
          </section>
          <section className="panel">
            <h2>Legacy records requiring period and arm review</h2>
            <p>
              No historical periods or arms are guessed. Creating an explicit
              record with the adoption confirmation switches that teacher's
              permission source atomically. Original arrays and grants remain
              stored.
            </p>
            {!legacy ? (
              <p role="status">Loading legacy review...</p>
            ) : !legacy.total ? (
              <p>No teachers remain in legacy mode.</p>
            ) : (
              <>
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Teacher</th>
                        <th>Retained classes</th>
                        <th>Retained subjects</th>
                        <th>Review</th>
                      </tr>
                    </thead>
                    <tbody>
                      {legacy.records.map((t) => (
                        <tr key={t._id}>
                          <td>
                            <button
                              className="text-link"
                              onClick={() => {
                                setTeacher({
                                  ...t,
                                  assignmentMode: "legacy",
                                  category: "teaching",
                                });
                                setEditing(null);
                                setForm((old) => ({
                                  ...empty,
                                  sessionId: old.sessionId,
                                }));
                              }}
                            >
                              {t.fullName} ({t.employeeId})
                            </button>
                          </td>
                          <td>
                            {t.classIds
                              .map((id) => name("classes", id))
                              .join(", ") || "None"}
                          </td>
                          <td>
                            {t.subjectIds
                              .map((id) => name("subjects", id))
                              .join(", ") || "None"}
                          </td>
                          <td>
                            {t.reviewRequired
                              ? "Review required"
                              : "No existing assignments"}
                            {t.issues.map((issue) => (
                              <p key={issue}>{issue}</p>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  page={legacyPage}
                  total={legacy.total}
                  limit={25}
                  onPage={setLegacyPage}
                />
              </>
            )}
          </section>
        </>
      )}
      {transfer && (
        <Modal title="Transfer assignment" onClose={() => setTransfer(null)}>
          <div className="modal-body">
            <p>
              Transfer {transfer.teacherName}'s{" "}
              {transfer.kind === "class_teacher"
                ? "lead class teacher appointment"
                : "subject assignment"}
              . The old record is deactivated and retained. Attendance
              permission is not transferred.
            </p>
            <EntityPicker
              kind="staff"
              teachingOnly
              activeOnly
              selected={target}
              onSelect={setTarget}
            />
            {target && target.assignmentMode !== "explicit" && (
              <p className="alert info">{describeLegacy(target)}</p>
            )}
            <label>
              Reason
              <input
                value={transferReason}
                maxLength={500}
                onChange={(e) => setTransferReason(e.target.value)}
              />
            </label>
            {target?.assignmentMode !== "explicit" && (
              <label className="assignment-check">
                <input
                  type="checkbox"
                  checked={adoptTarget}
                  onChange={(e) => setAdoptTarget(e.target.checked)}
                />
                I reviewed the target teacher's legacy assignments and approve
                switching to explicit access.
              </label>
            )}
            <button
              className="btn primary"
              disabled={
                !target ||
                transferReason.trim().length < 3 ||
                (target.assignmentMode !== "explicit" && !adoptTarget)
              }
              onClick={() => {
                ask({
                  type: "transfer",
                  record: transfer,
                  input: {
                    staffId: target._id,
                    revision: transfer.revision,
                    reason: transferReason,
                    adoptLegacy: adoptTarget,
                  },
                });
                setTransfer(null);
              }}
            >
              Review transfer
            </button>
          </div>
        </Modal>
      )}
      {confirmation && (
        <Modal
          title="Reason and scope review"
          onClose={() => {
            if (!busy) setConfirmation(null);
          }}
        >
          <div className="modal-body">
            <p>
              {confirmation.description ||
                (confirmation.type === "save"
                  ? "Save these exact subject, class arm and academic period relationships? Legacy adoption, if selected, disables the retained legacy arrays as a permission source."
                  : confirmation.type === "transfer"
                    ? "Transfer this assignment and invalidate both teachers' sessions? No attendance or academic records will be moved."
                    : confirmation.type === "copy"
                      ? `Copy ${selected.length} selected assignments into the chosen academic period?`
                      : "Deactivate this assignment and revoke its access? Historical academic records are retained.")}
            </p>
            {["deactivate", "attendance"].includes(confirmation.type) && (
              <label>
                Required reason
                <input
                  minLength={3}
                  maxLength={500}
                  value={
                    confirmation.type === "attendance"
                      ? confirmation.input.reason
                      : confirmation.reason
                  }
                  onChange={(e) =>
                    setConfirmation((old) =>
                      old.type === "attendance"
                        ? {
                            ...old,
                            input: { ...old.input, reason: e.target.value },
                          }
                        : { ...old, reason: e.target.value },
                    )
                  }
                />
              </label>
            )}
            {dialogError && (
              <div className="alert error" role="alert">
                {dialogError}
              </div>
            )}
            <div className="button-row">
              <button
                className="btn secondary"
                disabled={busy}
                onClick={() => setConfirmation(null)}
              >
                Cancel
              </button>
              <button
                className="btn primary"
                disabled={
                  busy ||
                  (["deactivate", "attendance"].includes(confirmation.type) &&
                    (confirmation.type === "attendance"
                      ? confirmation.input.reason
                      : confirmation.reason
                    ).trim().length < 3)
                }
                onClick={perform}
              >
                {busy ? "Saving..." : "Confirm changes"}
              </button>
            </div>
          </div>
        </Modal>
      )}
      {history && (
        <Modal title="Assignment history" onClose={() => setHistory(null)}>
          <div className="modal-body">
            <p>
              {history.assignment.teacherName} -{" "}
              {name("classes", history.assignment.classId)}{" "}
              {history.assignment.arm}
            </p>
            {history.records.length ? (
              history.records.map((r) => (
                <article key={r._id}>
                  <h3>{r.action.replaceAll("_", " ")}</h3>
                  <p>{r.reason}</p>
                  <p>
                    Recorded by{" "}
                    {r.actorId?.name ||
                      "an actor whose account is no longer available"}
                  </p>
                  <p>
                    {new Date(r.createdAt).toLocaleString("en-GB", {
                      timeZone: "Africa/Lagos",
                    })}{" "}
                    WAT
                  </p>
                  <p>
                    Before: {describeSnapshot(r.before)} - After:{" "}
                    {describeSnapshot(r.after)}
                  </p>
                </article>
              ))
            ) : (
              <p>No history available.</p>
            )}
            <Pagination
              page={history.page}
              total={history.total}
              limit={25}
              onPage={(p) => showHistory(history.assignment, p)}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
