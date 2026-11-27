import { useEffect, useState } from "react";
import { api, errorMessage } from "../lib/api";

export default function Backups() {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [currentPassword, setPassword] = useState(""),
    [passphrase, setPassphrase] = useState(""),
    [selected, setSelected] = useState(""),
    [manifest, setManifest] = useState(null),
    [file, setFile] = useState(null);
  const [enabled, setEnabled] = useState(false),
    [time, setTime] = useState("02:00"),
    [ids, setIds] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [reason, setReason] = useState("");
  const [recovery, setRecovery] = useState(null);
  async function load() {
    const { data } = await api.get("/backups");
    setData(data);
    setEnabled(data.schedule.enabled);
    setTime(data.schedule.time);
  }
  useEffect(() => {
    load().catch((e) => setError(errorMessage(e)));
  }, []);
  async function perform(work) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
      setPassword("");
      setPassphrase("");
    }
  }
  const credentials = () => ({ currentPassword, passphrase });
  const available =
    data?.backups.filter((b) =>
      ["complete", "imported", "verified"].includes(b.status),
    ) || [];
  async function download(id, pdf = false) {
    await perform(async () => {
      let result;
      try {
        result = await api.get(
          `/backups/${id}/${pdf ? "summary.pdf" : "download"}`,
          { responseType: "blob", timeout: 0 },
        );
      } catch (error) {
        if (error.response?.data instanceof Blob) {
          try {
            error.response.data = JSON.parse(await error.response.data.text());
          } catch {
            /* Preserve the standard error fallback. */
          }
        }
        throw error;
      }
      const url = URL.createObjectURL(result.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = pdf ? `${id}-summary.pdf` : `${id}.schoolbackup`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }
  return (
    <div className="backup-workspace" aria-busy={busy}>
      <div className="page-heading">
        <div>
          <div className="eyebrow">LOCAL INSTALLATION</div>
          <h1>Backup & Recovery</h1>
          <p>Full encrypted database backups. Super Admin access only.</p>
        </div>
      </div>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="alert success" role="status">
          {notice}
        </div>
      )}
      <section className="panel profile-panel">
        <h2>Authorize an operation</h2>
        <p>
          Keep the recovery passphrase separately from the backup. It cannot be
          recovered by the application. Re-enter credentials for each operation.
        </p>
        <label>
          Current account password
          <input
            type="password"
            disabled={busy}
            autoComplete="current-password"
            value={currentPassword}
            maxLength={72}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label>
          Recovery passphrase (at least 16 characters)
          <input
            type="password"
            disabled={busy}
            autoComplete="off"
            value={passphrase}
            maxLength={256}
            onChange={(e) => setPassphrase(e.target.value)}
          />
        </label>
        <button
          className="btn primary"
          disabled={busy || !currentPassword || passphrase.length < 16}
          onClick={() =>
            perform(async () => {
              const r = await api.post("/backups", credentials(), {
                timeout: 0,
              });
              setSelected(r.data.backup._id);
              setManifest(null);
              setNotice(
                "Encrypted backup created and integrity verified. Download and keep a copy on another device.",
              );
            })
          }
        >
          {busy ? "Working..." : "Create full backup"}
        </button>
      </section>
      {data && (
        <>
          <section className="panel profile-panel">
            <h2>Automatic daily backups</h2>
            <p>
              Time zone: Africa/Lagos. Runs while the local backend is running;
              a missed backup is caught up after the scheduled time. Files stay
              on this computer until downloaded.
            </p>
            <label className="check-line">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              Enable daily backups
            </label>
            <label>
              Daily time
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </label>
            <p>
              Last successful date: {data.schedule.lastSuccessfulDate || "None"}
            </p>
            <button
              className="btn secondary"
              disabled={
                busy || !currentPassword || (enabled && passphrase.length < 16)
              }
              onClick={() =>
                perform(async () => {
                  await api.put(
                    "/backups/schedule",
                    { ...credentials(), enabled, time },
                    { timeout: 0 },
                  );
                  setNotice(
                    "Daily schedule saved. The passphrase is protected for this Windows account.",
                  );
                })
              }
            >
              Save schedule
            </button>
          </section>
          <section className="panel profile-panel">
            <h2>Backup history</h2>
            <p>
              Latest 100 operations. Summary PDFs contain no account passwords
              or recovery passphrases.
            </p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Created</th>
                    <th>Type / status</th>
                    <th>Schools</th>
                    <th>Files</th>
                  </tr>
                </thead>
                <tbody>
                  {data.backups.map((b) => (
                    <tr key={b._id}>
                      <td>
                        {new Date(b.createdAt).toLocaleString("en-GB")}
                        <small className="staff-secondary">{b._id}</small>
                      </td>
                      <td>
                        {b.kind} / {b.status}
                      </td>
                      <td>
                        {b.manifest?.schools.map((s) => s.name).join(", ") ||
                          "Identity not yet verified"}
                      </td>
                      <td>
                        <button
                          disabled={
                            busy ||
                            !["complete", "imported", "verified"].includes(
                              b.status,
                            )
                          }
                          onClick={() => download(b._id)}
                        >
                          Encrypted file
                        </button>{" "}
                        <button
                          disabled={busy}
                          onClick={() => download(b._id, true)}
                        >
                          PDF summary
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="panel profile-panel">
            <h2>Recover on this computer</h2>
            <p>
              Upload an encrypted backup from another installation, verify it,
              then confirm its school IDs. Recovery creates a separate database
              and takes an encrypted pre-restore backup. The current
              installation stays intact.
            </p>
            <label>
              Encrypted .schoolbackup file
              <input
                type="file"
                accept=".schoolbackup"
                onChange={(e) => setFile(e.target.files[0] || null)}
              />
            </label>
            <button
              className="btn secondary"
              disabled={busy || !file}
              onClick={() =>
                perform(async () => {
                  const r = await api.post("/backups/upload", file, {
                    headers: { "Content-Type": "application/octet-stream" },
                    timeout: 0,
                  });
                  setSelected(r.data.backup._id);
                  setManifest(null);
                  setNotice(
                    "File uploaded. Enter credentials and verify its integrity and school identity before recovery.",
                  );
                })
              }
            >
              Upload encrypted file
            </button>
            <label>
              Backup to verify / recover
              <select
                value={selected}
                onChange={(e) => {
                  setSelected(e.target.value);
                  setManifest(null);
                  setIds("");
                  setRecovery(null);
                }}
              >
                <option value="">Select backup</option>
                {available.map((b) => (
                  <option key={b._id} value={b._id}>
                    {b._id} ({b.kind})
                  </option>
                ))}
              </select>
            </label>
            <button
              className="btn secondary"
              disabled={
                busy || !selected || !currentPassword || passphrase.length < 16
              }
              onClick={() =>
                perform(async () => {
                  const r = await api.post(
                    `/backups/${selected}/inspect`,
                    credentials(),
                    { timeout: 0 },
                  );
                  setManifest(r.data.manifest);
                  setNotice(
                    "Passphrase, authenticated encryption, collection counts and checksums verified.",
                  );
                })
              }
            >
              Verify backup and show school identity
            </button>
            {manifest && (
              <>
                <h3>Verified schools</h3>
                {manifest.schools.length ? (
                  manifest.schools.map((s) => (
                    <p key={s.id}>
                      {s.name} — {s.id}
                    </p>
                  ))
                ) : (
                  <p>Empty installation: no schools.</p>
                )}
                <label>
                  Enter all school IDs above, comma separated (leave blank for
                  an empty installation)
                  <input value={ids} onChange={(e) => setIds(e.target.value)} />
                </label>
                <label>
                  Recovery reason
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    maxLength={500}
                  />
                </label>
                <label>
                  Type RESTORE to confirm
                  <input
                    value={confirmation}
                    onChange={(e) => setConfirmation(e.target.value)}
                    autoComplete="off"
                  />
                </label>
                <p>
                  Re-enter your account password and the recovery passphrase in
                  the authorization section before restoring.
                </p>
                <button
                  className="btn primary"
                  disabled={
                    busy ||
                    confirmation !== "RESTORE" ||
                    reason.trim().length < 3 ||
                    !currentPassword ||
                    passphrase.length < 16
                  }
                  onClick={() =>
                    perform(async () => {
                      const r = await api.post(
                        `/backups/${selected}/restore`,
                        {
                          ...credentials(),
                          schoolIds: ids
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean),
                          confirmation,
                          reason,
                        },
                        { timeout: 0 },
                      );
                      setRecovery(r.data.recovery);
                      setNotice(
                        "Recovery verified in a separate database. Stop the current backend before launching the recovered installation.",
                      );
                    })
                  }
                >
                  Create and verify recovery database
                </button>
              </>
            )}
            {recovery && (
              <div className="alert success">
                <p>
                  Verified recovery database:{" "}
                  <strong>{recovery.targetDatabase}</strong>
                </p>
                <p>Pre-restore backup: {recovery.preRestoreBackupId}</p>
                {window.desktopPreview ? (
                  <>
                    <p>
                      Re-enter the installation owner's current password above,
                      then open the recovered installation. The original
                      database and pre-restore backup are retained.
                    </p>
                    <button
                      className="btn primary"
                      disabled={busy || !currentPassword}
                      onClick={() =>
                        perform(() =>
                          window.desktopPreview.activateRecovery(
                            recovery.targetDatabase,
                            currentPassword,
                          ),
                        )
                      }
                    >
                      Open recovered installation
                    </button>
                  </>
                ) : (
                  <>
                    <p>After stopping this backend, run locally:</p>
                    <code>{recovery.launchCommand}</code>
                  </>
                )}
                <p>
                  Use the restored account passwords. Existing sessions are
                  revoked; daily backups must be configured again.
                </p>
              </div>
            )}
          </section>
          <section className="panel profile-panel">
            <h2>Backup audit history</h2>
            {data.audit.map((e) => (
              <p key={e._id}>
                {new Date(e.createdAt).toLocaleString("en-GB")} —{" "}
                {e.action.replaceAll("_", " ")} — {e.actorName}
                {e.reason ? ` — ${e.reason}` : ""}
              </p>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
