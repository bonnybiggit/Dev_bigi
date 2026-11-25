import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { configurationError } from "../lib/academicConfiguration";
export default function TeacherAccess({ staff }) {
  const [account, setAccount] = useState(undefined),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [password, setPassword] = useState("");
  const load = useCallback(async () => {
    setError("");
    try {
      const { data } = await api.get(
        `/school/staff/${staff._id}/teacher-account`,
      );
      setAccount(data.user);
    } catch (e) {
      setError(configurationError(e));
    }
  }, [staff._id]);
  useEffect(() => {
    load();
  }, [load]);
  async function create() {
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post(
        `/school/staff/${staff._id}/teacher-account`,
        {},
      );
      setAccount(data.user);
      setPassword(data.temporaryPassword);
    } catch (e) {
      setError(configurationError(e));
    } finally {
      setBusy(false);
    }
  }
  const [grants, setGrants] = useState(staff.attendanceGrants || []);
  const [classes, setClasses] = useState([]);
  const [saved, setSaved] = useState("");
  useEffect(() => {
    api
      .get("/school/classes")
      .then(({ data }) => setClasses(data.records || []))
      .catch((e) => setError(configurationError(e)));
  }, []);
  async function saveGrants() {
    setBusy(true);
    setError("");
    setSaved("");
    try {
      await api.put("/school/staff/" + staff._id + "/attendance-grants", {
        grants: grants.map(({ classId, arm }) => ({ classId, arm })),
      });
      setSaved("Permissions saved. Teacher must sign in again.");
    } catch (e) {
      setError(configurationError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="administrator-section">
      <h2>Teacher workspace access</h2>
      {staff.assignmentMode === "explicit" && (
        <p>
          <Link to="/school/teacher-assignments">
            Manage period-scoped attendance permissions in Teacher Assignments
          </Link>
        </p>
      )}
      <fieldset disabled={busy || staff.assignmentMode === "explicit"}>
        <legend>Attendance permissions</legend>
        <p>Authorise each class and arm explicitly.</p>
        {classes
          .filter((c) =>
            staff.classIds.some((id) => String(id) === String(c._id)),
          )
          .flatMap((c) =>
            (c.arms.length ? c.arms : [""]).map((arm) => (
              <label key={c._id + arm}>
                <input
                  type="checkbox"
                  checked={grants.some(
                    (g) => String(g.classId) === String(c._id) && g.arm === arm,
                  )}
                  onChange={(e) =>
                    setGrants((old) =>
                      e.target.checked
                        ? [...old, { classId: c._id, arm }]
                        : old.filter(
                            (g) =>
                              !(
                                String(g.classId) === String(c._id) &&
                                g.arm === arm
                              ),
                          ),
                    )
                  }
                />
                {c.name} {arm}
              </label>
            )),
          )}
        <button type="button" className="btn secondary" onClick={saveGrants}>
          Save attendance permissions
        </button>
        {saved && <p role="status">{saved}</p>}
      </fieldset>
      <p className="field-help">
        Access uses this staff record's email and current class/subject
        assignments. Deactivation or changes to the staff profile invalidate
        teacher sessions.
      </p>
      {error && (
        <div className="alert error" role="alert">
          {error}
          <button onClick={load}>Retry</button>
        </div>
      )}
      {account === undefined ? (
        <p className="field-help">Loading access details…</p>
      ) : account ? (
        <p className="field-help">
          Login: <strong>{account.email}</strong> ·{" "}
          {account.mustChangePassword
            ? "First password change pending"
            : "Password configured"}
        </p>
      ) : (
        <button
          className="btn primary"
          disabled={
            busy || staff.category !== "teaching" || staff.status !== "active"
          }
          onClick={create}
        >
          {busy ? "Creating…" : "Create teacher login"}
        </button>
      )}
      {password && (
        <div className="credential-card" role="status">
          <strong>Temporary password — shown once</strong>
          <p>
            <code>{password}</code>
          </p>
          <p>
            Share securely with the teacher. Sign in at /teacher-login and
            replace the temporary password before entering scores.
          </p>
          <button className="btn secondary" onClick={() => setPassword("")}>
            I have saved it securely
          </button>
        </div>
      )}
    </section>
  );
}
