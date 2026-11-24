import { useCallback, useEffect, useState } from "react";
import { Plus, ShieldCheck } from "lucide-react";
import { api, errorMessage } from "../lib/api";

export default function AdministratorManagement({ schoolId }) {
  const [administrators, setAdministrators] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [credential, setCredential] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/schools/${schoolId}/administrators`);
      setAdministrators(data.administrators);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [schoolId]);
  useEffect(() => {
    load();
  }, [load]);
  async function create(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const { data } = await api.post(`/schools/${schoolId}/administrators`, {
        name: form.get("name").trim(),
        email: form.get("email").trim(),
        phone: form.get("phone").trim(),
      });
      setCredential({
        email: data.administrator.email,
        password: data.temporaryPassword,
      });
      setCreating(false);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function toggle() {
    setBusy(true);
    setError("");
    try {
      await api.patch(
        `/schools/${schoolId}/administrators/${confirm.id}/status`,
        { isActive: !confirm.isActive },
      );
      setConfirm(null);
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="administrator-section">
      <div className="admin-section-heading">
        <div>
          <h2>Administrator management</h2>
          <p className="muted">Manage accounts for this school.</p>
        </div>
        <ShieldCheck size={23} />
      </div>
      {error && (
        <div className="alert error" role="alert">
          {error}
          <button
            onClick={() => {
              setError("");
              load();
            }}
          >
            Retry
          </button>
        </div>
      )}
      {credential && (
        <div className="credential-card" role="status">
          <strong>Administrator created</strong>
          <p>
            Share these credentials securely. The temporary password is shown
            once and cannot be retrieved after dismissal or closing this dialog.
          </p>
          <dl>
            <dt>Email</dt>
            <dd>{credential.email}</dd>
            <dt>Temporary password</dt>
            <dd>
              <code>{credential.password}</code>
            </dd>
          </dl>
          <p>A password change is required on first login.</p>
          <button className="btn secondary" onClick={() => setCredential(null)}>
            I have saved it securely
          </button>
        </div>
      )}
      {administrators === null ? (
        <p className="muted">Loading administrators…</p>
      ) : !administrators.length ? (
        <p className="muted">No administrators yet.</p>
      ) : (
        <div className="administrator-list">
          {administrators.map((admin) => (
            <article className="administrator-card" key={admin.id}>
              <div className="admin-card-heading">
                <strong>{admin.name}</strong>
                <span
                  className={`badge ${admin.isActive ? "active" : "suspended"}`}
                >
                  {admin.isActive ? "Active" : "Inactive"}
                </span>
              </div>
              <p>{admin.email}</p>
              <p>{admin.phone || "Phone not recorded"}</p>
              <small>
                {admin.mustChangePassword
                  ? "First-login password change pending"
                  : "Password set"}
              </small>
              <button
                className="btn secondary"
                disabled={busy}
                onClick={() => setConfirm(admin)}
              >
                {admin.isActive ? "Deactivate account" : "Activate account"}
              </button>
            </article>
          ))}
        </div>
      )}
      {confirm && (
        <div className="confirmation">
          <p>
            {confirm.isActive ? "Deactivate" : "Activate"} {confirm.name}'s
            account? Existing sessions will be invalidated.
          </p>
          <div className="button-row">
            <button
              className="btn secondary"
              disabled={busy}
              onClick={() => setConfirm(null)}
            >
              Cancel
            </button>
            <button className="btn primary" disabled={busy} onClick={toggle}>
              {busy ? "Updating…" : "Confirm"}
            </button>
          </div>
        </div>
      )}
      {creating ? (
        <form className="administrator-form" onSubmit={create}>
          <label htmlFor="admin-name">Full name</label>
          <input
            id="admin-name"
            name="name"
            minLength={2}
            maxLength={120}
            required
            autoComplete="name"
          />
          <label htmlFor="admin-email">Email address</label>
          <input
            id="admin-email"
            name="email"
            type="email"
            maxLength={254}
            required
            autoComplete="email"
          />
          <label htmlFor="admin-phone">Phone number</label>
          <input
            id="admin-phone"
            name="phone"
            type="tel"
            minLength={7}
            maxLength={30}
            required
            autoComplete="tel"
            placeholder="+234…"
          />
          <p className="muted">
            A secure temporary password will be generated automatically.
          </p>
          <div className="button-row">
            <button
              type="button"
              className="btn secondary"
              disabled={busy}
              onClick={() => setCreating(false)}
            >
              Cancel
            </button>
            <button className="btn primary" disabled={busy}>
              {busy ? "Creating…" : "Create administrator"}
            </button>
          </div>
        </form>
      ) : (
        <button
          className="btn primary"
          disabled={busy || !!credential}
          onClick={() => {
            setError("");
            setCreating(true);
          }}
        >
          <Plus size={17} />
          Add administrator
        </button>
      )}
    </section>
  );
}
