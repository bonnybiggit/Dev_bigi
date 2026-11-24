import { Eye, School } from "lucide-react";
export function StatusBadge({ status }) {
  return (
    <span className={`badge ${status}`}>
      {status === "active"
        ? "Active"
        : status === "inactive"
          ? "Inactive"
          : status === "archived"
            ? "Archived"
            : "Suspended"}
    </span>
  );
}
export default function SchoolTable({ schools, onView }) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>School name</th>
            <th>Location</th>
            <th>School type</th>
            <th>Status</th>
            <th>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {schools.map((school) => (
            <tr key={school._id}>
              <td>
                <div className="school-name">
                  <span className="school-avatar">
                    <School size={20} />
                  </span>
                  <strong>{school.name}</strong>
                </div>
              </td>
              <td>
                {school.city}, {school.country}
              </td>
              <td>{school.schoolType}</td>
              <td>
                <StatusBadge status={school.status} />
              </td>
              <td>
                <button className="view-button" onClick={() => onView(school)}>
                  <Eye size={16} />
                  <span>View</span>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
