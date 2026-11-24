import { useState } from "react";
import ConfirmationDialog from "./ConfirmationDialog";
import { studentName } from "../lib/students";
import { api } from "../lib/api";
import { configurationError } from "../lib/academicConfiguration";
export default function StudentStatusActions({ record, onUpdated }) {
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function confirm() {
    setBusy(true);
    setError("");
    try {
      await api.patch(`/school/students/${record._id}/status`, {
        status: target,
      });
      setTarget("");
      onUpdated();
    } catch (e) {
      setError(configurationError(e));
    } finally {
      setBusy(false);
    }
  }
  const verb =
    target === "archived"
      ? "Archive"
      : record.status === "archived"
        ? "Restore to inactive"
        : target === "active"
          ? "Activate"
          : "Deactivate";
  return (
    <>
      <div className="table-actions">
        {record.status === "archived" ? (
          <button
            className="text-link"
            onClick={() => {
              setError("");
              setTarget("inactive");
            }}
          >
            Restore
          </button>
        ) : (
          <>
            <button
              className="text-link"
              onClick={() => {
                setError("");
                setTarget(record.status === "active" ? "inactive" : "active");
              }}
            >
              {record.status === "active" ? "Deactivate" : "Activate"}
            </button>
            <button
              className="text-link"
              onClick={() => {
                setError("");
                setTarget("archived");
              }}
            >
              Archive
            </button>
          </>
        )}
      </div>
      {target && (
        <ConfirmationDialog
          title={`${verb} student`}
          description={`${verb} ${studentName(record)}? Student information, admission number, and linked records will be retained. Archived records are read-only until restored to inactive. Activation requires a currently active placement.`}
          error={error}
          busy={busy}
          onClose={() => setTarget("")}
          onConfirm={confirm}
        />
      )}
    </>
  );
}
