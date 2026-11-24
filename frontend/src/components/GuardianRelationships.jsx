import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Link2 } from "lucide-react";
import { api } from "../lib/api";
import { configurationError } from "../lib/academicConfiguration";
import { studentName } from "../lib/students";
import { relationshipLabels } from "../lib/guardians";
import Modal from "./Modal";
import EntityPicker from "./EntityPicker";
import ConfirmationDialog from "./ConfirmationDialog";
import { StatusBadge } from "./SchoolTable";

export default function GuardianRelationships({
  guardianId,
  studentId,
  status,
}) {
  const guardianView = !!guardianId;
  const [records, setRecords] = useState(null);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [editor, setEditor] = useState(null);
  const [selected, setSelected] = useState(null);
  const [relationship, setRelationship] = useState("guardian");
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);
  const endpoint = guardianView
    ? `/school/guardians/${guardianId}/students`
    : `/school/students/${studentId}/guardians`;
  const load = useCallback(async () => {
    setError("");
    try {
      const { data } = await api.get(endpoint);
      setRecords(data.records);
    } catch (e) {
      setError(configurationError(e));
    }
  }, [endpoint]);
  useEffect(() => {
    setRecords(null);
    load();
  }, [load]);
  const canAdd = guardianView ? status === "active" : status !== "archived";
  function open(record) {
    setFormError("");
    setSelected(null);
    setRelationship(record?.relationship || "guardian");
    setEditor({ record });
  }
  function path(record) {
    return `/school/guardians/${record.guardianId}/students/${record.studentId}`;
  }
  async function save(event) {
    event.preventDefault();
    if (!editor.record && !selected)
      return setFormError("Select a profile to link first.");
    setBusy(true);
    setFormError("");
    const pair = editor.record || {
      guardianId: guardianId || selected._id,
      studentId: studentId || selected._id,
    };
    try {
      await api[editor.record ? "put" : "post"](path(pair), { relationship });
      setEditor(null);
      setNotice("Relationship saved successfully.");
      await load();
    } catch (e) {
      setFormError(configurationError(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    setFormError("");
    try {
      await api.delete(path(removing));
      setRemoving(null);
      setNotice(
        "Relationship removed. Both profiles and the relationship history are retained.",
      );
      await load();
    } catch (e) {
      setFormError(configurationError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel guardian-relationships">
      <div className="panel-heading">
        <div>
          <h2>{guardianView ? "Linked children" : "Parents & guardians"}</h2>
          <p>
            {guardianView
              ? "Students associated with this contact profile."
              : "School-recorded guardian contacts for this student."}
          </p>
        </div>
        <button
          className="btn primary"
          disabled={!canAdd || !records}
          onClick={() => open(null)}
        >
          <Plus size={17} />
          {guardianView ? "Link student" : "Link guardian"}
        </button>
      </div>
      {!canAdd && (
        <p className="relationship-note">
          {guardianView
            ? "Activate this guardian before adding student links."
            : "Restore the archived student before adding or editing relationships."}
        </p>
      )}
      {notice && (
        <div className="alert success" role="status">
          {notice}
        </div>
      )}
      {error ? (
        <div className="alert error" role="alert">
          {error}
          <button onClick={load}>Retry</button>
        </div>
      ) : records === null ? (
        <div className="loading-state">Loading relationships…</div>
      ) : !records.length ? (
        <div className="empty-state">
          <Link2 size={28} />
          <h3>No relationships yet</h3>
          <p>
            Link an existing {guardianView ? "student" : "guardian"} in your
            school.
          </p>
        </div>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{guardianView ? "Student" : "Guardian"}</th>
                <th>{guardianView ? "Admission number" : "Contact"}</th>
                <th>Relationship</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {records.map((link) => (
                <tr key={`${link.guardianId}-${link.studentId}`}>
                  <td>
                    <Link
                      className="text-link"
                      to={`/school/${guardianView ? "students" : "guardians"}/${link.record._id}`}
                    >
                      {guardianView
                        ? studentName(link.record)
                        : link.record.fullName}
                    </Link>
                  </td>
                  <td>
                    {guardianView ? (
                      link.record.admissionNumber
                    ) : (
                      <>
                        {link.record.primaryPhone}
                        {link.record.email && (
                          <span className="staff-secondary">
                            {link.record.email}
                          </span>
                        )}
                      </>
                    )}
                  </td>
                  <td>{relationshipLabels[link.relationship]}</td>
                  <td>
                    <StatusBadge status={link.record.status} />
                  </td>
                  <td>
                    <div className="table-actions">
                      <button
                        className="text-link"
                        disabled={
                          busy ||
                          (!guardianView && status === "archived") ||
                          (guardianView && link.record.status === "archived")
                        }
                        onClick={() => open(link)}
                      >
                        Edit
                      </button>
                      <button
                        className="text-link"
                        disabled={busy}
                        onClick={() => {
                          setFormError("");
                          setRemoving(link);
                        }}
                      >
                        Remove link
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editor && (
        <Modal
          title={
            editor.record
              ? "Edit relationship"
              : guardianView
                ? "Link student"
                : "Link guardian"
          }
          onClose={() => {
            if (!busy) setEditor(null);
          }}
        >
          <form className="modal-body" onSubmit={save}>
            {!editor.record && (
              <EntityPicker
                kind={guardianView ? "students" : "guardians"}
                selected={selected}
                disabled={busy}
                onSelect={setSelected}
              />
            )}
            <label htmlFor="guardian-relationship">
              Relationship to student
            </label>
            <select
              id="guardian-relationship"
              value={relationship}
              disabled={busy}
              onChange={(event) => setRelationship(event.target.value)}
            >
              {Object.entries(relationshipLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            {formError && (
              <div className="alert error" role="alert">
                {formError}
              </div>
            )}
            <div className="button-row">
              <button
                className="btn secondary"
                type="button"
                disabled={busy}
                onClick={() => setEditor(null)}
              >
                Cancel
              </button>
              <button className="btn primary" disabled={busy}>
                {busy ? "Saving…" : "Save relationship"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {removing && (
        <ConfirmationDialog
          title="Remove relationship"
          description="Remove this guardian–student link? Both profiles and any other links remain intact. The relationship record will be retained as removed."
          busy={busy}
          error={formError}
          onClose={() => setRemoving(null)}
          onConfirm={remove}
        />
      )}
    </section>
  );
}
