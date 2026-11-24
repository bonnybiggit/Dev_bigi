import {
  Users,
  CircleCheck,
  CircleX,
  Clock,
  ShieldCheck,
  ClipboardList,
} from "lucide-react";
import { attendancePercent } from "../lib/attendance";
export default function AttendanceSummary({ summary, roster = false }) {
  const cards = [
    {
      key: roster ? "expected" : "totalRecorded",
      title: roster ? "Expected roster" : "Recorded observations",
      icon: Users,
      color: "blue",
    },
    { key: "present", title: "Present", icon: CircleCheck, color: "green" },
    { key: "absent", title: "Absent", icon: CircleX, color: "amber" },
    { key: "late", title: "Late", icon: Clock, color: "purple" },
    { key: "excused", title: "Excused", icon: ShieldCheck, color: "blue" },
    ...(roster
      ? [
          {
            key: "unmarked",
            title: "Unmarked",
            icon: ClipboardList,
            color: "amber",
          },
        ]
      : []),
  ];
  return (
    <>
      <div className="stats-grid attendance-stats">
        {cards.map(({ key, title, icon: Icon, color }) => (
          <article className="stat-card" key={key}>
            <div className="stat-top">
              <span>{title}</span>
              <span className={`stat-icon ${color}`}>
                <Icon size={20} />
              </span>
            </div>
            <strong className="stat-value">
              {summary[key].toLocaleString()}
            </strong>
          </article>
        ))}
      </div>
      <p className="attendance-help">
        Attendance:{" "}
        <strong>{attendancePercent(summary.attendancePercentage)}</strong>.
        (Present + Late) ÷ (Present + Late + Absent). Excused and unmarked
        observations are excluded.{" "}
        {roster &&
          "Expected roster uses current eligible people plus retained records for the selected day; it is not an immutable historical enrolment count."}
      </p>
    </>
  );
}
