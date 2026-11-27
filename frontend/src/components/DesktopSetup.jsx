import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, errorMessage } from "../lib/api";
import { useAuth } from "../context/AuthContext";

const emptyAccount = () => ({ name: "", email: "", password: "", confirm: "" });
function AccountFields({ title, prefix, value, onChange }) {
  return (
    <fieldset>
      <legend>{title}</legend>
      {[
        ["name", "Full name", "text"],
        ["email", "Local sign-in email", "email"],
        ["password", "Password (12–72 characters)", "password"],
        ["confirm", "Confirm password", "password"],
      ].map(([key, label, type]) => (
        <label key={key}>
          {label}
          <input
            name={`${prefix}-${key}`}
            type={type}
            value={value[key]}
            required
            minLength={type === "password" ? 12 : undefined}
            maxLength={type === "password" ? 72 : key === "name" ? 120 : 254}
            autoComplete={type === "password" ? "new-password" : "off"}
            onChange={(e) => onChange({ ...value, [key]: e.target.value })}
          />
        </label>
      ))}
    </fieldset>
  );
}
export default function DesktopSetup({ children }) {
  const [state, setState] = useState(
      window.desktopPreview ? "loading" : "ready",
    ),
    [error, setError] = useState("");
  const [mode, setMode] = useState("school"),
    [owner, setOwner] = useState(emptyAccount),
    [administrator, setAdministrator] = useState(emptyAccount),
    [busy, setBusy] = useState(false);
  const [school, setSchool] = useState({
    name: "",
    address: "",
    city: "",
    country: "",
    phone: "",
    email: "",
    schoolType: "Primary",
    logoUrl: "",
  });
  const { login } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!window.desktopPreview) return;
    api
      .get("/desktop/setup")
      .then(({ data }) => {
        if (data.locked) {
          setError(
            "Retained school data exists without an administrator. Use a verified backup; new registration is disabled.",
          );
          setState("locked");
        } else setState(data.setupRequired ? "setup" : "ready");
      })
      .catch((e) => {
        setError(errorMessage(e));
        setState("locked");
      });
  }, []);
  if (state === "ready") return children;
  if (state === "loading")
    return (
      <div className="screen-loading">
        Opening your independent school installation...
      </div>
    );
  async function register(event) {
    event.preventDefault();
    setError("");
    if (
      owner.password !== owner.confirm ||
      (mode === "school" && administrator.password !== administrator.confirm)
    )
      return setError("Password confirmations must match.");
    if (
      mode === "school" &&
      owner.email.toLowerCase() === administrator.email.toLowerCase()
    )
      return setError(
        "Use different local sign-in email addresses for the owner and school administrator.",
      );
    setBusy(true);
    const account = (value) => ({
      name: value.name,
      email: value.email,
      password: value.password,
    });
    try {
      const { data } = await api.post(
        "/desktop/setup",
        {
          mode,
          owner: account(owner),
          ...(mode === "school"
            ? { school, administrator: account(administrator) }
            : {}),
        },
        { timeout: 0 },
      );
      await login(
        {
          email: mode === "school" ? administrator.email : owner.email,
          password: mode === "school" ? administrator.password : owner.password,
          ...(data.schoolId ? { schoolId: data.schoolId } : {}),
        },
        mode === "school",
      );
      setOwner(emptyAccount());
      setAdministrator(emptyAccount());
      setState("ready");
      navigate(mode === "school" ? "/school" : "/backups", { replace: true });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="desktop-setup">
      <main>
        <h1>Set up your school installation</h1>
        <p>
          This copy starts empty. All accounts and school details below belong
          to you. No internet or email delivery is required.
        </p>
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        {state === "setup" && (
          <form onSubmit={register}>
            <fieldset disabled={busy}>
              <label>
                Installation purpose
                <select
                  name="setup-mode"
                  value={mode}
                  onChange={(e) => setMode(e.target.value)}
                >
                  <option value="school">Register a new school</option>
                  <option value="recovery">
                    Recover an existing school from backup
                  </option>
                </select>
              </label>
              <AccountFields
                title="Installation owner — full backups and recovery"
                prefix="owner"
                value={owner}
                onChange={setOwner}
              />
              {mode === "school" && (
                <>
                  <fieldset>
                    <legend>School identity</legend>
                    {[
                      ["name", "School name", true],
                      ["address", "Address", false],
                      ["city", "City", true],
                      ["country", "Country", true],
                      ["phone", "School phone", false],
                      ["email", "School contact email", false],
                    ].map(([key, label, required]) => (
                      <label key={key}>
                        {label}
                        <input
                          name={`school-${key}`}
                          type={key === "email" ? "email" : "text"}
                          required={required}
                          value={school[key]}
                          maxLength={
                            key === "address"
                              ? 300
                              : key === "phone"
                                ? 30
                                : key === "email"
                                  ? 254
                                  : key === "name"
                                    ? 160
                                    : 80
                          }
                          onChange={(e) =>
                            setSchool({ ...school, [key]: e.target.value })
                          }
                        />
                      </label>
                    ))}
                    <label>
                      School type
                      <select
                        name="school-type"
                        value={school.schoolType}
                        onChange={(e) =>
                          setSchool({ ...school, schoolType: e.target.value })
                        }
                      >
                        {[
                          "Nursery",
                          "Primary",
                          "Nursery and Primary",
                          "Secondary",
                          "Other",
                        ].map((value) => (
                          <option key={value}>{value}</option>
                        ))}
                      </select>
                    </label>
                  </fieldset>
                  <AccountFields
                    title="School administrator — day-to-day school operations"
                    prefix="administrator"
                    value={administrator}
                    onChange={setAdministrator}
                  />
                </>
              )}
              <p>
                {mode === "school"
                  ? "Keep both sets of credentials. The owner signs in through the Super Admin portal to download full backups; the administrator uses the school portal. Upload your school logo in School Profile after registration."
                  : "Create a temporary owner for this empty installation, then upload and verify your encrypted backup. The restored accounts keep their original passwords."}
              </p>
              <button className="btn primary" disabled={busy}>
                {busy
                  ? "Creating your local installation..."
                  : "Register this installation"}
              </button>
            </fieldset>
          </form>
        )}
        <footer className="no-print">Developed by Dev_Bigi</footer>
      </main>
    </div>
  );
}
