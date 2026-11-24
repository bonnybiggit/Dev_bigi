export default function ConfigurationTable({
  columns,
  records,
  onEdit,
  onStatus,
}) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.label}>{column.label}</th>
            ))}
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={record._id}>
              {columns.map((column) => (
                <td key={column.label}>{column.render(record)}</td>
              ))}
              <td>
                <div className="table-actions">
                  <button className="text-link" onClick={() => onEdit(record)}>
                    Edit
                  </button>
                  <button
                    className="text-link"
                    onClick={() => onStatus(record)}
                  >
                    {record.status === "active" ? "Deactivate" : "Activate"}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
