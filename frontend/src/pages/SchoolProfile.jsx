import { useCallback, useEffect, useState } from "react";
import { Save, School } from "lucide-react";
import { api } from "../lib/api";
import { configurationError, schoolTypes } from "../lib/academicConfiguration";
import ConfigurationFields from "../components/ConfigurationFields";
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
    label: "Logo image URL",
    type: "url",
    maxLength: 2048,
    placeholder: "https://…",
    help: "Use a publicly accessible HTTPS image URL. Leave blank to remove the logo.",
  },
];
export default function SchoolProfile() {
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
    } catch (e) {
      setError(configurationError(e));
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
                <img
                  src={profile.logoUrl}
                  alt={`${profile.name} logo`}
                  referrerPolicy="no-referrer"
                />
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
        </section>
      )}
    </>
  );
}
