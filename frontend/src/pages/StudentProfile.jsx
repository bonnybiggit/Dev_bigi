import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { UserRound, Pencil } from "lucide-react";
import { api } from "../lib/api";
import { configurationError } from "../lib/academicConfiguration";
import {
  studentName,
  studentLabels,
  studentPersonalFields,
} from "../lib/students";
import useStudentOptions from "../hooks/useStudentOptions";
import { StatusBadge } from "../components/SchoolTable";
import StudentForm from "../components/StudentForm";
import StudentStatusActions from "../components/StudentStatusActions";
import GuardianRelationships from "../components/GuardianRelationships";
export default function StudentProfile() {
  const { id } = useParams();
  const [record, setRecord] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState(false);
  const { options, error: optionsError, reload } = useStudentOptions();
  const load = useCallback(async () => {
    setError("");
    try {
      const { data } = await api.get(`/school/students/${id}`);
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
          <div className="eyebrow">STUDENTS & ADMISSIONS</div>
          <h1>Student profile</h1>
          <p>
            <Link className="text-link" to="/school/students">
              Return to student directory
            </Link>
          </p>
        </div>
        {record && record.status !== "archived" && (
          <button
            className="btn primary"
            disabled={!options}
            onClick={() => setEditing(true)}
          >
            <Pencil size={17} />
            Edit student
          </button>
        )}
      </div>
      {error && (
        <div className="alert error" role="alert">
          {error}
          <button onClick={load}>Retry</button>
        </div>
      )}
      {optionsError && (
        <div className="alert error" role="alert">
          {optionsError}
          <button onClick={reload}>Reload placement options</button>
        </div>
      )}
      {notice && (
        <div className="alert success" role="status">
          {notice}
        </div>
      )}
      {!error &&
        (!record ? (
          <div className="loading-state">Loading student profile…</div>
        ) : (
          <section className="panel profile-panel">
            <div className="panel-heading">
              <div className="profile-identity">
                <span className="banner-icon">
                  <UserRound size={29} />
                </span>
                <div>
                  <h2>{studentName(record)}</h2>
                  <p>{record.admissionNumber}</p>
                </div>
              </div>
              <StatusBadge status={record.status} />
            </div>
            <div className="profile-form">
              <dl className="details staff-details">
                {studentPersonalFields.map((field) => (
                  <div key={field.name}>
                    <dt>{field.label}</dt>
                    <dd>
                      {field.type === "date"
                        ? record[field.name].slice(0, 10)
                        : studentLabels[record[field.name]] ||
                          record[field.name] ||
                          "Not recorded"}
                    </dd>
                  </div>
                ))}
                <div>
                  <dt>Academic session</dt>
                  <dd>
                    {options?.sessions.find(
                      (item) => item._id === record.sessionId,
                    )?.name || "Loading…"}
                  </dd>
                </div>
                <div>
                  <dt>Class / arm</dt>
                  <dd>
                    {options?.classes.find(
                      (item) => item._id === record.classId,
                    )?.name || "Loading…"}
                    {record.arm ? ` / ${record.arm}` : ""}
                  </dd>
                </div>
                <div>
                  <dt>Admission status</dt>
                  <dd>{studentLabels[record.admissionStatus]}</dd>
                </div>
              </dl>
              <StudentStatusActions
                record={record}
                onUpdated={() => {
                  setNotice("Student status updated.");
                  load();
                }}
              />
            </div>
          </section>
        ))}
      {!error && record && (
        <GuardianRelationships key={id} studentId={id} status={record.status} />
      )}
      {editing && record && options && (
        <StudentForm
          record={record}
          options={options}
          onClose={() => setEditing(false)}
          onSaved={(updated) => {
            setRecord(updated);
            setEditing(false);
            setNotice("Student information saved successfully.");
          }}
        />
      )}
    </>
  );
}
