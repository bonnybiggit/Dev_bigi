import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Printer } from "lucide-react";
import { api } from "../lib/api";
import { configurationError } from "../lib/academicConfiguration";
import { money } from "../lib/finance";
import SchoolIdentity from "../components/SchoolIdentity";
export default function PaymentReceipt() {
  const { id } = useParams();
  const [data, setData] = useState(null),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    setError("");
    try {
      const { data } = await api.get(`/school/finance/payments/${id}/receipt`);
      setData(data);
    } catch (e) {
      setError(configurationError(e));
    }
  }, [id]);
  useEffect(() => {
    setData(null);
    load();
  }, [load]);
  return (
    <>
      <div className="page-heading no-print">
        <div>
          <div className="eyebrow">FEES & FINANCE</div>
          <h1>Payment receipt</h1>
          <p>
            <Link className="text-link" to="/school/finance/receipts">
              Return to receipts
            </Link>
          </p>
        </div>
        {data && (
          <button className="btn primary" onClick={() => window.print()}>
            <Printer size={18} />
            Print receipt
          </button>
        )}
      </div>
      {error ? (
        <div className="alert error no-print" role="alert">
          {error}
          <button onClick={load}>Retry</button>
        </div>
      ) : !data ? (
        <div className="loading-state">Loading receipt…</div>
      ) : (
        <article className="payment-receipt">
          <header>
            <div>
              <SchoolIdentity school={data.school} />
            </div>
            <strong
              className={
                data.payment.status === "reversed" ? "receipt-reversed" : ""
              }
            >
              {data.payment.status === "reversed"
                ? "REVERSED RECEIPT"
                : "PAYMENT RECEIPT"}
            </strong>
          </header>
          <div className="receipt-amount">
            {money(data.payment.amountMinor)}
          </div>
          <dl className="details">
            <div>
              <dt>Receipt reference</dt>
              <dd>{data.payment.reference}</dd>
            </div>
            <div>
              <dt>Payment date</dt>
              <dd>{data.payment.paidOn.slice(0, 10)}</dd>
            </div>
            <div>
              <dt>Student</dt>
              <dd>
                {data.payment.studentName} · {data.payment.admissionNumber}
              </dd>
            </div>
            <div>
              <dt>Invoice</dt>
              <dd>{data.payment.invoiceReference}</dd>
            </div>
            <div>
              <dt>Fee period / class</dt>
              <dd>
                {data.payment.periodLabel} · {data.payment.className}
              </dd>
            </div>
            <div>
              <dt>Method</dt>
              <dd>{data.payment.methodName}</dd>
            </div>
            {data.payment.externalReference && (
              <div>
                <dt>External reference</dt>
                <dd>{data.payment.externalReference}</dd>
              </div>
            )}
            <div>
              <dt>Balance immediately after this payment</dt>
              <dd>{money(data.payment.balanceAfterMinor)}</dd>
            </div>
            <div>
              <dt>Recorded by</dt>
              <dd>{data.payment.createdByName}</dd>
            </div>
            <div>
              <dt>Recorded at</dt>
              <dd>
                {new Date(data.payment.createdAt).toLocaleString("en-GB", {
                  timeZone: "Africa/Lagos",
                })}{" "}
                WAT
              </dd>
            </div>
            {data.payment.status === "reversed" && (
              <>
                <div>
                  <dt>Reversal reason</dt>
                  <dd>{data.payment.reversalReason}</dd>
                </div>
                <div>
                  <dt>Reversed by / at</dt>
                  <dd>
                    {data.payment.reversedByName} ·{" "}
                    {new Date(data.payment.reversedAt).toLocaleString("en-GB", {
                      timeZone: "Africa/Lagos",
                    })}{" "}
                    WAT
                  </dd>
                </div>
              </>
            )}
          </dl>
          <p className="field-help">
            {data.payment.status === "reversed"
              ? "This original payment has been reversed and no longer counts toward fees paid."
              : "This receipt records the payment shown above. Subsequent payments, adjustments or reversals may change the current invoice balance."}
          </p>
          <Link
            className="text-link no-print"
            to={`/school/finance/invoices/${data.payment.invoiceId}`}
          >
            Open current fee account
          </Link>
        </article>
      )}
    </>
  );
}
