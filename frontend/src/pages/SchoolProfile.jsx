import { useCallback, useEffect, useState } from "react";
import { Save, School } from "lucide-react";
import { api } from "../lib/api";
import { configurationError, schoolTypes } from "../lib/academicConfiguration";
import ConfigurationFields from "../components/ConfigurationFields";
import { useAuth } from "../context/AuthContext";
import { SchoolLogo } from "../components/SchoolIdentity";
const fields = [
  {
    name: "name",
    label: "School name",
    required: true,
    maxLength: 160,
    wide: true,
  },
  {
    name: "address",
    label: "Address",
    type: "textarea",
    maxLength: 300,
    wide: true,
  },
  { name: "city", label: "City", required: true, maxLength: 80 },
  { name: "country", label: "Country", required: true, maxLength: 80 },
  { name: "phone", label: "Phone", type: "tel", maxLength: 30 },
  { name: "email", label: "Email", type: "email", maxLength: 254 },
  {
    name: "schoolType",
    label: "School type",
    type: "select",
    required: true,
    options: schoolTypes.map((value) => ({ value, label: value })),
  },
  {
    name: "logoUrl",
    label: "Logo URL (legacy HTTPS or uploaded logo)",
    maxLength: 2048,
    placeholder: "https://…",
    help: "Upload below for local/offline use. HTTPS logos require internet. Leave blank and save to remove the logo.",
  },
];
export default function SchoolProfile() {
  const { setSchool, user } = useAuth();
  const [logoFile, setLogoFile] = useState(null);
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setError("");
    try {
      const { data } = await api.get("/school/profile");
      setProfile(data.profile);
    } catch (e) {
      setError(configurationError(e));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  async function save(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const { data } = await api.put("/school/profile", profile);
      setProfile(data.profile);
      setNotice("School profile updated successfully.");
      setSchool(data.profile);
    } catch (e) {
      setError(configurationError(e));
    } finally {
      setBusy(false);
    }
  }
  async function uploadLogo(event) {
    event.preventDefault();
    if (!logoFile) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (
        !["image/png", "image/jpeg"].includes(logoFile.type) ||
        logoFile.size > 256 * 1024
      )
        throw new Error("Choose a PNG or JPEG logo at most 256 KiB.");
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(",")[1]);
        reader.onerror = () => reject(new Error("Unable to read logo."));
        reader.readAsDataURL(logoFile);
      });
      const response = await api.post("/school/profile/logo", {
        contentType: logoFile.type,
        data,
      });
      setProfile(response.data.profile);
      setSchool(response.data.profile);
      setNotice("School logo stored in this installation's database.");
    } catch (e) {
      setError(e.response ? configurationError(e) : e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">SCHOOL CONFIGURATION</div>
          <h1>School profile</h1>
          <p>Keep your school's identity and contact details up to date.</p>
        </div>
      </div>
      {error && (
        <div className="alert error" role="alert">
          {error}
          {!profile && <button onClick={load}>Retry</button>}
        </div>
      )}
      {notice && (
        <div className="alert success" role="status">
          {notice}
        </div>
      )}
      {!profile ? (
        !error && <div className="loading-state">Loading school profile…</div>
      ) : (
        <section className="panel profile-panel">
          <div className="panel-heading">
            <div className="profile-identity">
              {profile.logoUrl ? (
                <SchoolLogo school={profile} />
              ) : (
                <span className="banner-icon">
                  <School size={30} />
                </span>
              )}
              <div>
                <h2>{profile.name}</h2>
                <p>
                  {profile.city}, {profile.country}
                </p>
              </div>
            </div>
          </div>
          <form className="profile-form" onSubmit={save}>
            <ConfigurationFields
              fields={fields}
              values={profile}
              onChange={(event) =>
                setProfile({
                  ...profile,
                  [event.target.name]: event.target.value,
                })
              }
            />
            <div className="button-row">
              <button className="btn primary" disabled={busy}>
                <Save size={18} />
                {busy ? "Saving…" : "Save profile"}
              </button>
            </div>
          </form>
          <form onSubmit={uploadLogo} className="profile-form">
            <label>
              Upload school logo (PNG/JPEG, up to 256 KiB and 1024 × 1024
              pixels)
              <input
                type="file"
                accept="image/png,image/jpeg"
                onChange={(e) => setLogoFile(e.target.files[0] || null)}
              />
            </label>
            <p>
              Save other profile edits before uploading. Logos are stored in
              this installation's database; include it in backups.
            </p>
            <button className="btn secondary" disabled={busy || !logoFile}>
              Upload logo
            </button>
          </form>
          <div className="school-login-links">
            <h3>School sign-in links</h3>
            {["school", "teacher", "student"].map((role) => (
              <p key={role}>
                <a href={`/${role}-login?school=${user.schoolId}`}>
                  {role} sign in
                </a>
              </p>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
