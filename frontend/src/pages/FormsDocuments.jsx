import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { admissionsApi } from "../lib/admissions";
import { errorMessage } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import EntityPicker from "../components/EntityPicker";
import Pagination from "../components/Pagination";
import Modal from "../components/Modal";
export default function FormsDocuments() {
  const navigate = useNavigate(),
    { user } = useAuth();
  const [catalog, setCatalog] = useState(null),
    [options, setOptions] = useState(null),
    [data, setData] = useState(null),
    [settings, setSettings] = useState(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [revision, setRevision] = useState(0),
    [search, setSearch] = useState(""),
    [type, setType] = useState(""),
    [page, setPage] = useState(1);
  const [issuing, setIssuing] = useState(null),
    [selected, setSelected] = useState(null),
    [prefill, setPrefill] = useState(false),
    [includeMedical, setIncludeMedical] = useState(false),
    [sessionId, setSessionId] = useState(""),
    [history, setHistory] = useState(null),
    [cancelling, setCancelling] = useState(null),
    [reason, setReason] = useState("");
  useEffect(() => {
    let live = true;
    Promise.all([
      admissionsApi.get("forms/catalog"),
      admissionsApi.get("applications/options"),
    ])
      .then(([c, o]) => {
        if (live) {
          setCatalog(c);
          setOptions(o);
          setSettings({
            prefix: c.settings.prefix,
            privacyNotice: c.settings.privacyNotice,
            checklistText: c.settings.checklist.join("\n"),
          });
        }
      })
      .catch((e) => {
        if (live) setError(errorMessage(e));
      });
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    let live = true;
    setData(null);
    admissionsApi
      .get("documents", { search, type, page, limit: 25 })
      .then((d) => {
        if (live) setData(d);
      })
      .catch((e) => {
        if (live) setError(errorMessage(e));
      });
    return () => {
      live = false;
    };
  }, [search, type, page, revision]);
  function begin(t) {
    if (t.type === "student_application")
      return navigate("/school/applications");
    setIssuing({ ...t, requestKey: crypto.randomUUID() });
    setSelected(null);
    setPrefill(t.type === "admission_acceptance");
    setIncludeMedical(false);
    setSessionId("");
    setError("");
  }
  const sourceKind =
    issuing?.type === "guardian_registration"
      ? "guardians"
      : [
            "teacher_registration",
            "staff_registration",
            "teacher_assignment",
          ].includes(issuing?.type)
        ? "staff"
        : "students";
  async function issue(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const input = {
        requestKey: issuing.requestKey,
        type: issuing.type,
        prefill,
        includeMedical,
        ...(sessionId ? { sessionId } : {}),
        ...(prefill && issuing.type === "administrator_registration"
          ? { administratorId: user.id }
          : {}),
        ...(prefill && selected && issuing.type !== "administrator_registration"
          ? {
              [sourceKind === "guardians"
                ? "guardianId"
                : sourceKind === "staff"
                  ? "staffId"
                  : "studentId"]: selected._id,
            }
          : {}),
      };
      const { document } = await admissionsApi.post("documents", input);
      navigate(`/school/documents/${document._id}`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function saveSettings(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { settings: saved } = await admissionsApi.put("forms/settings", {
        prefix: settings.prefix,
        privacyNotice: settings.privacyNotice,
        checklist: settings.checklistText
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
      });
      setSettings({ ...saved, checklistText: saved.checklist.join("\n") });
      setNotice(
        "Numbering and form settings saved. Existing references and issued form versions are unchanged.",
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function loadHistory(d, next = 1) {
    try {
      const h = await admissionsApi.get(`documents/${d._id}/history`, {
        page: next,
        limit: 25,
      });
      setHistory({ ...h, document: d });
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  async function cancel() {
    setBusy(true);
    setError("");
    try {
      await admissionsApi.post(`documents/${cancelling._id}/cancel`, {
        revision: cancelling.revision,
        reason,
      });
      setCancelling(null);
      setRevision((v) => v + 1);
      setNotice("Document cancelled. Its reference will never be reused.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="teacher-workspace admissions-workspace">
      <div className="page-heading">
        <div>
          <div className="eyebrow">SCHOOL ADMINISTRATION</div>
          <h1>Forms & Documents</h1>
          <p>
            Blank generic templates are untracked. Issued forms have permanent
            database references and audited print requests.
          </p>
        </div>
        <Link className="btn primary" to="/school/applications">
          Admission Applications
        </Link>
      </div>
      {error && !issuing && !cancelling && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <p className="alert success" role="status">
          {notice}
        </p>
      )}
      {!catalog ? (
        <p role="status">Loading form catalogue...</p>
      ) : (
        [...new Set(catalog.types.map((t) => t.category))].map((category) => (
          <section className="panel" key={category}>
            <h2>{category}</h2>
            <div className="document-catalogue">
              {catalog.types
                .filter((t) => t.category === category)
                .map((t) => (
                  <article key={t.type}>
                    <h3>{t.title}</h3>
                    <p>Template v{t.templateVersion} - A4 / browser PDF</p>
                    <div className="button-row">
                      <Link
                        className="btn secondary"
                        to={`/school/forms/templates/${t.type}`}
                      >
                        Generic preview
                      </Link>
                      <button className="btn primary" onClick={() => begin(t)}>
                        {t.type === "student_application"
                          ? "Generate application"
                          : "Issue numbered form"}
                      </button>
                    </div>
                  </article>
                ))}
            </div>
          </section>
        ))
      )}
      {settings && (
        <details className="panel">
          <summary>School numbering, checklist and privacy notice</summary>
          <form onSubmit={saveSettings}>
            <p>
              Prefix changes affect future references only. Counters are not
              reset. Application references and permanent admission numbers use
              separate sequences.
            </p>
            <label>
              School prefix
              <input
                value={settings.prefix}
                minLength={2}
                maxLength={12}
                pattern="[A-Za-z][A-Za-z0-9]*"
                required
                onChange={(e) =>
                  setSettings((old) => ({
                    ...old,
                    prefix: e.target.value.toUpperCase(),
                  }))
                }
              />
            </label>
            <label>
              School-specific application privacy notice
              <textarea
                value={settings.privacyNotice}
                minLength={20}
                maxLength={2000}
                rows={5}
                required
                onChange={(e) =>
                  setSettings((old) => ({
                    ...old,
                    privacyNotice: e.target.value,
                  }))
                }
              />
            </label>
            <label>
              Supporting documents (one per line, maximum 20)
              <textarea
                value={settings.checklistText}
                rows={6}
                required
                onChange={(e) =>
                  setSettings((old) => ({
                    ...old,
                    checklistText: e.target.value,
                  }))
                }
              />
            </label>
            <button className="btn primary" disabled={busy}>
              Save school form settings
            </button>
          </form>
        </details>
      )}
      <section className="panel">
        <h2>Issued documents</h2>
        <div className="teacher-filters">
          <label>
            Search reference
            <input
              value={search}
              maxLength={100}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <label>
            Document type
            <select
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All types</option>
              {catalog?.types.map((t) => (
                <option key={t.type} value={t.type}>
                  {t.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        {!data ? (
          <p role="status">Loading issued documents...</p>
        ) : !data.total ? (
          <p>No issued documents match these filters.</p>
        ) : (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Reference</th>
                    <th>Document</th>
                    <th>Issued by / date</th>
                    <th>Status / print requests</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.records.map((d) => (
                    <tr key={d._id}>
                      <td>
                        <Link to={`/school/documents/${d._id}`}>
                          {d.reference}
                        </Link>
                      </td>
                      <td>
                        {catalog?.types.find((t) => t.type === d.type)?.title}
                      </td>
                      <td>
                        {d.issuedBy?.name || "School administrator"}
                        <span className="staff-secondary">
                          {new Date(d.createdAt).toLocaleDateString("en-GB")}
                        </span>
                      </td>
                      <td>
                        {d.status} / {d.printRequests}
                        <span className="staff-secondary">
                          Print requests are not proof of physical printing.
                        </span>
                      </td>
                      <td>
                        <div className="button-row">
                          <Link
                            className="btn secondary"
                            to={`/school/documents/${d._id}`}
                          >
                            Preview / reprint
                          </Link>
                          <button
                            className="btn secondary"
                            onClick={() => loadHistory(d)}
                          >
                            History
                          </button>
                          {d.applicationId && (
                            <Link
                              className="text-link"
                              to={`/school/applications/${d.applicationId}`}
                            >
                              Linked application
                            </Link>
                          )}
                          {d.status !== "cancelled" &&
                            d.type !== "student_application" && (
                              <button
                                className="btn secondary"
                                onClick={() => {
                                  setCancelling(d);
                                  setReason("");
                                  setError("");
                                }}
                              >
                                Cancel document
                              </button>
                            )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={page}
              total={data.total}
              limit={25}
              onPage={setPage}
            />
          </>
        )}
      </section>
      {issuing && (
        <Modal
          title={`Issue ${issuing.title}`}
          onClose={() => {
            if (!busy) setIssuing(null);
          }}
        >
          <form className="modal-body" onSubmit={issue}>
            <p>
              A new immutable reference will be reserved. This creates no
              student, guardian, staff or administrator account and grants no
              permissions.
            </p>
            <label className="check-line">
              <input
                type="checkbox"
                checked={prefill}
                disabled={issuing.type === "admission_acceptance"}
                onChange={(e) => {
                  setPrefill(e.target.checked);
                  setSelected(null);
                  setIncludeMedical(false);
                }}
              />
              Prefill using an authorised existing record
            </label>
            {prefill &&
              (issuing.type === "administrator_registration" ? (
                <p>
                  Prefill your own current School Administrator contact record.
                  Provisioning remains Super Administrator controlled.
                </p>
              ) : (
                <EntityPicker
                  kind={sourceKind}
                  selected={selected}
                  teachingOnly={[
                    "teacher_registration",
                    "teacher_assignment",
                  ].includes(issuing.type)}
                  onSelect={setSelected}
                />
              ))}
            {issuing.type === "admission_acceptance" && (
              <p>
                Select an admitted student here. For an approved application not
                yet enrolled, use the acceptance-letter action on its
                application page.
              </p>
            )}
            {issuing.type === "teacher_assignment" && (
              <label>
                Academic session (optional)
                <select
                  value={sessionId}
                  onChange={(e) => setSessionId(e.target.value)}
                >
                  <option value="">All recorded active allocations</option>
                  {options?.sessions.map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {prefill && issuing.type === "medical_emergency" && (
              <label className="check-line">
                <input
                  type="checkbox"
                  checked={includeMedical}
                  onChange={(e) => setIncludeMedical(e.target.checked)}
                />
                Include restricted safety information on this administrator-only
                document
              </label>
            )}
            {error && (
              <div className="alert error" role="alert">
                {error}
              </div>
            )}
            <button
              className="btn primary"
              disabled={
                busy ||
                (prefill &&
                  issuing.type !== "administrator_registration" &&
                  !selected)
              }
            >
              {busy ? "Issuing..." : "Confirm and issue numbered document"}
            </button>
          </form>
        </Modal>
      )}
      {cancelling && (
        <Modal
          title="Cancel issued document"
          onClose={() => {
            if (!busy) setCancelling(null);
          }}
        >
          <div className="modal-body">
            <p>
              Cancel {cancelling.reference}? Its reference and history remain
              permanently reserved.
            </p>
            <label>
              Reason
              <input
                value={reason}
                minLength={3}
                maxLength={500}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            {error && (
              <div className="alert error" role="alert">
                {error}
              </div>
            )}
            <button
              className="btn primary"
              disabled={busy || reason.trim().length < 3}
              onClick={cancel}
            >
              Confirm cancellation
            </button>
          </div>
        </Modal>
      )}
      {history && (
        <Modal
          title={`Document history - ${history.document.reference}`}
          onClose={() => setHistory(null)}
        >
          <div className="modal-body">
            {history.records.map((e) => (
              <article key={e._id}>
                <h3>{e.action.replaceAll("_", " ")}</h3>
                <p>
                  {e.actorId?.name || "Actor no longer available"} -{" "}
                  {new Date(e.createdAt).toLocaleString("en-GB", {
                    timeZone: "Africa/Lagos",
                  })}{" "}
                  WAT
                </p>
                <p>{e.reason}</p>
                {e.details?.physicalPrintConfirmed === false && (
                  <p>Physical printing was not confirmed.</p>
                )}
              </article>
            ))}
            <Pagination
              page={history.page}
              total={history.total}
              limit={25}
              onPage={(p) => loadHistory(history.document, p)}
            />
          </div>
        </Modal>
      )}
    </div>
  );
}
