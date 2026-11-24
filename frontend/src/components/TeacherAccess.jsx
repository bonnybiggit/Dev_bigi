import { useCallback, useEffect, useState } from "react";
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
  return (
    <section className="administrator-section">
      <h2>Teacher score-entry access</h2>
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
