import { useState } from "react";
import { Link } from "react-router-dom";
import Modal from "./Modal";
import ConfigurationFields from "./ConfigurationFields";
import { staffFields, staffFormValues } from "../lib/staff";
import { api } from "../lib/api";
import { configurationError } from "../lib/academicConfiguration";

export default function StaffForm({
  record,
  classes,
  subjects,
  onClose,
  onSaved,
}) {
  const [values, setValues] = useState(() => staffFormValues(record));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  function change(event) {
    const { name, value } = event.target;
    setValues((previous) => ({
      ...previous,
      [name]: value,
      ...(name === "category" && value === "non_teaching"
        ? { classIds: [], subjectIds: [] }
        : {}),
    }));
  }
  function toggleClass(id) {
    const classIds = values.classIds.includes(id)
      ? values.classIds.filter((value) => value !== id)
      : [...values.classIds, id];
    setValues({
      ...values,
      classIds,
      subjectIds: values.subjectIds.filter((id) =>
        subjects.some(
          (subject) => subject._id === id && classIds.includes(subject.classId),
        ),
      ),
    });
  }
  function toggleSubject(id) {
    setValues({
      ...values,
      subjectIds: values.subjectIds.includes(id)
        ? values.subjectIds.filter((value) => value !== id)
        : [...values.subjectIds, id],
    });
  }
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api[record ? "put" : "post"](
        `/school/staff${record ? `/${record._id}` : ""}`,
        values,
      );
      onSaved();
    } catch (e) {
      setError(configurationError(e));
    } finally {
      setBusy(false);
    }
  }
  const visibleSubjects = subjects.filter(
    (subject) =>
      values.classIds.includes(subject.classId) ||
      values.subjectIds.includes(subject._id),
  );
  return (
    <Modal
      title={record ? "Edit staff record" : "Add staff member"}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form className="modal-body" onSubmit={submit}>
        <p className="muted form-description">
          {record
            ? "Update this school staff profile. Use the status action to activate or deactivate it."
            : "New staff records start active. This does not create a login account."}
        </p>
        <fieldset className="staff-form-fields" disabled={busy}>
          <ConfigurationFields
            fields={staffFields}
            values={values}
            onChange={change}
          />
          {values.category === "teaching" && (
            <section className="staff-assignments">
              <h3>Teaching assignments</h3>
              {record?.assignmentMode === "explicit" && (
                <p>
                  Legacy arrays are retained read-only.{" "}
                  <Link to="/school/teacher-assignments">
                    Manage period-aware assignments
                  </Link>
                </p>
              )}
              <p className="field-help">
                Optional. Choose classes, then subjects from those classes.
                Existing inactive assignments are retained until removed.
              </p>
              <fieldset disabled={record?.assignmentMode === "explicit"}>
                <legend>Assigned classes</legend>
                {!classes.length ? (
                  <p className="muted">
                    No classes yet.{" "}
                    <Link className="text-link" to="/school/classes">
                      Manage classes
                    </Link>
                  </p>
                ) : (
                  <div className="assignment-options">
                    {classes.map((item) => (
                      <label key={item._id}>
                        <input
                          type="checkbox"
                          checked={values.classIds.includes(item._id)}
                          disabled={
                            item.status !== "active" &&
                            !values.classIds.includes(item._id)
                          }
                          onChange={() => toggleClass(item._id)}
                        />
                        <span>
                          {item.name}
                          {item.status !== "active" ? " (inactive)" : ""}
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </fieldset>
              <fieldset>
                <legend>Assigned subjects</legend>
                {!visibleSubjects.length ? (
                  <p className="field-help">
                    Select a class with configured subjects, or{" "}
                    <Link className="text-link" to="/school/subjects">
                      manage subjects
                    </Link>
                    .
                  </p>
                ) : (
                  <div className="assignment-options">
                    {visibleSubjects.map((item) => {
                      const assigned = values.subjectIds.includes(item._id);
                      const parent = classes.find(
                        (record) => record._id === item.classId,
                      );
                      return (
                        <label key={item._id}>
                          <input
                            type="checkbox"
                            checked={assigned}
                            disabled={
                              !assigned &&
                              (item.status !== "active" ||
                                parent?.status !== "active")
                            }
                            onChange={() => toggleSubject(item._id)}
                          />
                          <span>
                            {item.name} · {parent?.name || "Unavailable class"}
                            {item.status !== "active" ? " (inactive)" : ""}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </fieldset>
            </section>
          )}
        </fieldset>
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        <div className="button-row">
          <button
            type="button"
            className="btn secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? "Saving…" : "Save staff record"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
