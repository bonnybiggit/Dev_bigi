import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Printer } from "lucide-react";
import { admissionsApi } from "../lib/admissions";
import { errorMessage } from "../lib/api";
import PrintableRegistrationForm from "../components/PrintableRegistrationForm";
export default function RegistrationFormPreview({ generic = false }) {
  const { id, type } = useParams();
  const [document, setDocument] = useState(null),
    [title, setTitle] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [ready, setReady] = useState(false),
    [prefill, setPrefill] = useState(false),
    [includeMedical, setIncludeMedical] = useState(false),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let live = true;
    setDocument(null);
    setError("");
    Promise.all([
      admissionsApi.get(
        generic ? `forms/templates/${type}` : `documents/${id}`,
      ),
      admissionsApi.get("forms/catalog"),
    ])
      .then(([d, c]) => {
        if (live) {
          setDocument(d.document);
          setTitle(
            c.types.find((t) => t.type === d.document.type)?.title ||
              "School form",
          );
        }
      })
      .catch((e) => {
        if (live) setError(errorMessage(e));
      });
    return () => {
      live = false;
    };
  }, [id, type, generic, revision]);
  async function prepare() {
    setBusy(true);
    setError("");
    try {
      const result = await admissionsApi.post(`documents/${id}/prepare-print`, {
        prefill,
        includeMedical,
      });
      setDocument(result.document);
      setReady(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading no-print">
        <div>
          <h1>{title || "Print preview"}</h1>
          <p>
            <Link to="/school/forms">Forms & Documents</Link>
            {document?.applicationId && (
              <>
                {" "}
                /{" "}
                <Link to={`/school/applications/${document.applicationId}`}>
                  Linked application
                </Link>
              </>
            )}
          </p>
          <p>
            Choose A4 in the browser print dialog. Use Save as PDF for a local
            PDF. No cloud PDF service is used.
          </p>
        </div>
      </div>
      {error && (
        <div className="alert error no-print" role="alert">
          {error}
          <button onClick={() => setRevision((v) => v + 1)}>Retry</button>
        </div>
      )}
      {!document ? (
        <p className="no-print" role="status">
          Loading authorised document...
        </p>
      ) : (
        <>
          <section className="panel no-print print-controls">
            {generic ? (
              <p>
                <strong>Untracked generic template.</strong> No application or
                reference has been generated. Use Admission Applications for a
                tracked student form.
              </p>
            ) : (
              <>
                <p>
                  Reference: <strong>{document.reference}</strong>. Reprints
                  retain this reference. Preparing a print request records an
                  audit event; it does not prove the document was physically
                  printed.
                </p>
                {document.applicationId && (
                  <>
                    <label className="check-line">
                      <input
                        type="checkbox"
                        checked={prefill}
                        onChange={(e) => {
                          setPrefill(e.target.checked);
                          setReady(false);
                        }}
                      />
                      Prefill with current authorised application data (original
                      school notice and checklist retained)
                    </label>
                    {prefill && document.type === "student_application" && (
                      <label className="check-line">
                        <input
                          type="checkbox"
                          checked={includeMedical}
                          onChange={(e) => {
                            setIncludeMedical(e.target.checked);
                            setReady(false);
                          }}
                        />
                        Include restricted safety information
                      </label>
                    )}
                  </>
                )}
                <button
                  className="btn secondary"
                  disabled={busy}
                  onClick={prepare}
                >
                  {busy ? "Preparing..." : "Prepare and log print request"}
                </button>
              </>
            )}
            <button
              className="btn primary"
              disabled={!generic && !ready}
              onClick={() => {
                window.print();
                if (!generic) setReady(false);
              }}
            >
              <Printer size={18} />
              Print / Save as PDF
            </button>
          </section>
          <PrintableRegistrationForm document={document} title={title} />
        </>
      )}
    </>
  );
}
