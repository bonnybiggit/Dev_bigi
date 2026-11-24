import { useCallback, useEffect, useState } from "react";
import { Plus, BookOpen } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import {
  configurationKinds,
  configurationError,
  formValues,
  formPayload,
} from "../lib/academicConfiguration";
import Modal from "../components/Modal";
import ConfigurationFields from "../components/ConfigurationFields";
import ConfigurationTable from "../components/ConfigurationTable";
import ConfirmationDialog from "../components/ConfirmationDialog";
import { StatusBadge } from "../components/SchoolTable";

export default function AcademicStructure({ kind }) {
  const definition = configurationKinds[kind];
  const [records, setRecords] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [classes, setClasses] = useState([]);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [editor, setEditor] = useState(null);
  const [values, setValues] = useState({});
  const [confirmation, setConfirmation] = useState(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setError("");
    try {
      const [list, sessionList, classList] = await Promise.all([
        api.get(`/school/${kind}`),
        kind === "terms" ? api.get("/school/sessions") : null,
        kind === "subjects" ? api.get("/school/classes") : null,
      ]);
      setRecords(list.data.records);
      setSessions(sessionList?.data.records || []);
      setClasses(classList?.data.records || []);
    } catch (e) {
      setError(configurationError(e));
    }
  }, [kind]);
  useEffect(() => {
    load();
  }, [load]);
  const openEditor = (record) => {
    setFormError("");
    setValues(formValues(kind, record));
    setEditor({ record });
  };
  const closeEditor = () => {
    if (!busy) setEditor(null);
  };
  async function submit(event) {
    event.preventDefault();
    setFormError("");
    setBusy(true);
    try {
      const path = `/school/${kind}${editor.record ? `/${editor.record._id}` : ""}`;
      await api[editor.record ? "put" : "post"](
        path,
        formPayload(kind, values),
      );
      setEditor(null);
      setNotice(
        `${definition.singular.charAt(0).toUpperCase() + definition.singular.slice(1)} saved.`,
      );
      await load();
    } catch (e) {
      setFormError(configurationError(e));
    } finally {
      setBusy(false);
    }
  }
  async function changeStatus() {
    setBusy(true);
    setFormError("");
    try {
      const status = confirmation.status === "active" ? "inactive" : "active";
      await api.patch(`/school/${kind}/${confirmation._id}/status`, {
        status,
        ...(["sessions", "terms"].includes(kind)
          ? { confirmSwitch: status === "active" }
          : {}),
      });
      setConfirmation(null);
      setNotice("Status updated successfully.");
      await load();
    } catch (e) {
      setFormError(configurationError(e));
    } finally {
      setBusy(false);
    }
  }
  const columns = [
    { label: "Name", render: (record) => <strong>{record.name}</strong> },
  ];
  if (kind === "terms")
    columns.push({
      label: "Session",
      render: (record) =>
        sessions.find((item) => item._id === record.sessionId)?.name ||
        "Unavailable",
    });
  if (["sessions", "terms"].includes(kind))
    columns.push(
      {
        label: "Start date",
        render: (record) => record.startDate.slice(0, 10),
      },
      { label: "End date", render: (record) => record.endDate.slice(0, 10) },
    );
  if (kind === "classes")
    columns.push(
      {
        label: "Arms",
        render: (record) =>
          record.arms
            .map(
              (arm) =>
                `${arm}${record.inactiveArms?.includes(arm) ? " (inactive)" : ""}`,
            )
            .join(", ") || "No arms",
      },
      { label: "Capacity", render: (record) => record.capacity },
    );
  if (kind === "subjects")
    columns.push(
      {
        label: "Class",
        render: (record) =>
          classes.find((item) => item._id === record.classId)?.name ||
          "Unavailable",
      },
      { label: "Code", render: (record) => record.code || "—" },
      {
        label: "Description",
        render: (record) => (
          <span className="subject-description">
            {record.description || "—"}
          </span>
        ),
      },
    );
  columns.push({
    label: "Status",
    render: (record) => <StatusBadge status={record.status} />,
  });
  const prerequisite =
    kind === "terms" && !sessions.length
      ? "sessions"
      : kind === "subjects" && !classes.some((item) => item.status === "active")
        ? "classes"
        : null;
  const replacing =
    confirmation?.status !== "active" && ["sessions", "terms"].includes(kind);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">ACADEMIC STRUCTURE</div>
          <h1>{definition.title}</h1>
          <p>{definition.description}</p>
        </div>
        <button
          className="btn primary"
          disabled={!records || !!prerequisite}
          onClick={() => openEditor(null)}
        >
          <Plus size={18} />
          Add {definition.singular}
        </button>
      </div>
      {notice && (
        <div className="alert success" role="status">
          {notice}
        </div>
      )}
      {prerequisite && (
        <div className="alert info">
          Create{" "}
          {prerequisite === "classes"
            ? "an active class"
            : "an academic session"}{" "}
          first.{" "}
          <Link className="text-link" to={`/school/${prerequisite}`}>
            Open {prerequisite}
          </Link>
        </div>
      )}
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>{definition.title}</h2>
            <p>{records?.length ?? "—"} records in your school</p>
          </div>
        </div>
        {error ? (
          <div className="alert error" role="alert">
            {error}
            <button onClick={load}>Retry</button>
          </div>
        ) : !records ? (
          <div className="loading-state">
            Loading {definition.title.toLowerCase()}…
          </div>
        ) : !records.length ? (
          <div className="empty-state">
            <BookOpen size={32} />
            <h3>No {definition.title.toLowerCase()} yet</h3>
            <p>Add your school's first {definition.singular} to get started.</p>
          </div>
        ) : (
          <ConfigurationTable
            columns={columns}
            records={records}
            onEdit={openEditor}
            onStatus={(record) => {
              setFormError("");
              setConfirmation(record);
            }}
          />
        )}
      </section>
      {editor && (
        <Modal
          title={`${editor.record ? "Edit" : "Add"} ${definition.singular}`}
          onClose={closeEditor}
        >
          <form className="modal-body" onSubmit={submit}>
            <p className="muted form-description">
              {["sessions", "terms"].includes(kind)
                ? "Dates use the school calendar. New records start inactive; activation requires confirmation."
                : "Records are saved only to your school."}
            </p>
            <ConfigurationFields
              fields={definition.fields({
                sessions,
                classes,
                editing: !!editor.record,
              })}
              values={values}
              onChange={(event) =>
                setValues({
                  ...values,
                  [event.target.name]: event.target.value,
                })
              }
            />
            {formError && (
              <div className="alert error" role="alert">
                {formError}
              </div>
            )}
            <div className="button-row">
              <button
                className="btn secondary"
                type="button"
                disabled={busy}
                onClick={closeEditor}
              >
                Cancel
              </button>
              <button className="btn primary" disabled={busy}>
                {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {confirmation && (
        <ConfirmationDialog
          title={`${confirmation.status === "active" ? "Deactivate" : "Activate"} ${definition.singular}`}
          description={`${confirmation.status === "active" ? "Deactivate" : "Activate"} “${confirmation.name}”? ${replacing ? `Any currently active ${definition.singular} ${kind === "terms" ? "in this session" : "in this school"} will become inactive. Confirm to replace it.` : "Linked records will be retained. Deactivation does not delete any data."}`}
          error={formError}
          busy={busy}
          onClose={() => setConfirmation(null)}
          onConfirm={changeStatus}
        />
      )}
    </>
  );
}
