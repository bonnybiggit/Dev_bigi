import { useState } from "react";
import Modal from "./Modal";
import ConfigurationFields from "./ConfigurationFields";
import { guardianFields, guardianFormValues } from "../lib/guardians";
import { configurationError } from "../lib/academicConfiguration";
import { api } from "../lib/api";
export default function GuardianForm({ record, onClose, onSaved }) {
  const [values, setValues] = useState(() => guardianFormValues(record));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { data } = await api[record ? "put" : "post"](
        `/school/guardians${record ? `/${record._id}` : ""}`,
        values,
      );
      onSaved(data.record);
    } catch (e) {
      setError(configurationError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={record ? "Edit parent / guardian" : "Register parent / guardian"}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form className="modal-body" onSubmit={submit}>
        <p className="muted form-description">
          {record
            ? "Update the contact profile. Student links and profile status are managed separately."
            : "Create a contact profile, then link students. No login account will be created."}{" "}
          Emergency contacts are optional; provide both name and phone if used.
        </p>
        <fieldset className="staff-form-fields" disabled={busy}>
          <ConfigurationFields
            fields={guardianFields}
            values={values}
            onChange={(event) =>
              setValues({ ...values, [event.target.name]: event.target.value })
            }
          />
        </fieldset>
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        <div className="button-row">
          <button
            className="btn secondary"
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? "Saving…" : "Save profile"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
