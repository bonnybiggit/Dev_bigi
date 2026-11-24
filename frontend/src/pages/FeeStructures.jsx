import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import useFinanceContext from "../hooks/useFinanceContext";
import FinanceOptionManager from "../components/FinanceOptionManager";
import FeeStructureForm from "../components/FeeStructureForm";
import FinanceFilters from "../components/FinanceFilters";
import Pagination from "../components/Pagination";
import { api } from "../lib/api";
import { configurationError } from "../lib/academicConfiguration";
import { money } from "../lib/finance";
export default function FeeStructures() {
  const { context, error: contextError, reload } = useFinanceContext();
  const [filters, setFilters] = useState({
    sessionId: "",
    termId: "",
    classId: "",
    search: "",
    history: "all",
  });
  const [page, setPage] = useState(1),
    [revision, setRevision] = useState(0),
    [data, setData] = useState(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [editor, setEditor] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError("");
    const timer = setTimeout(
      () =>
        api
          .get("/school/finance/structures", {
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
          <h1>Fee structures</h1>
          <p>
            Configure fee categories, term charges, optional fees, and payment
            methods.
          </p>
        </div>
        <button
          className="btn primary"
          disabled={!context}
          onClick={() => setEditor({ record: null })}
        >
          <Plus size={18} />
          Create structure
        </button>
      </div>
      {contextError && (
        <div className="alert error" role="alert">
          {contextError}
          <button onClick={reload}>Retry</button>
        </div>
      )}
      {notice && (
        <div className="alert success" role="status">
          {notice}
        </div>
      )}
      <section className="panel">
        <div className="panel-heading">
          <h2>Current and historical structures</h2>
        </div>
        <div className="attendance-filter-panel">
          <FinanceFilters
            context={context}
            values={filters}
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
          <div className="loading-state">Loading structures…</div>
        ) : !data.records.length ? (
          <div className="empty-state">
            <h3>No structures found</h3>
            <p>Create categories and configure the first fee period.</p>
          </div>
        ) : (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Period / class</th>
                    <th>Version</th>
                    <th>Fee lines</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.records.map((record) => (
                    <tr key={record._id}>
                      <td>
                        <strong>
                          {record.sessionName} · {record.termName}
                        </strong>
                        <span className="staff-secondary">
                          {record.className}
                        </span>
                      </td>
                      <td>
                        v{record.revision} ·{" "}
                        {record.isCurrent ? "Current" : "Historical"}
                      </td>
                      <td>
                        {record.lines.map((line) => (
                          <span
                            className="fee-line-summary"
                            key={line.categoryId}
                          >
                            {line.categoryName}: {money(line.amountMinor)} ·{" "}
                            {line.compulsory ? "Compulsory" : "Optional"}
                          </span>
                        ))}
                      </td>
                      <td>
                        {record.isCurrent ? (
                          <button
                            className="text-link action-link"
                            disabled={!context}
                            onClick={() => setEditor({ record })}
                          >
                            Edit structure
                          </button>
                        ) : (
                          "Retained"
                        )}
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
      {context && (
        <div className="finance-options-grid">
          <FinanceOptionManager
            kind="categories"
            records={context.categories}
            onSaved={reload}
          />
          <FinanceOptionManager
            kind="methods"
            records={context.methods}
            onSaved={reload}
          />
        </div>
      )}
      {editor && context && (
        <FeeStructureForm
          record={editor.record}
          context={context}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            setNotice(
              "Fee structure saved; used versions and issued invoices are retained.",
            );
            setRevision((value) => value + 1);
          }}
        />
      )}
    </>
  );
}
