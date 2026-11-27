import { useState } from "react";
import { Navigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import Brand from "../components/Brand";
import { useAuth } from "../context/AuthContext";
import { dashboardPath } from "../lib/navigation";
import { errorMessage } from "../lib/api";
import useLoginSchool from "../hooks/useLoginSchool";
export default function StudentLogin() {
  const { user, login } = useAuth();
  const { school, schoolId, setSchoolId } = useLoginSchool();
  const [show, setShow] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (user) return <Navigate to={dashboardPath(user)} replace />;
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    try {
      await login(
        {
          schoolId: form.get("schoolId").trim(),
          admissionNumber: form.get("admissionNumber").trim(),
          password: form.get("password"),
        },
        false,
        false,
        true,
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="password-page student-login">
      <section className="password-card">
        <Brand school={school} />
        <h1>Student sign in</h1>
        <p>
          Use the school ID and admission number given to you by your school.
        </p>
        <form onSubmit={submit}>
          <label>
            School ID
            <input
              name="schoolId"
              value={schoolId}
              onChange={(e) => setSchoolId(e.target.value.trim())}
              required
              pattern="[a-fA-F0-9]{24}"
              maxLength={24}
              autoComplete="organization"
            />
          </label>
          <label>
            Admission number
            <input
              name="admissionNumber"
              required
              maxLength={40}
              autoComplete="username"
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type={show ? "text" : "password"}
              required
              maxLength={72}
              autoComplete="current-password"
            />
          </label>
          <button
            type="button"
            className="btn secondary"
            aria-label={show ? "Hide password" : "Show password"}
            onClick={() => setShow((v) => !v)}
          >
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
            {show ? "Hide password" : "Show password"}
          </button>
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
          <button className="btn primary login-submit" disabled={busy}>
            {busy ? "Signing in..." : "Sign in"}
          </button>
        </form>
        <p>Forgot your password? Ask your school administrator for help.</p>
        <footer className="no-print">Developed by Dev_Bigi</footer>
      </section>
    </div>
  );
}
