import { useState } from "react";
import { admissionsApi } from "../lib/admissions";
import { errorMessage } from "../lib/api";
export default function MedicalInformation({ applicationId, studentId }) {
  const [data, setData] = useState(null),
    [opened, setOpened] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const path = applicationId
    ? `applications/${applicationId}/medical`
    : `forms/students/${studentId}/medical`;
  async function load() {
    setBusy(true);
    setError("");
    try {
      const { record } = await admissionsApi.get(path);
      setData({
        revision: record?.revision || 0,
        allergies: record?.allergies || "",
        conditions: record?.conditions || "",
        safetyInstructions: record?.safetyInstructions || "",
        emergencyName: record?.emergencyName || "",
        emergencyPhone: record?.emergencyPhone || "",
        emergencyRelationship: record?.emergencyRelationship || "",
        reason: "",
      });
      setOpened(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { record } = await admissionsApi.put(path, data);
      setData({ ...record, reason: "" });
      setNotice("Safety information saved. Access and changes are audited.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel medical-editor no-print">
      <h2>Medical and emergency information</h2>
      <p>
        School Administrators only. Collect relevant safety information, not
        unnecessary medical history. These records are excluded from application
        lists and teacher/student APIs.
      </p>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {notice && <p role="status">{notice}</p>}
      {!opened ? (
        <button className="btn secondary" disabled={busy} onClick={load}>
          {busy ? "Loading..." : "Open restricted safety information"}
        </button>
      ) : (
        <>
          <button
            className="btn secondary"
            disabled={busy}
            onClick={() => {
              setData(null);
              setOpened(false);
              setNotice("");
            }}
          >
            Close private information
          </button>
          <form onSubmit={save}>
            <div className="configuration-fields">
              {[
                ["allergies", "Relevant allergies", true],
                ["conditions", "Relevant medical conditions", true],
                [
                  "safetyInstructions",
                  "Guardian-provided school safety instructions",
                  true,
                ],
                ["emergencyName", "Emergency contact name"],
                ["emergencyPhone", "Emergency contact phone"],
                ["emergencyRelationship", "Emergency contact relationship"],
              ].map(([key, label, area]) => (
                <label key={key}>
                  {label}
                  {area ? (
                    <textarea
                      value={data[key]}
                      maxLength={1000}
                      rows={3}
                      onChange={(e) =>
                        setData((old) => ({ ...old, [key]: e.target.value }))
                      }
                    />
                  ) : (
                    <input
                      value={data[key]}
                      maxLength={
                        key === "emergencyPhone"
                          ? 30
                          : key === "emergencyName"
                            ? 120
                            : 60
                      }
                      onChange={(e) =>
                        setData((old) => ({ ...old, [key]: e.target.value }))
                      }
                    />
                  )}
                </label>
              ))}
            </div>
            <label>
              Reason for update
              <input
                value={data.reason}
                minLength={3}
                maxLength={500}
                required
                onChange={(e) =>
                  setData((old) => ({ ...old, reason: e.target.value }))
                }
              />
            </label>
            <div className="button-row">
              <button className="btn primary" disabled={busy}>
                Save safety information
              </button>
              <button
                type="button"
                className="btn secondary"
                disabled={busy}
                onClick={load}
              >
                Reload latest revision
              </button>
            </div>
          </form>
        </>
      )}
    </section>
  );
}
