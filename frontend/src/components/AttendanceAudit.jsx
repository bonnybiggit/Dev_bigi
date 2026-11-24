import { useEffect, useState } from "react";
import Modal from "./Modal";
import Pagination from "./Pagination";
import { api } from "../lib/api";
import { configurationError } from "../lib/academicConfiguration";
import { attendanceLabels } from "../lib/attendance";
export default function AttendanceAudit({ record, onClose }) {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [page, setPage] = useState(1),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError("");
    api
      .get(`/school/attendance/records/${record._id}/audit`, {
        params: { page, limit: 10 },
        signal: controller.signal,
      })
      .then(({ data }) => setData(data))
      .catch((e) => {
        if (e.code !== "ERR_CANCELED") setError(configurationError(e));
      });
    return () => controller.abort();
  }, [record._id, page, revision]);
  return (
    <Modal title="Attendance audit history" onClose={onClose}>
      <div className="modal-body">
        <h3>{record.personName}</h3>
        <p className="muted">
          {record.date.slice(0, 10)} · {record.identifier}
        </p>
        {error ? (
          <div className="alert error" role="alert">
            {error}
            <button onClick={() => setRevision((value) => value + 1)}>
              Retry
            </button>
          </div>
        ) : !data ? (
          <div className="loading-state">Loading audit history…</div>
        ) : (
          <>
            <div className="audit-list">
              {data.records.map((item) => (
                <article key={item._id}>
                  <strong>
                    {item.actorName} · Revision {item.revision}
                  </strong>
                  <p>
                    {new Date(item.createdAt).toLocaleString("en-GB", {
                      timeZone: "Africa/Lagos",
                    })}{" "}
                    WAT
                  </p>
                  <p>
                    {item.previousStatus
                      ? `${attendanceLabels[item.previousStatus]} → `
                      : "Created: "}
                    {attendanceLabels[item.status]}
                  </p>
                  {item.reason && <p>{item.reason}</p>}
                </article>
              ))}
            </div>
            {data.total > 0 && (
              <Pagination
                page={page}
                total={data.total}
                limit={10}
                onPage={setPage}
              />
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
