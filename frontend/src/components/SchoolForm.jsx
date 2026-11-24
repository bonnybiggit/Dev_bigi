import { useState } from "react";
import Modal from "./Modal";
import { api, errorMessage } from "../lib/api";
const blank = {
  name: "",
  city: "",
  country: "Nigeria",
  schoolType: "Nursery and Primary",
};
export default function SchoolForm({ onClose, onCreated }) {
  const [values, setValues] = useState(blank);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const change = (e) =>
    setValues({ ...values, [e.target.name]: e.target.value });
  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api.post("/schools", values);
      onCreated();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Register a school" onClose={onClose}>
      <form className="modal-body" onSubmit={submit}>
        <p className="muted form-description">
          Add a school to your network. New schools start with active status.
        </p>
        <button
          type="button"
          className="sample-button"
          onClick={() =>
            setValues({
              name: "Bright Future International School",
              city: "Lagos",
              country: "Nigeria",
              schoolType: "Nursery and Primary",
            })
          }
        >
          Use Bright Future sample details
        </button>
        <label htmlFor="school-name">School name</label>
        <input
          id="school-name"
          name="name"
          value={values.name}
          onChange={change}
          minLength={2}
          maxLength={160}
          required
          placeholder="e.g. Bright Future International School"
        />
        <div className="form-grid">
          <div>
            <label htmlFor="city">City</label>
            <input
              id="city"
              name="city"
              value={values.city}
              onChange={change}
              minLength={2}
              maxLength={80}
              required
            />
          </div>
          <div>
            <label htmlFor="country">Country</label>
            <input
              id="country"
              name="country"
              value={values.country}
              onChange={change}
              minLength={2}
              maxLength={80}
              required
            />
          </div>
        </div>
        <label htmlFor="schoolType">School type</label>
        <select
          id="schoolType"
          name="schoolType"
          value={values.schoolType}
          onChange={change}
        >
          {[
            "Nursery",
            "Primary",
            "Nursery and Primary",
            "Secondary",
            "Other",
          ].map((type) => (
            <option key={type}>{type}</option>
          ))}
        </select>
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        <div className="modal-actions">
          <button type="button" className="btn secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? "Registering…" : "Register school"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
