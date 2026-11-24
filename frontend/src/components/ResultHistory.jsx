import { useEffect, useState } from "react";
import Modal from "./Modal";
import Pagination from "./Pagination";
import { api } from "../lib/api";
import { configurationError } from "../lib/academicConfiguration";
import { markText } from "../lib/examinations";
export default function ResultHistory({ examinationId, result, onClose }) {
  const [data, setData] = useState(null),
    [error, setError] = useState(""),
    [page, setPage] = useState(1),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError("");
    api
      .get(
        `/school/examinations/${examinationId}/results/${result._id}/history`,
        { params: { page, limit: 10 }, signal: controller.signal },
      )
      .then(({ data }) => setData(data))
      .catch((e) => {
        if (e.code !== "ERR_CANCELED") setError(configurationError(e));
      });
    return () => controller.abort();
  }, [examinationId, result._id, page, revision]);
  return (
    <Modal title="Result revision history" onClose={onClose}>
      <div className="modal-body">
        <h3>
          {result.studentName} · {result.subjectName}
        </h3>
        {error ? (
          <div className="alert error" role="alert">
            {error}
            <button onClick={() => setRevision((value) => value + 1)}>
              Retry
            </button>
          </div>
        ) : !data ? (
          <div className="loading-state">Loading revisions…</div>
        ) : (
          <>
            <div className="audit-list">
              {data.records.map((record) => (
                <article key={record._id}>
                  <strong>
                    Revision {record.revision} ·{" "}
                    {record.event.replaceAll("_", " ")}
                  </strong>
                  <p>
                    {record.actorName} ·{" "}
                    {new Date(record.createdAt).toLocaleString("en-GB", {
                      timeZone: "Africa/Lagos",
                    })}{" "}
                    WAT
                  </p>
                  <p>
                    {Object.entries(record.snapshot.scores)
                      .map(([key, value]) => `${key}: ${value}`)
                      .join(" · ")}
                  </p>
                  <p>
                    Total: {markText(record.snapshot.totalHundredths)} ·{" "}
                    {record.snapshot.grade} · {record.snapshot.status}
                  </p>
                  {record.reason && <p>{record.reason}</p>}
                  {record.snapshot.teacherComment && (
                    <p>Teacher comment: {record.snapshot.teacherComment}</p>
                  )}
                </article>
              ))}
            </div>
            <Pagination
              page={page}
              total={data.total}
              limit={10}
              onPage={setPage}
            />
          </>
        )}
      </div>
    </Modal>
  );
}
