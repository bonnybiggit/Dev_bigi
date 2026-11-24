import { useState } from "react";
import Modal from "./Modal";
import { api } from "../lib/api";
import { configurationError } from "../lib/academicConfiguration";
import { amountText } from "../lib/finance";
export default function FeeStructureForm({
  record,
  context,
  onClose,
  onSaved,
}) {
  const [values, setValues] = useState({
    sessionId: record?.sessionId || "",
    termId: record?.termId || "",
    classId: record?.classId || "",
  });
  const [lines, setLines] = useState(() =>
    Object.fromEntries(
      (record?.lines || []).map((line) => [
        line.categoryId,
        { amount: amountText(line.amountMinor), compulsory: line.compulsory },
      ]),
    ),
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api[record ? "put" : "post"](
        `/school/finance/structures${record ? `/${record._id}` : ""}`,
        {
          ...values,
          ...(record ? { revision: record.revision } : {}),
          lines: Object.entries(lines).map(([categoryId, line]) => ({
            categoryId,
            ...line,
          })),
        },
      );
      onSaved();
    } catch (e) {
      setError(configurationError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={record ? "Edit fee structure" : "Create fee structure"}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form className="modal-body" onSubmit={save}>
        <p className="muted form-description">
          Editing an invoiced structure creates a new version. Existing invoices
          retain their original fee lines.
        </p>
        <fieldset className="staff-form-fields" disabled={busy}>
          <label htmlFor="structure-session">Session</label>
          <select
            id="structure-session"
            value={values.sessionId}
            required
            disabled={!!record}
            onChange={(event) =>
              setValues({
                ...values,
                sessionId: event.target.value,
                termId: "",
              })
            }
          >
            <option value="">Select session</option>
            {context.sessions.map((item) => (
              <option key={item._id} value={item._id}>
                {item.name}
              </option>
            ))}
          </select>
          <label htmlFor="structure-term">Term</label>
          <select
            id="structure-term"
            value={values.termId}
            required
            disabled={!!record}
            onChange={(event) =>
              setValues({ ...values, termId: event.target.value })
            }
          >
            <option value="">Select term</option>
            {context.terms
              .filter((item) => item.sessionId === values.sessionId)
              .map((item) => (
                <option key={item._id} value={item._id}>
                  {item.name}
                </option>
              ))}
          </select>
          <label htmlFor="structure-class">Class</label>
          <select
            id="structure-class"
            value={values.classId}
            required
            disabled={!!record}
            onChange={(event) =>
              setValues({ ...values, classId: event.target.value })
            }
          >
            <option value="">Select class</option>
            {context.classes.map((item) => (
              <option key={item._id} value={item._id}>
                {item.name}
              </option>
            ))}
          </select>
          <h3 className="finance-form-heading">Fee lines · NGN</h3>
          {context.categories.map((category) => (
            <div className="fee-line-editor" key={category._id}>
              <label>
                <input
                  type="checkbox"
                  checked={!!lines[category._id]}
                  disabled={
                    category.status !== "active" && !lines[category._id]
                  }
                  onChange={(event) =>
                    setLines((previous) => {
                      const next = { ...previous };
                      if (event.target.checked)
                        next[category._id] = { amount: "", compulsory: true };
                      else delete next[category._id];
                      return next;
                    })
                  }
                />
                {category.name}
                {category.status !== "active" ? " (inactive)" : ""}
              </label>
              {lines[category._id] && (
                <>
                  <input
                    aria-label={`${category.name} amount in naira`}
                    placeholder="0.00"
                    inputMode="decimal"
                    value={lines[category._id].amount}
                    required
                    pattern="[0-9]+([.][0-9]{1,2})?"
                    onChange={(event) =>
                      setLines({
                        ...lines,
                        [category._id]: {
                          ...lines[category._id],
                          amount: event.target.value,
                        },
                      })
                    }
                  />
                  <label>
                    <input
                      type="checkbox"
                      checked={lines[category._id].compulsory}
                      onChange={(event) =>
                        setLines({
                          ...lines,
                          [category._id]: {
                            ...lines[category._id],
                            compulsory: event.target.checked,
                          },
                        })
                      }
                    />
                    Compulsory
                  </label>
                </>
              )}
            </div>
          ))}
        </fieldset>
        {!context.categories.length && (
          <p className="field-help">Create an active fee category first.</p>
        )}
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
          <button
            className="btn primary"
            disabled={busy || !Object.keys(lines).length}
          >
            {busy ? "Saving…" : "Save structure"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
