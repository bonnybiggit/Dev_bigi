import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Users, Pencil } from "lucide-react";
import { api } from "../lib/api";
import { configurationError } from "../lib/academicConfiguration";
import { guardianFields } from "../lib/guardians";
import { studentLabels } from "../lib/students";
import GuardianForm from "../components/GuardianForm";
import GuardianStatusAction from "../components/GuardianStatusAction";
import GuardianRelationships from "../components/GuardianRelationships";
import { StatusBadge } from "../components/SchoolTable";
export default function GuardianProfile() {
  const { id } = useParams();
  const [record, setRecord] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState(false);
  const load = useCallback(async () => {
    setError("");
    try {
      const { data } = await api.get(`/school/guardians/${id}`);
      setRecord(data.record);
    } catch (e) {
      setError(configurationError(e));
    }
  }, [id]);
  useEffect(() => {
    setRecord(null);
    load();
  }, [load]);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">PARENTS & GUARDIANS</div>
          <h1>Guardian profile</h1>
          <p>
            <Link className="text-link" to="/school/guardians">
              Return to guardian directory
            </Link>
          </p>
        </div>
        {record && (
          <button className="btn primary" onClick={() => setEditing(true)}>
            <Pencil size={17} />
            Edit profile
          </button>
        )}
      </div>
      {error && (
        <div className="alert error" role="alert">
          {error}
          <button onClick={load}>Retry</button>
        </div>
      )}
      {notice && (
        <div className="alert success" role="status">
          {notice}
        </div>
      )}
      {!error &&
        (!record ? (
          <div className="loading-state">Loading guardian profile…</div>
        ) : (
          <>
            <section className="panel profile-panel">
              <div className="panel-heading">
                <div className="profile-identity">
                  <span className="banner-icon">
                    <Users size={28} />
                  </span>
                  <div>
                    <h2>{record.fullName}</h2>
                    <p>Parent / guardian contact profile</p>
                  </div>
                </div>
                <StatusBadge status={record.status} />
              </div>
              <div className="profile-form">
                <dl className="details staff-details">
                  {guardianFields.map((field) => (
                    <div key={field.name}>
                      <dt>{field.label}</dt>
                      <dd>
                        {field.name === "gender"
                          ? studentLabels[record.gender]
                          : record[field.name] || "Not recorded"}
                      </dd>
                    </div>
                  ))}
                </dl>
                <GuardianStatusAction
                  record={record}
                  onUpdated={() => {
                    setNotice(
                      "Guardian status updated. Existing relationships retained.",
                    );
                    load();
                  }}
                />
              </div>
            </section>
            <GuardianRelationships
              key={id}
              guardianId={id}
              status={record.status}
            />
          </>
        ))}
      {editing && record && (
        <GuardianForm
          record={record}
          onClose={() => setEditing(false)}
          onSaved={(updated) => {
            setRecord(updated);
            setEditing(false);
            setNotice("Guardian profile saved successfully.");
          }}
        />
      )}
    </>
  );
}
