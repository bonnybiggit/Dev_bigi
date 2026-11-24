import { useState } from "react";
import Modal from "./Modal";
import ConfigurationFields from "./ConfigurationFields";
import ConfirmationDialog from "./ConfirmationDialog";
import {
  studentFormValues,
  studentPersonalFields,
  placementFields,
  studentLabels,
} from "../lib/students";
import { api } from "../lib/api";
import { configurationError } from "../lib/academicConfiguration";
export default function StudentForm({ record, options, onClose, onSaved }) {
  const [values, setValues] = useState(() => studentFormValues(record));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  function change(event) {
    const { name, value } = event.target;
    setValues((previous) => ({
      ...previous,
      [name]: value,
      ...(name === "classId" ? { arm: "" } : {}),
    }));
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      const { data } = await api[record ? "put" : "post"](
        `/school/students${record ? `/${record._id}` : ""}`,
        values,
      );
      onSaved(data.record);
    } catch (e) {
      setError(configurationError(e));
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  }
  function submit(event) {
    event.preventDefault();
    if (
      record &&
      (record.admissionStatus !== values.admissionStatus ||
        record.sessionId !== values.sessionId ||
        record.classId !== values.classId ||
        record.arm !== values.arm)
    )
      setConfirm(true);
    else save();
  }
  return (
    <>
      <Modal
        title={record ? "Edit student" : "Register student"}
        onClose={() => {
          if (!busy && !confirm) onClose();
        }}
      >
        <form className="modal-body" onSubmit={submit}>
          <p className="muted form-description">
            {record
              ? "Update this student profile. Use the separate status controls to activate, deactivate, or archive."
              : "Register a student in your school. New student records start active."}
          </p>
          <fieldset className="staff-form-fields" disabled={busy}>
            <ConfigurationFields
              fields={studentPersonalFields}
              values={values}
              onChange={change}
            />
            <section className="staff-assignments">
              <h3>Academic placement</h3>
              <ConfigurationFields
                fields={placementFields(options, values, record)}
                values={values}
                onChange={change}
              />
            </section>
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
              {busy ? "Saving…" : "Save student"}
            </button>
          </div>
        </form>
      </Modal>
      {confirm && (
        <ConfirmationDialog
          title="Confirm admission changes"
          description={`Save the new academic placement and admission status (${studentLabels[values.admissionStatus]})? Review the selected session, class, and arm before confirming.`}
          busy={busy}
          onClose={() => setConfirm(false)}
          onConfirm={save}
        />
      )}
    </>
  );
}
