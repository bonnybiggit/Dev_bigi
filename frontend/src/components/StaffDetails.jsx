import Modal from "./Modal";
import TeacherAccess from "./TeacherAccess";
import { StatusBadge } from "./SchoolTable";
import { staffFields, staffLabels } from "../lib/staff";
export default function StaffDetails({
  record,
  classes,
  subjects,
  onClose,
  onEdit,
}) {
  return (
    <Modal title="Staff profile" onClose={onClose}>
      <div className="modal-body">
        <h3>{record.fullName}</h3>
        <dl className="details staff-details">
          {staffFields
            .filter((field) => field.name !== "fullName")
            .map((field) => (
              <div key={field.name}>
                <dt>{field.label}</dt>
                <dd>
                  {field.type === "date"
                    ? record[field.name]?.slice(0, 10) || "Not recorded"
                    : staffLabels[record[field.name]] ||
                      record[field.name] ||
                      "Not recorded"}
                </dd>
              </div>
            ))}
          <div>
            <dt>Status</dt>
            <dd>
              <StatusBadge status={record.status} />
            </dd>
          </div>
          {record.category === "teaching" && (
            <>
              <div>
                <dt>Assigned classes</dt>
                <dd>
                  {record.classIds
                    .map((id) => {
                      const item = classes.find((item) => item._id === id);
                      return item
                        ? `${item.name}${item.status !== "active" ? " (inactive)" : ""}`
                        : "Unavailable class";
                    })
                    .join(", ") || "None assigned"}
                </dd>
              </div>
              <div>
                <dt>Assigned subjects</dt>
                <dd>
                  {record.subjectIds
                    .map((id) => {
                      const item = subjects.find((item) => item._id === id);
                      return item
                        ? `${item.name} (${classes.find((record) => record._id === item.classId)?.name || "Unavailable class"})${item.status !== "active" ? " — inactive" : ""}`
                        : "Unavailable subject";
                    })
                    .join(", ") || "None assigned"}
                </dd>
              </div>
            </>
          )}
        </dl>
        {record.category === "teaching" && <TeacherAccess staff={record} />}
        <div className="button-row">
          <button className="btn secondary" onClick={onClose}>
            Close
          </button>
          <button className="btn primary" onClick={() => onEdit(record)}>
            Edit profile
          </button>
        </div>
      </div>
    </Modal>
  );
}
