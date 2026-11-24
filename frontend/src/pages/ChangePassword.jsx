import { useState } from "react";
import { LockKeyhole } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { errorMessage } from "../lib/api";

export default function ChangePassword() {
  const { changePassword, logout } = useAuth();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    if (form.get("newPassword") !== form.get("confirmPassword"))
      return setError("New passwords do not match.");
    setBusy(true);
    try {
      await changePassword({
        currentPassword: form.get("currentPassword"),
        newPassword: form.get("newPassword"),
      });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="password-page">
      <section className="password-card">
        <span className="login-lock">
          <LockKeyhole />
        </span>
        <div className="eyebrow">SECURE YOUR ACCOUNT</div>
        <h1>Choose your password</h1>
        <p className="muted">
          Replace your temporary password before accessing your school. Use at
          least 12 characters and at most 72 UTF-8 bytes.
        </p>
        <form onSubmit={submit}>
          <label htmlFor="currentPassword">Temporary password</label>
          <input
            id="currentPassword"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            maxLength={72}
            required
          />
          <label htmlFor="newPassword">New password</label>
          <input
            id="newPassword"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={72}
            required
          />
          <label htmlFor="confirmPassword">Confirm new password</label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={72}
            required
          />
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
          <button className="btn primary login-submit" disabled={busy}>
            {busy ? "Saving…" : "Save password and continue"}
          </button>
        </form>
        <button
          className="portal-link text-link"
          disabled={busy}
          onClick={async () => {
            try {
              await logout();
            } catch (e) {
              setError(errorMessage(e));
            }
          }}
        >
          Sign out
        </button>
      </section>
    </div>
  );
}
