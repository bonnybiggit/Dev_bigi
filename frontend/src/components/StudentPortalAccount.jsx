import { useEffect, useState } from "react";
import { api, errorMessage } from "../lib/api";
import ConfirmationDialog from "./ConfirmationDialog";
export default function StudentPortalAccount({ student }) {
  const [data, setData] = useState(null),
    [enabled, setEnabled] = useState(false),
    [action, setAction] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [password, setPassword] = useState(""),
    [notice, setNotice] = useState("");
  useEffect(() => {
    let live = true;
    Promise.all([
      api.get(`/school/students/${student._id}/portal-account`),
      api.get("/school/student-portal-settings"),
    ])
      .then(([a, s]) => {
        if (live) {
          setData(a.data);
          setEnabled(s.data.enabled);
        }
      })
      .catch((e) => {
        if (live) setError(errorMessage(e));
      });
    return () => {
      live = false;
    };
  }, [student._id]);
  async function confirm() {
    setBusy(true);
    setError("");
    setNotice("");
    setPassword("");
    try {
      if (action === "finance") {
        const { data } = await api.put("/school/student-portal-settings", {
          enabled: !enabled,
        });
        setEnabled(data.enabled);
        setNotice("School-wide student fee visibility updated.");
      } else {
        const { data: result } = await api.post(
          `/school/students/${student._id}/portal-account`,
          { action },
        );
        setData((old) => ({ ...old, account: result.account }));
        setPassword(result.temporaryPassword || "");
        setNotice("Student portal account updated.");
      }
      setAction("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel administrator-section">
      <div className="panel-heading">
        <div>
          <h2>Student Portal Account</h2>
          <p>Student sign in: /student-login. Share login details securely.</p>
        </div>
      </div>
      <div className="modal-body">
        {error && !action && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        {notice && <p role="status">{notice}</p>}
        {!data ? (
          <p role="status">Loading portal account...</p>
        ) : (
          <>
            <p>
              School ID: <strong>{data.schoolId}</strong>
            </p>
            <p>
              Admission number: <strong>{data.admissionNumber}</strong>
            </p>
            <p>
              Account:{" "}
              {data.account
                ? data.account.isActive
                  ? "Active"
                  : "Deactivated"
                : "Not created"}
            </p>
            {data.account && (
              <p>
                First-login password change:{" "}
                {data.account.mustChangePassword ? "Required" : "Completed"}
              </p>
            )}
            <div className="button-row">
              {!data.account ? (
                <button
                  className="btn primary"
                  disabled={student.status !== "active"}
                  onClick={() => setAction("create")}
                >
                  Create student login
                </button>
              ) : (
                <>
                  <button
                    className="btn secondary"
                    disabled={
                      data.account.isActive
                        ? false
                        : student.status !== "active"
                    }
                    onClick={() =>
                      setAction(
                        data.account.isActive ? "deactivate" : "activate",
                      )
                    }
                  >
                    {data.account.isActive
                      ? "Deactivate account"
                      : "Activate account"}
                  </button>
                  <button
                    className="btn secondary"
                    disabled={student.status !== "active"}
                    onClick={() => setAction("reset")}
                  >
                    Reset password
                  </button>
                </>
              )}
            </div>
          </>
        )}
        {password && (
          <div className="credential-card" role="status">
            <strong>Temporary password - shown only now</strong>
            <p>
              <code>{password}</code>
            </p>
            <p>
              The student must change it on sign in. It cannot be retrieved
              after closing this view.
            </p>
            <button className="btn secondary" onClick={() => setPassword("")}>
              I have saved it securely
            </button>
          </div>
        )}
        <h3>School-wide student fee visibility</h3>
        <p>
          {enabled
            ? "Enabled: students can view their own invoices, payments and posted receipts."
            : "Disabled: students cannot view financial information."}
        </p>
        <button
          className="btn secondary"
          disabled={!data}
          onClick={() => setAction("finance")}
        >
          {enabled ? "Disable" : "Enable"} fee visibility for all students
        </button>
      </div>
      {action && (
        <ConfirmationDialog
          title={
            action === "finance"
              ? "Change school-wide fee visibility"
              : `${action} student portal account`
          }
          description={
            action === "finance"
              ? "This changes financial visibility for every student account in this school."
              : "This action is audited. Resetting a password or changing account status invalidates existing student sessions. Verify the student's identity before sharing a temporary password."
          }
          busy={busy}
          error={error}
          onClose={() => {
            setAction("");
            setError("");
          }}
          onConfirm={confirm}
        />
      )}
    </section>
  );
}
