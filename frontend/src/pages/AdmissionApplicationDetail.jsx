import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  admissionsApi,
  applicationStatusLabels,
  blankApplicant,
  blankApplicationGuardian,
} from "../lib/admissions";
import { errorMessage } from "../lib/api";
import EntityPicker from "../components/EntityPicker";
import MedicalInformation from "../components/MedicalInformation";
import Modal from "../components/Modal";
import Pagination from "../components/Pagination";
export default function AdmissionApplicationDetail() {
  const { id } = useParams(),
    navigate = useNavigate();
  const [application, setApplication] = useState(null),
    [enrolledStudent, setEnrolledStudent] = useState(null),
    [options, setOptions] = useState(null),
    [draft, setDraft] = useState(null),
    [dirty, setDirty] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [action, setAction] = useState(null),
    [reason, setReason] = useState(""),
    [history, setHistory] = useState(null),
    [matching, setMatching] = useState(null);
  const [acceptanceKey] = useState(() => crypto.randomUUID());
  const [admissionDate, setAdmissionDate] = useState(() =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(
      new Date(),
    ),
  );
  const apply = useCallback((a) => {
    setApplication(a);
    setDraft({
      revision: a.revision,
      sessionId: a.sessionId,
      classId: a.classId || "",
      arm: a.arm || "",
      student: { ...blankApplicant(), ...a.student },
      guardians: a.guardians || [],
      receivedDocuments: a.receivedDocuments || [],
    });
    setDirty(false);
  }, []);
  const load = useCallback(async () => {
    try {
      const [d, o] = await Promise.all([
        admissionsApi.get(`applications/${id}`),
        admissionsApi.get("applications/options"),
      ]);
      apply(d.application);
      setEnrolledStudent(d.student);
      setOptions(o);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, [id, apply]);
  useEffect(() => {
    load();
  }, [load]);
  const editable =
    application &&
    ["awaiting_form", "form_received", "under_review"].includes(
      application.status,
    );
  function update(field, value) {
    setDraft((old) => ({ ...old, [field]: value }));
    setDirty(true);
  }
  function studentField(key, value) {
    setDraft((old) => ({ ...old, student: { ...old.student, [key]: value } }));
    setDirty(true);
  }
  function guardianField(index, key, value) {
    setDraft((old) => ({
      ...old,
      guardians: old.guardians.map((g, i) =>
        i === index ? { ...g, [key]: value } : g,
      ),
    }));
    setDirty(true);
  }
  async function chooseGuardian(record) {
    try {
      const { record: full } = await admissionsApi.get(
        `guardians/${record._id}`,
      );
      setDraft((old) => ({
        ...old,
        guardians: old.guardians.map((g, i) =>
          i === matching
            ? {
                ...g,
                ...Object.fromEntries(
                  Object.keys(blankApplicationGuardian())
                    .filter((k) => full[k] !== undefined)
                    .map((k) => [k, full[k]]),
                ),
                guardianId: record._id,
                verified: false,
                createNewConfirmed: false,
              }
            : g,
        ),
      }));
      setDirty(true);
      setMatching(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { application: saved } = await admissionsApi.put(
        `applications/${id}`,
        draft,
      );
      apply(saved);
      setNotice(
        "Draft saved. Missing information is permitted until enrolment validation.",
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (action.type === "enrol") {
        const result = await admissionsApi.post(`applications/${id}/enrol`, {
          revision: application.revision,
          admissionDate,
          classId: application.classId,
          arm: application.arm,
        });
        apply(result.application);
        setEnrolledStudent(result.student);
        setNotice(
          `Student enrolled: ${result.student.admissionNumber}. No student or parent login account was created.`,
        );
      } else {
        const result = await admissionsApi.post(`applications/${id}/status`, {
          revision: application.revision,
          status: action.status,
          reason,
        });
        apply(result.application);
        setNotice(
          `Application status: ${applicationStatusLabels[result.application.status]}.`,
        );
      }
      setAction(null);
      setHistory(null);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function acceptance() {
    setBusy(true);
    setError("");
    try {
      const { document } = await admissionsApi.post("documents", {
        requestKey: acceptanceKey,
        type: "admission_acceptance",
        applicationId: id,
        prefill: true,
        includeMedical: false,
      });
      navigate(`/school/documents/${document._id}`);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function loadHistory(page = 1) {
    try {
      setHistory(
        await admissionsApi.get(`applications/${id}/history`, {
          page,
          limit: 25,
        }),
      );
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  const cls = options?.classes.find((c) => c._id === draft?.classId);
  return (
    <div className="teacher-workspace admissions-workspace">
      <div className="page-heading">
        <div>
          <div className="eyebrow">ADMISSION APPLICATION</div>
          <h1>{application?.reference || "Application"}</h1>
          <p>
            <Link to="/school/applications">Return to applications</Link>
          </p>
        </div>
        {application && (
          <Link
            className="btn secondary"
            to={`/school/documents/${application.documentId}`}
          >
            Print / reprint application form
          </Link>
        )}
      </div>
      {error && !action && (
        <div className="alert error" role="alert">
          {error}
          <button onClick={load}>Reload latest data</button>
        </div>
      )}
      {notice && (
        <p className="alert success" role="status">
          {notice}
        </p>
      )}
      {!application || !options ? (
        <p role="status">Loading application...</p>
      ) : (
        <>
          <section className="panel">
            <h2>{applicationStatusLabels[application.status]}</h2>
            <p>
              Issued{" "}
              {new Date(application.createdAt).toLocaleDateString("en-GB")} -
              revision {application.revision}. The original reference is
              permanent.
            </p>
            {dirty && (
              <p className="alert info">
                Unsaved draft changes. Save before changing status, enrolling or
                issuing a letter.
              </p>
            )}
            <div className="button-row">
              {(options.transitions[application.status] || []).map((status) => (
                <button
                  className="btn secondary"
                  key={status}
                  disabled={dirty || busy}
                  onClick={() => {
                    setAction({ type: "status", status });
                    setReason("");
                    setError("");
                  }}
                >
                  {status === "form_received" &&
                  application.status === "awaiting_form"
                    ? "Record returned form"
                    : applicationStatusLabels[status]}
                </button>
              ))}
              {application.status === "approved" && (
                <button
                  className="btn primary"
                  disabled={dirty || busy}
                  onClick={() => {
                    setAction({ type: "enrol" });
                    setError("");
                  }}
                >
                  Review enrolment
                </button>
              )}
              {["approved", "enrolled"].includes(application.status) && (
                <button
                  className="btn secondary"
                  disabled={dirty || busy}
                  onClick={acceptance}
                >
                  Issue acceptance letter
                </button>
              )}
              {application.studentId && (
                <Link
                  className="btn primary"
                  to={`/school/students/${application.studentId}`}
                >
                  Registered student {enrolledStudent?.admissionNumber || ""}
                </Link>
              )}
              <button className="btn secondary" onClick={() => loadHistory()}>
                View application history
              </button>
            </div>
          </section>
          <section className="panel">
            <h2>Returned form and draft data</h2>
            <p>
              Partial details can be saved. Approval and enrolment are separate
              audited actions.
            </p>
            <form onSubmit={save}>
              <fieldset disabled={!editable || busy}>
                <legend>Intended / approved academic placement</legend>
                <div className="teacher-filters">
                  <label>
                    Session
                    <select
                      value={draft.sessionId}
                      required
                      onChange={(e) => update("sessionId", e.target.value)}
                    >
                      {options.sessions.map((s) => (
                        <option key={s._id} value={s._id}>
                          {s.name} ({s.status})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Class
                    <select
                      value={draft.classId}
                      onChange={(e) => {
                        setDraft((old) => ({
                          ...old,
                          classId: e.target.value,
                          arm: "",
                        }));
                        setDirty(true);
                      }}
                    >
                      <option value="">Not yet known</option>
                      {options.classes
                        .filter(
                          (c) =>
                            c.status === "active" || c._id === draft.classId,
                        )
                        .map((c) => (
                          <option key={c._id} value={c._id}>
                            {c.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Arm
                    <select
                      value={draft.arm}
                      onChange={(e) => update("arm", e.target.value)}
                    >
                      <option value="">Unknown / no arms</option>
                      {cls?.arms
                        .filter(
                          (a) =>
                            !cls.inactiveArms.includes(a) || a === draft.arm,
                        )
                        .map((a) => (
                          <option key={a}>{a}</option>
                        ))}
                    </select>
                  </label>
                </div>
              </fieldset>
              <fieldset disabled={!editable || busy}>
                <legend>Student personal information</legend>
                <div className="configuration-fields">
                  {[
                    ["lastName", "Surname", 60],
                    ["firstName", "First name", 60],
                    ["middleName", "Middle name", 60],
                    ["dateOfBirth", "Date of birth", 10],
                    ["address", "Residential address", 300],
                    ["nationality", "Nationality (where required)", 80],
                    ["previousSchool", "Previous school", 160],
                  ].map(([key, label, max]) => (
                    <label key={key}>
                      {label}
                      {key === "address" ? (
                        <textarea
                          value={draft.student[key]}
                          rows={3}
                          maxLength={max}
                          onChange={(e) => studentField(key, e.target.value)}
                        />
                      ) : (
                        <input
                          type={key === "dateOfBirth" ? "date" : "text"}
                          value={draft.student[key]}
                          maxLength={max}
                          onChange={(e) => studentField(key, e.target.value)}
                        />
                      )}
                    </label>
                  ))}
                  <label>
                    Gender
                    <select
                      value={draft.student.gender}
                      onChange={(e) => studentField("gender", e.target.value)}
                    >
                      {["not_specified", "female", "male", "other"].map((v) => (
                        <option key={v} value={v}>
                          {v.replaceAll("_", " ")}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </fieldset>
              <fieldset disabled={!editable || busy}>
                <legend>Parents and guardians</legend>
                <p>
                  Search existing records and verify identity. Sharing a phone
                  number is not proof of identity. New records require an
                  explicit decision; no guardian is created when this draft is
                  saved.
                </p>
                {draft.guardians.map((g, index) => (
                  <section className="application-guardian" key={index}>
                    <h3>Guardian {index + 1}</h3>
                    <div className="button-row">
                      <button
                        type="button"
                        className="btn secondary"
                        onClick={() => setMatching(index)}
                      >
                        Find and verify an existing guardian
                      </button>
                      {g.guardianId && (
                        <>
                          <Link
                            className="text-link"
                            to={`/school/guardians/${g.guardianId}`}
                          >
                            View matched record
                          </Link>
                          <button
                            type="button"
                            className="btn secondary"
                            onClick={() => {
                              setDraft((old) => ({
                                ...old,
                                guardians: old.guardians.map((item, i) =>
                                  i === index
                                    ? {
                                        ...item,
                                        guardianId: null,
                                        verified: false,
                                        createNewConfirmed: false,
                                      }
                                    : item,
                                ),
                              }));
                              setDirty(true);
                            }}
                          >
                            Clear match
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        className="btn secondary"
                        onClick={() => {
                          setDraft((old) => ({
                            ...old,
                            guardians: old.guardians.filter(
                              (_, i) => i !== index,
                            ),
                          }));
                          setDirty(true);
                        }}
                      >
                        Remove from draft
                      </button>
                    </div>
                    <div className="configuration-fields">
                      {[
                        ["fullName", "Full name", 120],
                        ["primaryPhone", "Primary phone", 30],
                        ["alternativePhone", "Alternative phone", 30],
                        ["email", "Email", 254],
                        ["address", "Residential address", 300],
                        ["occupation", "Occupation (where required)", 100],
                        ["emergencyContactName", "Emergency contact name", 120],
                        ["emergencyContactPhone", "Emergency phone", 30],
                        [
                          "emergencyContactRelationship",
                          "Emergency relationship",
                          60,
                        ],
                      ].map(([key, label, max]) => (
                        <label key={key}>
                          {label}
                          <input
                            value={g[key] || ""}
                            maxLength={max}
                            readOnly={Boolean(g.guardianId)}
                            onChange={(e) =>
                              guardianField(index, key, e.target.value)
                            }
                          />
                        </label>
                      ))}
                      <label>
                        Relationship
                        <select
                          value={g.relationship}
                          onChange={(e) =>
                            guardianField(index, "relationship", e.target.value)
                          }
                        >
                          {["father", "mother", "guardian", "other"].map(
                            (v) => (
                              <option key={v}>{v}</option>
                            ),
                          )}
                        </select>
                      </label>
                    </div>
                    <label className="check-line">
                      <input
                        type="checkbox"
                        checked={g.verified}
                        onChange={(e) =>
                          guardianField(index, "verified", e.target.checked)
                        }
                      />
                      I verified this person's identity and relationship to the
                      child.
                    </label>
                    {g.guardianId ? (
                      <p>
                        The verified existing record will be linked. This
                        application does not overwrite its contact details.
                      </p>
                    ) : (
                      <label className="check-line">
                        <input
                          type="checkbox"
                          checked={g.createNewConfirmed}
                          onChange={(e) =>
                            guardianField(
                              index,
                              "createNewConfirmed",
                              e.target.checked,
                            )
                          }
                        />
                        I checked existing records and confirm a new guardian
                        record should be created at enrolment.
                      </label>
                    )}
                  </section>
                ))}
                <button
                  className="btn secondary"
                  type="button"
                  disabled={draft.guardians.length >= 6}
                  onClick={() =>
                    update("guardians", [
                      ...draft.guardians,
                      blankApplicationGuardian(),
                    ])
                  }
                >
                  Add guardian
                </button>
              </fieldset>
              <fieldset disabled={!editable || busy}>
                <legend>Supporting documents received</legend>
                {application.checklist.map((label) => (
                  <label className="check-line" key={label}>
                    <input
                      type="checkbox"
                      checked={draft.receivedDocuments.includes(label)}
                      onChange={(e) =>
                        update(
                          "receivedDocuments",
                          e.target.checked
                            ? [...draft.receivedDocuments, label]
                            : draft.receivedDocuments.filter(
                                (v) => v !== label,
                              ),
                        )
                      }
                    />
                    {label}
                  </label>
                ))}
              </fieldset>
              {editable && (
                <button className="btn primary" disabled={busy || !dirty}>
                  {busy ? "Saving..." : "Save draft details"}
                </button>
              )}
            </form>
          </section>
          <MedicalInformation applicationId={id} />
          {history && (
            <section className="panel">
              <h2>Application history</h2>
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
                  {e.details?.before?.status && (
                    <p>
                      {applicationStatusLabels[e.details.before.status]} to{" "}
                      {applicationStatusLabels[e.details.after?.status] ||
                        e.details.after?.status}
                    </p>
                  )}
                  {e.details?.physicalPrintConfirmed === false && (
                    <p>Physical printing was not confirmed.</p>
                  )}
                </article>
              ))}
              <Pagination
                page={history.page}
                total={history.total}
                limit={25}
                onPage={loadHistory}
              />
            </section>
          )}
        </>
      )}
      {matching !== null && (
        <Modal
          title="Select an existing guardian after identity verification"
          onClose={() => setMatching(null)}
        >
          <div className="modal-body">
            <p>
              Compare name and verified identity details. Do not match solely by
              phone number.
            </p>
            <EntityPicker kind="guardians" onSelect={chooseGuardian} />
          </div>
        </Modal>
      )}
      {action && (
        <Modal
          title={
            action.type === "enrol"
              ? "Confirm student enrolment"
              : `Change status to ${applicationStatusLabels[action.status]}`
          }
          onClose={() => {
            if (!busy) setAction(null);
          }}
        >
          <div className="modal-body">
            <p>
              {action.type === "enrol"
                ? "This atomically creates one registered student and verified guardian links, allocates a permanent admission number and retains the original application reference. No login accounts are created."
                : "This decision is recorded with your identity, timestamp and reason. Enrolment is a separate action after approval."}
            </p>
            {action.type === "enrol" ? (
              <>
                <p>
                  {
                    options?.classes.find((c) => c._id === application.classId)
                      ?.name
                  }{" "}
                  / {application.arm || "No arm"}
                </p>
                <label>
                  Admission date
                  <input
                    type="date"
                    value={admissionDate}
                    required
                    onChange={(e) => setAdmissionDate(e.target.value)}
                  />
                </label>
              </>
            ) : (
              <label>
                Decision / transition reason
                <input
                  value={reason}
                  minLength={3}
                  maxLength={500}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
            )}
            {error && (
              <div className="alert error" role="alert">
                {error}
              </div>
            )}
            <div className="button-row">
              <button
                className="btn secondary"
                disabled={busy}
                onClick={() => setAction(null)}
              >
                Cancel
              </button>
              <button
                className="btn primary"
                disabled={
                  busy ||
                  (action.type === "enrol"
                    ? !admissionDate
                    : reason.trim().length < 3)
                }
                onClick={confirm}
              >
                {busy ? "Saving..." : "Confirm"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
