import { useCallback, useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { api } from "../lib/api";
import { configurationError } from "../lib/academicConfiguration";
import { money, financeLabels } from "../lib/finance";
import useFinanceContext from "../hooks/useFinanceContext";
import FinanceFilters from "../components/FinanceFilters";
import FinanceSummary from "../components/FinanceSummary";
import EntityPicker from "../components/EntityPicker";
import Modal from "../components/Modal";
import Pagination from "../components/Pagination";
import { studentName } from "../lib/students";
function CollectionTable({ title, rows }) {
  return (
    <section className="panel finance-section">
      <div className="panel-heading">
        <h2>{title}</h2>
      </div>
      {!rows.length ? (
        <div className="empty-state">
          <p>No billed fees match these filters.</p>
        </div>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Group</th>
                {Object.values(financeLabels).map((label) => (
                  <th key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>{row.name}</strong>
                  </td>
                  {Object.keys(financeLabels).map((key) => (
                    <td key={key}>{money(row[key])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
export default function FinancialReports() {
  const [searchParams, setSearchParams] = useSearchParams();
  const studentParam = searchParams.get("studentId");
  const { context, error: contextError, reload } = useFinanceContext();
  const [filters, setFilters] = useState({
    sessionId: "",
    termId: "",
    classId: "",
    search: "",
    status: "",
  });
  const [student, setStudent] = useState(null),
    [picker, setPicker] = useState(false),
    [data, setData] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loaded, setLoaded] = useState(null);
  const load = useCallback(async (values, selected, page = 1) => {
    setBusy(true);
    setError("");
    try {
      const { data } = await api.get(
        selected
          ? `/school/finance/students/${selected._id}/statement`
          : "/school/finance/reports",
        { params: { ...values, page } },
      );
      setData(data);
      setLoaded({ values: { ...values }, student: selected });
    } catch (e) {
      setError(configurationError(e));
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    const defaults = {
      sessionId: "",
      termId: "",
      classId: "",
      search: "",
      status: "",
    };
    setFilters(defaults);
    if (!studentParam) {
      load(defaults, null);
      return;
    }
    const controller = new AbortController();
    api
      .get(`/school/students/${studentParam}`, { signal: controller.signal })
      .then(({ data }) => {
        setStudent(data.record);
        load(defaults, data.record);
      })
      .catch((e) => {
        if (e.code !== "ERR_CANCELED") setError(configurationError(e));
      });
    return () => controller.abort();
  }, [studentParam, load]);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">FEES & FINANCE</div>
          <h1>Financial dashboard & reports</h1>
          <p>
            Real fee balances and collections by term, class and fee category.
          </p>
        </div>
      </div>
      {contextError && (
        <div className="alert error" role="alert">
          {contextError}
          <button onClick={reload}>Reload filters</button>
        </div>
      )}
      <form
        className="panel attendance-filter-panel"
        onSubmit={(event) => {
          event.preventDefault();
          load(filters, student);
        }}
      >
        <fieldset className="staff-form-fields" disabled={busy}>
          <FinanceFilters
            context={context}
            values={filters}
            statusOptions={["paid", "outstanding"]}
            onChange={(event) =>
              setFilters((previous) => ({
                ...previous,
                [event.target.name]: event.target.value,
                ...(event.target.name === "sessionId" ? { termId: "" } : {}),
              }))
            }
          >
            <button
              type="button"
              className="btn secondary"
              onClick={() => setPicker(true)}
            >
              Choose student statement
            </button>
            {student && (
              <div className="attendance-person">
                <strong>{studentName(student)}</strong>
                <button
                  type="button"
                  className="text-link action-link"
                  onClick={() => {
                    setStudent(null);
                    setSearchParams({});
                  }}
                >
                  Clear student
                </button>
              </div>
            )}
            <button className="btn primary">
              {busy ? "Loading…" : "Run report"}
            </button>
          </FinanceFilters>
        </fieldset>
      </form>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {!data
        ? !error && (
            <div className="loading-state">Loading financial figures…</div>
          )
        : !error && (
            <>
              <FinanceSummary totals={data.totals} />
              {loaded.student ? (
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>{data.student.name} · financial statement</h2>
                      <p>
                        {data.student.admissionNumber} · posting-time ledger;
                        reversed payments and reversal entries are both
                        retained.
                      </p>
                    </div>
                  </div>
                  {!data.records.length ? (
                    <div className="empty-state">
                      <p>No financial activity matches these filters.</p>
                    </div>
                  ) : (
                    <>
                      <div className="table-scroll">
                        <table>
                          <thead>
                            <tr>
                              <th>Posted at</th>
                              <th>Entry / reference</th>
                              <th>Change</th>
                              <th>Running balance</th>
                              <th>Reason</th>
                            </tr>
                          </thead>
                          <tbody>
                            {data.records.map((row) => (
                              <tr key={row._id}>
                                <td>
                                  {new Date(row.date).toLocaleString("en-GB")}
                                </td>
                                <td>
                                  {row.type}
                                  <span className="staff-secondary">
                                    {row.reference}
                                    {row.status === "reversed"
                                      ? " · reversed original payment"
                                      : ""}
                                  </span>
                                </td>
                                <td>{money(row.deltaMinor)}</td>
                                <td>{money(row.runningBalanceMinor)}</td>
                                <td>{row.reason || "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <Pagination
                        page={data.page}
                        total={data.total}
                        onPage={(page) =>
                          load(loaded.values, loaded.student, page)
                        }
                      />
                    </>
                  )}
                </section>
              ) : (
                <>
                  <p className="attendance-help">
                    Payments received are net of recorded reversals. Category
                    collections are allocated from each invoice's current net
                    charges using exact, deterministic kobo allocation; totals
                    reconcile to the invoice. Filters describe the fee period
                    rather than a bank settlement period.
                  </p>
                  <CollectionTable
                    title="Collections by term"
                    rows={data.byTerm}
                  />
                  <CollectionTable
                    title="Collections by class"
                    rows={data.byClass}
                  />
                  <CollectionTable
                    title="Collections by fee category"
                    rows={data.byCategory}
                  />
                  <section className="panel finance-section">
                    <div className="panel-heading">
                      <h2>Matching student accounts</h2>
                    </div>
                    {!data.records.length ? (
                      <div className="empty-state">
                        <p>No invoices match these filters.</p>
                      </div>
                    ) : (
                      <>
                        <div className="table-scroll">
                          <table>
                            <thead>
                              <tr>
                                <th>Student / invoice</th>
                                <th>Paid</th>
                                <th>Outstanding</th>
                                <th>Account</th>
                              </tr>
                            </thead>
                            <tbody>
                              {data.records.map((row) => (
                                <tr key={row._id}>
                                  <td>
                                    {row.studentName}
                                    <span className="staff-secondary">
                                      {row.reference}
                                    </span>
                                  </td>
                                  <td>{money(row.paidMinor)}</td>
                                  <td>{money(row.balanceMinor)}</td>
                                  <td>
                                    <Link
                                      className="text-link"
                                      to={`/school/finance/invoices/${row._id}`}
                                    >
                                      View
                                    </Link>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <Pagination
                          page={data.page}
                          total={data.total}
                          onPage={(page) => load(loaded.values, null, page)}
                        />
                      </>
                    )}
                  </section>
                </>
              )}
            </>
          )}
      {picker && (
        <Modal
          title="Choose student financial statement"
          onClose={() => setPicker(false)}
        >
          <div className="modal-body">
            <EntityPicker
              kind="students"
              allowArchived
              selected={student}
              onSelect={(record) => {
                setStudent(record);
                setPicker(false);
                setSearchParams({ studentId: record._id });
              }}
            />
          </div>
        </Modal>
      )}
    </>
  );
}
