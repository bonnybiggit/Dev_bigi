import { useState } from "react";
import Modal from "./Modal";
import { StatusBadge } from "./SchoolTable";
import { api } from "../lib/api";
import { configurationError } from "../lib/academicConfiguration";
export default function FinanceOptionManager({ kind, records, onSaved }) {
  const [editor, setEditor] = useState(null),
    [name, setName] = useState(""),
    [status, setStatus] = useState("active"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const title = kind === "categories" ? "Fee categories" : "Payment methods";
  function open(record) {
    setName(record?.name || "");
    setStatus(record?.status || "active");
    setError("");
    setEditor({ record });
  }
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api[editor.record ? "put" : "post"](
        `/school/finance/${kind}${editor.record ? `/${editor.record._id}` : ""}`,
        { name: name.trim(), status },
      );
      setEditor(null);
      onSaved();
    } catch (e) {
      setError(configurationError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel finance-option-panel">
      <div className="panel-heading">
        <h2>{title}</h2>
        <button className="btn secondary" onClick={() => open(null)}>
          Add {kind === "categories" ? "category" : "method"}
        </button>
      </div>
      {!records.length ? (
        <div className="empty-state">
          <p>No {title.toLowerCase()} yet.</p>
        </div>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record._id}>
                  <td>{record.name}</td>
                  <td>
                    <StatusBadge status={record.status} />
                  </td>
                  <td>
                    {record.builtin ? (
                      "Built-in"
                    ) : (
                      <button
                        className="text-link action-link"
                        onClick={() => open(record)}
                      >
                        Edit
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editor && (
        <Modal
          title={`Manage ${kind === "categories" ? "fee category" : "payment method"}`}
          onClose={() => {
            if (!busy) setEditor(null);
          }}
        >
          <form className="modal-body" onSubmit={submit}>
            <label htmlFor="finance-option-name">Name</label>
            <input
              id="finance-option-name"
              value={name}
              minLength={2}
              maxLength={100}
              required
              disabled={busy}
              onChange={(event) => setName(event.target.value)}
            />
            <label htmlFor="finance-option-status">Status</label>
            <select
              id="finance-option-status"
              value={status}
              disabled={busy}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <p className="field-help">
              Previously issued invoices and receipts retain their original
              labels and amounts.
            </p>
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
                onClick={() => setEditor(null)}
              >
                Cancel
              </button>
              <button className="btn primary" disabled={busy}>
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  );
}
