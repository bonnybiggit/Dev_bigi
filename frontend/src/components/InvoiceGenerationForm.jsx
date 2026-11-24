import { useEffect, useState } from "react";
import Modal from "./Modal";
import EntityPicker from "./EntityPicker";
import { api } from "../lib/api";
import { configurationError } from "../lib/academicConfiguration";
import { money } from "../lib/finance";
export default function InvoiceGenerationForm({ onClose, onSaved }) {
  const [student, setStudent] = useState(null),
    [structures, setStructures] = useState(null),
    [structureId, setStructureId] = useState(""),
    [optional, setOptional] = useState([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (!student) return;
    const controller = new AbortController();
    setStructures(null);
    setStructureId("");
    setOptional([]);
    api
      .get("/school/finance/structures", {
        params: {
          sessionId: student.sessionId,
          classId: student.classId,
          limit: 50,
        },
        signal: controller.signal,
      })
      .then(({ data }) => setStructures(data.records))
      .catch((e) => {
        if (e.code !== "ERR_CANCELED") setError(configurationError(e));
      });
    return () => controller.abort();
  }, [student]);
  const structure = structures?.find((item) => item._id === structureId);
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post("/school/finance/invoices", {
        studentId: student._id,
        structureId,
        optionalCategoryIds: optional,
      });
      onSaved(data.record);
    } catch (e) {
      setError(configurationError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Generate student invoice"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form className="modal-body" onSubmit={submit}>
        <p className="muted form-description">
          Choose an active student and their session/class fee structure. Only
          one invoice is allowed per student, session and term.
        </p>
        <EntityPicker
          kind="students"
          selected={student}
          disabled={busy}
          onSelect={(record) => {
            setError("");
            setStudent(record);
          }}
        />
        {student &&
          (structures === null ? (
            <p className="field-help">Loading fee structures…</p>
          ) : !structures.length ? (
            <p className="field-help">
              No current fee structure matches this student's session and class.
              Configure one first.
            </p>
          ) : (
            <>
              <label htmlFor="invoice-structure">Fee structure / term</label>
              <select
                id="invoice-structure"
                value={structureId}
                required
                disabled={busy}
                onChange={(event) => {
                  setStructureId(event.target.value);
                  setOptional([]);
                }}
              >
                <option value="">Select fee period</option>
                {structures.map((item) => (
                  <option key={item._id} value={item._id}>
                    {item.sessionName} · {item.termName} · {item.className} · v
                    {item.revision}
                  </option>
                ))}
              </select>
              {structure?.lines.map((line) => (
                <label className="finance-check" key={line.categoryId}>
                  <input
                    type="checkbox"
                    checked={
                      line.compulsory || optional.includes(line.categoryId)
                    }
                    disabled={busy || line.compulsory}
                    onChange={(event) =>
                      setOptional((previous) =>
                        event.target.checked
                          ? [...previous, line.categoryId]
                          : previous.filter((id) => id !== line.categoryId),
                      )
                    }
                  />
                  <span>
                    {line.categoryName} · {money(line.amountMinor)} ·{" "}
                    {line.compulsory ? "Compulsory" : "Optional"}
                  </span>
                </label>
              ))}
            </>
          ))}
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
            disabled={busy || !student || !structureId}
          >
            {busy ? "Generating…" : "Generate invoice"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
