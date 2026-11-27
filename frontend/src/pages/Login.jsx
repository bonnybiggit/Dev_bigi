import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { dashboardPath } from "../lib/navigation";
import {
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  ShieldCheck,
  School,
  Check,
} from "lucide-react";
import Brand from "../components/Brand";
import { useAuth } from "../context/AuthContext";
import { errorMessage } from "../lib/api";
import useLoginSchool from "../hooks/useLoginSchool";
export default function Login({ schoolLogin = false, teacherLogin = false }) {
  const { user, loading, login } = useAuth();
  const { school, schoolId, setSchoolId, schoolQuery } = useLoginSchool(
    schoolLogin || teacherLogin,
  );
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await login(
        {
          email: form.get("email").trim(),
          password: form.get("password"),
          ...((schoolLogin || teacherLogin) && schoolId ? { schoolId } : {}),
        },
        schoolLogin,
        teacherLogin,
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  if (loading)
    return <div className="screen-loading">Opening your workspace…</div>;
  if (user) return <Navigate to={dashboardPath(user)} replace />;
  return (
    <div className="login-page">
      <section className="login-story">
        <Brand school={school} />
        <div className="story-content">
          <div className="eyebrow light">
            {school ? "YOUR SCHOOL WORKSPACE" : "ONE PLATFORM. EVERY SCHOOL."}
          </div>
          <h1>
            {school?.name || "A stronger foundation"}
            <br />
            {!school && "for every school."}
          </h1>
          <p>
            Bring your schools together. Manage your network with clarity,
            confidence, and care.
          </p>
          <div className="school-illustration">
            <div className="illustration-glow" />
            <div className="school-symbol">
              <School size={76} strokeWidth={1.2} />
            </div>
            <div className="floating-note">
              <span className="note-check">
                <Check size={17} />
              </span>
              <div>
                <strong>Connected by purpose</strong>
                <small>Built around education</small>
              </div>
            </div>
          </div>
          <div className="story-tags">
            <span>
              <ShieldCheck size={17} />
              Secure access
            </span>
            <span>
              <School size={17} />
              Centralized management
            </span>
          </div>
        </div>
        <div className="story-footer no-print">Developed by Dev_Bigi</div>
      </section>
      <section className="login-form-panel">
        <div className="login-form">
          <span className="login-lock">
            <LockKeyhole size={23} />
          </span>
          <div className="eyebrow">
            {teacherLogin
              ? "TEACHER SCORE WORKSPACE"
              : schoolLogin
                ? "SCHOOL ADMINISTRATOR PORTAL"
                : "SUPER ADMIN PORTAL"}
          </div>
          <h2>Welcome back.</h2>
          <p className="muted">
            {teacherLogin
              ? "Sign in to enter scores for your assigned subjects."
              : schoolLogin
                ? "Sign in to your school workspace."
                : "Sign in to manage your school network."}
          </p>
          <form onSubmit={submit}>
            {(schoolLogin || teacherLogin) && (
              <label>
                School ID (optional for existing accounts)
                <input
                  value={schoolId}
                  onChange={(e) => setSchoolId(e.target.value.trim())}
                  pattern="[a-fA-F0-9]{24}"
                  maxLength={24}
                  autoComplete="organization"
                />
              </label>
            )}
            <label htmlFor="email">Email address</label>
            <div className="input-icon">
              <Mail size={18} />
              <input
                id="email"
                name="email"
                type="email"
                placeholder="you@organization.com"
                autoComplete="username"
                required
                maxLength={254}
              />
            </div>
            <label htmlFor="password">Password</label>
            <div className="input-icon">
              <LockKeyhole size={18} />
              <input
                id="password"
                name="password"
                type={visible ? "text" : "password"}
                placeholder="Enter your password"
                autoComplete="current-password"
                required
                maxLength={72}
              />
              <button
                type="button"
                className="password-toggle"
                aria-label={visible ? "Hide password" : "Show password"}
                onClick={() => setVisible(!visible)}
              >
                {visible ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {error && (
              <div className="alert error" role="alert">
                {error}
              </div>
            )}
            <button className="btn primary login-submit" disabled={busy}>
              {busy ? "Signing in…" : "Sign in to workspace"}
            </button>
          </form>
          <p className="login-help">
            <ShieldCheck size={16} />
            {teacherLogin
              ? "Authorised teaching staff only."
              : schoolLogin
                ? "Authorized school administrators only."
                : "Authorized platform administrators only."}
          </p>
          <Link
            className="portal-link text-link"
            to={schoolLogin ? "/login" : `/school-login${schoolQuery}`}
          >
            {schoolLogin
              ? "Super Admin sign in"
              : "School Administrator sign in"}
          </Link>
          {!teacherLogin && (
            <Link
              className="portal-link text-link"
              to={`/teacher-login${schoolQuery}`}
            >
              Teacher sign in
            </Link>
          )}
          <Link
            className="portal-link text-link"
            to={`/student-login${schoolQuery}`}
          >
            Student sign in
          </Link>
        </div>
        <div className="login-copyright no-print">Developed by Dev_Bigi</div>
      </section>
    </div>
  );
}
