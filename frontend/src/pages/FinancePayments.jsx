import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { configurationError } from "../lib/academicConfiguration";
import { money } from "../lib/finance";
import useFinanceContext from "../hooks/useFinanceContext";
import FinanceFilters from "../components/FinanceFilters";
import FinanceTransactionForm from "../components/FinanceTransactionForm";
import Pagination from "../components/Pagination";
export default function FinancePayments({ receipts = false }) {
  const { context } = useFinanceContext();
  const [filters, setFilters] = useState({
    search: "",
    sessionId: "",
    termId: "",
    classId: "",
    status: "",
  });
  const [page, setPage] = useState(1),
    [revision, setRevision] = useState(0),
    [data, setData] = useState(null),
    [error, setError] = useState(""),
    [reversing, setReversing] = useState(null),
    [notice, setNotice] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError("");
    const timer = setTimeout(
      () =>
        api
          .get("/school/finance/payments", {
            params: { ...filters, page },
            signal: controller.signal,
          })
          .then(({ data }) => setData(data))
          .catch((e) => {
            if (e.code !== "ERR_CANCELED") setError(configurationError(e));
          }),
      250,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [filters, page, revision]);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">FEES & FINANCE</div>
          <h1>{receipts ? "Receipts" : "Payments"}</h1>
          <p>
            {receipts
              ? "Open a payment receipt to review or print it, including reversed receipts."
              : "Review collections, partial payments, and retained reversals."}
          </p>
        </div>
        <Link className="btn primary" to="/school/finance/invoices">
          Open student invoices
        </Link>
      </div>
      {notice && (
        <div className="alert success" role="status">
          {notice}
        </div>
      )}
      <section className="panel">
        <div className="attendance-filter-panel">
          <FinanceFilters
            context={context}
            values={filters}
            statusOptions={["posted", "reversed"]}
            onChange={(event) => {
              setPage(1);
              setFilters((previous) => ({
                ...previous,
                [event.target.name]: event.target.value,
                ...(event.target.name === "sessionId" ? { termId: "" } : {}),
              }));
            }}
          />
        </div>
        {error ? (
          <div className="alert error" role="alert">
            {error}
            <button onClick={() => setRevision((value) => value + 1)}>
              Retry
            </button>
          </div>
        ) : !data ? (
          <div className="loading-state">Loading payments…</div>
        ) : !data.records.length ? (
          <div className="empty-state">
            <h3>No payments found</h3>
            <p>
              Choose a student invoice to record a payment, or change the
              filters.
            </p>
          </div>
        ) : (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Date / reference</th>
                    <th>Student / invoice</th>
                    <th>Method</th>
                    <th>Amount</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.records.map((record) => (
                    <tr key={record._id}>
                      <td>
                        {record.paidOn.slice(0, 10)}
                        <span className="staff-secondary">
                          {record.reference}
                        </span>
                      </td>
                      <td>
                        {record.studentName}
                        <span className="staff-secondary">
                          {record.invoiceReference}
                        </span>
                      </td>
                      <td>{record.methodName}</td>
                      <td>{money(record.amountMinor)}</td>
                      <td>{record.status}</td>
                      <td>
                        <div className="table-actions">
                          <Link
                            className="text-link"
                            to={`/school/finance/receipts/${record._id}`}
                          >
                            Receipt
                          </Link>
                          {!receipts && record.status === "posted" && (
                            <button
                              className="text-link action-link"
                              onClick={() => setReversing(record)}
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
            <Pagination page={page} total={data.total} onPage={setPage} />
          </>
        )}
      </section>
      {reversing && (
        <FinanceTransactionForm
          reversal={reversing}
          onClose={() => setReversing(null)}
          onSaved={() => {
            setReversing(null);
            setNotice("Payment reversed with audit history retained.");
            setRevision((value) => value + 1);
          }}
        />
      )}
    </>
  );
}
