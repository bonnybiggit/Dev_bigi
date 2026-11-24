import { useState } from "react";
import Modal from "./Modal";
import { StatusBadge } from "./SchoolTable";
import { api, errorMessage } from "../lib/api";
import AdministratorManagement from "./AdministratorManagement";
export default function SchoolDetails({ school, onClose, onUpdate }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  async function changeStatus() {
    setBusy(true);
    setError("");
    try {
      const { data } = await api.patch(`/schools/${school._id}/status`, {
        status: school.status === "active" ? "suspended" : "active",
      });
      onUpdate(data.school);
      setConfirm(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="School details" onClose={onClose}>
      <div className="modal-body">
        <h3>{school.name}</h3>
        <dl className="details">
          <div>
            <dt>Location</dt>
            <dd>
              {school.city}, {school.country}
            </dd>
          </div>
          <div>
            <dt>School type</dt>
            <dd>{school.schoolType}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>
              <StatusBadge status={school.status} />
            </dd>
          </div>
          <div>
            <dt>Registered</dt>
            <dd>{new Date(school.createdAt).toLocaleDateString("en-GB")}</dd>
          </div>
        </dl>
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        {confirm ? (
          <div className="confirmation">
            <p>
              {school.status === "active"
                ? "Suspend this school? School accounts will lose access until it is reactivated."
                : "Reactivate this school and restore school account access?"}
            </p>
            <div className="button-row">
              <button
                className="btn secondary"
                disabled={busy}
                onClick={() => setConfirm(false)}
              >
                Cancel
              </button>
              <button
                className="btn primary"
                disabled={busy}
                onClick={changeStatus}
              >
                {busy ? "Updating…" : "Confirm status change"}
              </button>
            </div>
          </div>
        ) : (
          <button
            className={`btn ${school.status === "active" ? "danger" : "primary"}`}
            onClick={() => setConfirm(true)}
          >
            {school.status === "active" ? "Suspend school" : "Activate school"}
          </button>
        )}
        <AdministratorManagement schoolId={school._id} />
      </div>
    </Modal>
  );
}
