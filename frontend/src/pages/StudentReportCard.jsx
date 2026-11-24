import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Printer } from "lucide-react";
import { api } from "../lib/api";
import { configurationError } from "../lib/academicConfiguration";
import { markText } from "../lib/examinations";
export default function StudentReportCard() {
  const { id, studentId } = useParams();
  const [publication, setPublication] = useState(""),
    [data, setData] = useState(null),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    setError("");
    setData(null);
    try {
      const { data } = await api.get(
        `/school/examinations/${id}/report-cards/${studentId}`,
        { params: publication ? { publication } : {} },
      );
      setData(data);
    } catch (e) {
      setError(configurationError(e));
    }
  }, [id, studentId, publication]);
  useEffect(() => {
    load();
  }, [load]);
  const card = data?.card.snapshot;
  return (
    <>
      <div className="page-heading no-print">
        <div>
          <div className="eyebrow">PUBLISHED REPORT CARD</div>
          <h1>Student report card</h1>
          <p>
            <Link className="text-link" to={`/school/examinations/${id}`}>
              Return to examination
            </Link>
          </p>
        </div>
        {data && (
          <button className="btn primary" onClick={() => window.print()}>
            <Printer size={18} />
            Print report card
          </button>
        )}
      </div>
      {error ? (
        <div className="alert error no-print" role="alert">
          {error}
          <button onClick={load}>Retry</button>
        </div>
      ) : !data ? (
        <div className="loading-state">Loading published report card…</div>
      ) : (
        <>
          <div className="attendance-filter-panel panel no-print">
            <label htmlFor="report-publication">
              Publication revision
              <select
                id="report-publication"
                value={publication}
                onChange={(event) => setPublication(event.target.value)}
              >
                <option value="">Latest publication</option>
                {data.publications.map((item) => (
                  <option key={item.publication} value={item.publication}>
                    Publication {item.publication} ·{" "}
                    {new Date(item.createdAt).toLocaleDateString("en-GB")}
                  </option>
                ))}
              </select>
            </label>
            {data.currentState !== "published" && (
              <p className="field-help">
                The examination is currently {data.currentState}. This is a
                retained previous publication.
              </p>
            )}
          </div>
          <article className="student-report-card">
            <header>
              <h2>{card.school.name}</h2>
              <p>
                {[card.school.address, card.school.city, card.school.country]
                  .filter(Boolean)
                  .join(", ")}
              </p>
              <h3>{card.examinationName}</h3>
              <p>
                {card.sessionName} · {card.termName} · {card.className}
                {card.arm ? ` / ${card.arm}` : ""}
              </p>
            </header>
            <div className="report-student">
              <strong>{card.studentName}</strong>
              <span>Admission: {card.admissionNumber}</span>
              <span>Publication {data.card.publication}</span>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Subject</th>
                    {card.components.map((component) => (
                      <th key={component.key}>
                        {component.name}
                        <span className="staff-secondary">
                          Max {component.maxMarks} · {component.weight}%
                        </span>
                      </th>
                    ))}
                    <th>Total / {card.totalMarks}</th>
                    <th>Grade</th>
                    <th>Remark</th>
                  </tr>
                </thead>
                <tbody>
                  {card.subjects.map((subject) => (
                    <tr key={subject.subjectId}>
                      <td>
                        <strong>{subject.subjectName}</strong>
                      </td>
                      {card.components.map((component) => (
                        <td key={component.key}>
                          {subject.scores[component.key]}
                        </td>
                      ))}
                      <td>{markText(subject.totalHundredths)}</td>
                      <td>{subject.grade}</td>
                      <td>{subject.remark}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="report-overall">
              <strong>
                Overall average: {markText(card.overallAverageHundredths)}%
              </strong>
              <span>
                {card.overallGrade} · {card.overallRemark}
              </span>
              {card.position !== null && (
                <span>
                  Class position: {card.position} of {card.cohortCount} · tied
                  positions use 1, 1, 3
                </span>
              )}
            </div>
            <section className="report-comments">
              <h3>Teacher comments</h3>
              {card.subjects.map((subject) => (
                <p key={subject.subjectId}>
                  <strong>{subject.subjectName}:</strong>{" "}
                  {subject.teacherComment || "Not provided"}
                </p>
              ))}
              <h3>Administrator comment</h3>
              <p>{card.administratorComment || "Not provided"}</p>
            </section>
            <section className="report-attendance">
              <h3>Term attendance (recorded days)</h3>
              <div>
                {["present", "absent", "late", "excused"].map((key) => (
                  <span key={key}>
                    {key.charAt(0).toUpperCase() + key.slice(1)}:{" "}
                    <strong>{card.attendance[key]}</strong>
                  </span>
                ))}
              </div>
              <p>
                Recorded observations: {card.attendance.totalRecorded} ·
                Attendance:{" "}
                {card.attendance.attendancePercentage === null
                  ? "—"
                  : `${card.attendance.attendancePercentage}%`}
                . Unmarked days are not inferred as absences; excused is
                excluded from the percentage denominator.
              </p>
            </section>
            <footer>
              Published by {data.card.publishedByName} ·{" "}
              {new Date(data.card.createdAt).toLocaleString("en-GB", {
                timeZone: "Africa/Lagos",
              })}{" "}
              WAT · Configuration v{card.configRevision}
            </footer>
          </article>
        </>
      )}
    </>
  );
}
