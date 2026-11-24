import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import useFinanceContext from "../hooks/useFinanceContext";
import FinanceFilters from "../components/FinanceFilters";
import InvoiceGenerationForm from "../components/InvoiceGenerationForm";
import Pagination from "../components/Pagination";
import { api } from "../lib/api";
import { configurationError } from "../lib/academicConfiguration";
import { money } from "../lib/finance";
export default function StudentInvoices() {
  const navigate = useNavigate();
  const { context, error: contextError, reload } = useFinanceContext();
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
    [creating, setCreating] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError("");
    const timer = setTimeout(
      () =>
        api
          .get("/school/finance/invoices", {
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
          <h1>Student invoices</h1>
          <p>
            Generate fee accounts, collect instalments, and review balances.
          </p>
        </div>
        <button className="btn primary" onClick={() => setCreating(true)}>
          <Plus size={18} />
          Generate invoice
        </button>
      </div>
      {contextError && (
        <div className="alert error" role="alert">
          {contextError}
          <button onClick={reload}>Retry</button>
        </div>
      )}
      <section className="panel">
        <div className="attendance-filter-panel">
          <FinanceFilters
            context={context}
            values={filters}
            statusOptions={["outstanding", "paid"]}
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
          <div className="loading-state">Loading invoices…</div>
        ) : !data.records.length ? (
          <div className="empty-state">
            <h3>No invoices found</h3>
            <p>Generate a student invoice or change the filters.</p>
          </div>
        ) : (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Student / invoice</th>
                    <th>Period / class</th>
                    <th>Billed</th>
                    <th>Paid</th>
                    <th>Balance</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.records.map((record) => (
                    <tr key={record._id}>
                      <td>
                        <strong>{record.studentName}</strong>
                        <span className="staff-secondary">
                          {record.admissionNumber} · {record.reference}
                        </span>
                      </td>
                      <td>
                        {record.sessionName} · {record.termName}
                        <span className="staff-secondary">
                          {record.className}
                        </span>
                      </td>
                      <td>{money(record.billedMinor)}</td>
                      <td>{money(record.paidMinor)}</td>
                      <td>{money(record.balanceMinor)}</td>
                      <td>
                        <Link
                          className="text-link"
                          to={`/school/finance/invoices/${record._id}`}
                        >
                          View account
                        </Link>
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
      {creating && (
        <InvoiceGenerationForm
          onClose={() => setCreating(false)}
          onSaved={(record) =>
            navigate(`/school/finance/invoices/${record._id}`)
          }
        />
      )}
    </>
  );
}
