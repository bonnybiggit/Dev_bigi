import { useState } from "react";
import ConfirmationDialog from "./ConfirmationDialog";
import { api } from "../lib/api";
import { configurationError } from "../lib/academicConfiguration";
export default function GuardianStatusAction({ record, onUpdated }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const verb = record.status === "active" ? "Deactivate" : "Activate";
  async function confirm() {
    setBusy(true);
    setError("");
    try {
      await api.patch(`/school/guardians/${record._id}/status`, {
        status: record.status === "active" ? "inactive" : "active",
      });
      setOpen(false);
      onUpdated();
    } catch (e) {
      setError(configurationError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        className="text-link action-link"
        onClick={() => {
          setError("");
          setOpen(true);
        }}
      >
        {verb}
      </button>
      {open && (
        <ConfirmationDialog
          title={`${verb} guardian`}
          description={`${verb} ${record.fullName}? Their profile and all existing student relationships will be retained. Inactive guardians cannot receive new student links. This does not change any login account.`}
          busy={busy}
          error={error}
          onClose={() => setOpen(false)}
          onConfirm={confirm}
        />
      )}
    </>
  );
}
