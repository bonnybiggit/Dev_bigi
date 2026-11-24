import { useRef, useState } from "react";
import Modal from "./Modal";
import ConfirmationDialog from "./ConfirmationDialog";
import { api } from "../lib/api";
import { configurationError } from "../lib/academicConfiguration";
import { amountText, money } from "../lib/finance";
import { attendanceToday } from "../lib/attendance";
export default function FinanceTransactionForm({
  invoice,
  methods = [],
  payment,
  reversal,
  onClose,
  onSaved,
}) {
  const key = useRef(crypto.randomUUID());
  const [values, setValues] = useState({
    amount: payment ? amountText(invoice.balanceMinor) : "",
    methodId: "cash",
    paidOn: attendanceToday(),
    externalReference: "",
    kind: "discount",
    reason: "",
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [confirm, setConfirm] = useState(false);
  function change(event) {
    setValues({ ...values, [event.target.name]: event.target.value });
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      let response;
      if (reversal)
        response = await api.post(
          `/school/finance/payments/${reversal._id}/reverse`,
          { reason: values.reason.trim() },
        );
      else if (payment)
        response = await api.post("/school/finance/payments", {
          invoiceId: invoice._id,
          amount: values.amount.trim(),
          methodId: values.methodId,
          paidOn: values.paidOn,
          externalReference: values.externalReference.trim(),
          requestKey: key.current,
        });
      else
        response = await api.post(
          `/school/finance/invoices/${invoice._id}/entries`,
          {
            kind: values.kind,
            amount: values.amount.trim(),
            reason: values.reason.trim(),
            revision: invoice.revision,
            requestKey: key.current,
          },
        );
      setConfirm(false);
      onSaved(response.data.record);
    } catch (e) {
      setError(configurationError(e));
      setConfirm(false);
    } finally {
      setBusy(false);
    }
  }
  const title = reversal
    ? "Reverse payment"
    : payment
      ? "Record payment"
      : "Discount or adjustment";
  return (
    <>
      <Modal
        title={title}
        onClose={() => {
          if (!busy && !confirm) onClose();
        }}
      >
        <form
          className="modal-body"
          onSubmit={(event) => {
            event.preventDefault();
            setError("");
            setConfirm(true);
          }}
        >
          <p className="muted form-description">
            {reversal
              ? `${reversal.reference} · ${money(reversal.amountMinor)}. The original payment and receipt will remain, marked reversed. The invoice balance will reopen.`
              : `${invoice.reference} · Outstanding: ${money(invoice.balanceMinor)}`}
          </p>
          <fieldset className="staff-form-fields" disabled={busy}>
            {!payment && !reversal && (
              <>
                <label htmlFor="finance-entry-kind">Entry type</label>
                <select
                  id="finance-entry-kind"
                  name="kind"
                  value={values.kind}
                  onChange={change}
                >
                  <option value="discount">Discount</option>
                  <option value="scholarship">Scholarship</option>
                  <option value="adjustment">Adjustment</option>
                </select>
                <p className="field-help">
                  Discounts and scholarships use positive amounts. A positive
                  adjustment adds charges; a negative adjustment credits fees.
                  Overpayments and credits exceeding the balance are blocked.
                </p>
              </>
            )}
            {!reversal && (
              <>
                <label htmlFor="finance-amount">Amount (NGN)</label>
                <input
                  id="finance-amount"
                  name="amount"
                  inputMode="decimal"
                  placeholder="0.00"
                  required
                  value={values.amount}
                  onChange={change}
                  pattern={
                    payment || values.kind !== "adjustment"
                      ? "[0-9]+([.][0-9]{1,2})?"
                      : "-?[0-9]+([.][0-9]{1,2})?"
                  }
                />
              </>
            )}
            {payment && (
              <>
                <label htmlFor="finance-method">Payment method</label>
                <select
                  id="finance-method"
                  name="methodId"
                  required
                  value={values.methodId}
                  onChange={change}
                >
                  {methods
                    .filter((method) => method.status === "active")
                    .map((method) => (
                      <option key={method._id} value={method._id}>
                        {method.name}
                      </option>
                    ))}
                </select>
                <label htmlFor="finance-paidOn">Payment date (WAT)</label>
                <input
                  id="finance-paidOn"
                  name="paidOn"
                  type="date"
                  required
                  max={attendanceToday()}
                  value={values.paidOn}
                  onChange={change}
                />
                <label htmlFor="finance-external">
                  Bank / POS / external reference (optional)
                </label>
                <input
                  id="finance-external"
                  name="externalReference"
                  maxLength={100}
                  value={values.externalReference}
                  onChange={change}
                />
                <p className="field-help">
                  A supplied external reference cannot be reused, even after
                  reversal. Review the payment before confirming.
                </p>
              </>
            )}
            {!payment && (
              <>
                <label htmlFor="finance-reason">Reason</label>
                <textarea
                  className="finance-textarea"
                  id="finance-reason"
                  name="reason"
                  minLength={3}
                  maxLength={300}
                  required
                  value={values.reason}
                  onChange={change}
                />
              </>
            )}
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
              {busy ? "Saving…" : "Review and confirm"}
            </button>
          </div>
        </form>
      </Modal>
      {confirm && (
        <ConfirmationDialog
          title={title}
          description={
            reversal
              ? `Reverse ${money(reversal.amountMinor)} with reason “${values.reason}”? This preserves the original transaction and adds a reversal audit event.`
              : `${payment ? "Record payment" : "Apply financial entry"} of NGN ${values.amount} to ${invoice.reference}? This will update the student balance and be retained in financial history.`
          }
          busy={busy}
          onClose={() => setConfirm(false)}
          onConfirm={save}
        />
      )}
    </>
  );
}
