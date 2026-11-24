import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { configurationError } from "../lib/academicConfiguration";
import { money } from "../lib/finance";
import useFinanceContext from "../hooks/useFinanceContext";
import FinanceSummary from "../components/FinanceSummary";
import FinanceTransactionForm from "../components/FinanceTransactionForm";
export default function InvoiceAccount() {
  const { id } = useParams(),
    navigate = useNavigate();
  const { context, error: contextError, reload } = useFinanceContext();
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [action, setAction] = useState(null);
  const load = useCallback(async () => {
    setError("");
    try {
      const { data } = await api.get(`/school/finance/invoices/${id}`);
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
      <div className="page-heading">
        <div>
          <div className="eyebrow">STUDENT FEE ACCOUNT</div>
          <h1>{data?.record.studentName || "Invoice account"}</h1>
          <p>
            <Link className="text-link" to="/school/finance/invoices">
              Return to invoices
            </Link>
          </p>
        </div>
        {data && (
          <div className="button-row">
            <button
              className="btn secondary"
              onClick={() => setAction({ type: "entry" })}
            >
              Discount / adjustment
            </button>
            <button
              className="btn primary"
              disabled={!context || data.record.balanceMinor === 0}
              onClick={() => setAction({ type: "payment" })}
            >
              Record payment
            </button>
          </div>
        )}
      </div>
      {error && (
        <div className="alert error" role="alert">
          {error}
          <button onClick={load}>Retry</button>
        </div>
      )}
      {contextError && (
        <div className="alert error" role="alert">
          {contextError}
          <button onClick={reload}>Reload payment methods</button>
        </div>
      )}
      {notice && (
        <div className="alert success" role="status">
          {notice}
        </div>
      )}
      {!error &&
        (!data ? (
          <div className="loading-state">Loading fee account…</div>
        ) : (
          <>
            <section className="network-banner">
              <div>
                <h2>{data.record.reference}</h2>
                <p>
                  {data.record.admissionNumber} · {data.record.sessionName} ·{" "}
                  {data.record.termName} · {data.record.className} · Structure v
                  {data.record.structureRevision}
                </p>
                <p>
                  <Link
                    className="text-link"
                    to={`/school/finance/reports?studentId=${data.record.studentId}`}
                  >
                    Open student financial statement
                  </Link>
                </p>
              </div>
            </section>
            <FinanceSummary totals={data.record} />
            <section className="panel finance-section">
              <div className="panel-heading">
                <h2>Issued fee lines</h2>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Fee category</th>
                      <th>Type</th>
                      <th>Billed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.record.lines.map((line) => (
                      <tr key={line.categoryId}>
                        <td>{line.categoryName}</td>
                        <td>{line.compulsory ? "Compulsory" : "Optional"}</td>
                        <td>{money(line.amountMinor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="panel finance-section">
              <div className="panel-heading">
                <h2>Payment history & instalments</h2>
              </div>
              {!data.payments.length ? (
                <div className="empty-state">
                  <p>No payments recorded yet.</p>
                </div>
              ) : (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Date / reference</th>
                        <th>Method</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.payments.map((payment) => (
                        <tr key={payment._id}>
                          <td>
                            {payment.paidOn.slice(0, 10)}
                            <span className="staff-secondary">
                              {payment.reference}
                            </span>
                          </td>
                          <td>{payment.methodName}</td>
                          <td>{money(payment.amountMinor)}</td>
                          <td>
                            {payment.status === "posted"
                              ? "Posted"
                              : "Reversed"}
                            {payment.reversalReason && (
                              <span className="staff-secondary">
                                {payment.reversalReason}
                              </span>
                            )}
                          </td>
                          <td>
                            <div className="table-actions">
                              <Link
                                className="text-link"
                                to={`/school/finance/receipts/${payment._id}`}
                              >
                                Receipt
                              </Link>
                              {payment.status === "posted" && (
                                <button
                                  className="text-link action-link"
                                  onClick={() =>
                                    setAction({ type: "reverse", payment })
                                  }
                                >
                                  Reverse
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            <section className="panel finance-section">
              <div className="panel-heading">
                <h2>Discounts, scholarships & adjustments</h2>
              </div>
              {!data.entries.length ? (
                <div className="empty-state">
                  <p>No financial entries yet.</p>
                </div>
              ) : (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Entry</th>
                        <th>Amount</th>
                        <th>Reason</th>
                        <th>Authorised by</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.entries.map((entry) => (
                        <tr key={entry._id}>
                          <td>{entry.kind}</td>
                          <td>{money(entry.amountMinor)}</td>
                          <td>{entry.reason}</td>
                          <td>
                            {entry.actorName}
                            <span className="staff-secondary">
                              {new Date(entry.createdAt).toLocaleString(
                                "en-GB",
                              )}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            <section className="panel finance-section">
              <div className="panel-heading">
                <h2>Financial audit history</h2>
              </div>
              <div className="audit-list finance-audit-list">
                {data.audit.map((event) => (
                  <article key={event._id}>
                    <strong>
                      {event.action.replaceAll("_", " ")} · {event.actorName}
                    </strong>
                    <p>
                      {new Date(event.createdAt).toLocaleString("en-GB", {
                        timeZone: "Africa/Lagos",
                      })}{" "}
                      WAT
                    </p>
                    {event.details.reason && <p>{event.details.reason}</p>}
                    {event.details.amountMinor !== undefined && (
                      <p>Amount: {money(event.details.amountMinor)}</p>
                    )}
                    {event.details.beforeBalance !== undefined && (
                      <p>
                        Balance: {money(event.details.beforeBalance)} →{" "}
                        {money(event.details.afterBalance)}
                      </p>
                    )}
                  </article>
                ))}
              </div>
            </section>
          </>
        ))}
      {action && data && (
        <FinanceTransactionForm
          invoice={data.record}
          methods={context?.methods || []}
          payment={action.type === "payment"}
          reversal={action.type === "reverse" ? action.payment : null}
          onClose={() => setAction(null)}
          onSaved={(record) => {
            const type = action.type;
            setAction(null);
            if (type === "payment")
              navigate(`/school/finance/receipts/${record._id}`);
            else {
              setNotice(
                type === "reverse"
                  ? "Payment reversed. Original transaction retained."
                  : "Financial entry saved.",
              );
              load();
            }
          }}
        />
      )}
    </>
  );
}
