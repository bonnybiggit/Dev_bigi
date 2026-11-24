export default function FinanceFilters({
  context,
  values,
  onChange,
  statusOptions = [],
  children,
}) {
  return (
    <div className="attendance-controls">
      <label>
        Academic session
        <select name="sessionId" value={values.sessionId} onChange={onChange}>
          <option value="">All sessions</option>
          {context?.sessions.map((item) => (
            <option key={item._id} value={item._id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Term
        <select name="termId" value={values.termId} onChange={onChange}>
          <option value="">All terms</option>
          {context?.terms
            .filter(
              (item) =>
                !values.sessionId || item.sessionId === values.sessionId,
            )
            .map((item) => (
              <option key={item._id} value={item._id}>
                {item.name} ·{" "}
                {
                  context.sessions.find(
                    (session) => session._id === item.sessionId,
                  )?.name
                }
              </option>
            ))}
        </select>
      </label>
      <label>
        Class
        <select name="classId" value={values.classId} onChange={onChange}>
          <option value="">All classes</option>
          {context?.classes.map((item) => (
            <option key={item._id} value={item._id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        Search
        <input
          name="search"
          maxLength={100}
          value={values.search}
          onChange={onChange}
          placeholder="Name, number or reference"
        />
      </label>
      {statusOptions.length > 0 && (
        <label>
          Status
          <select name="status" value={values.status} onChange={onChange}>
            <option value="">All statuses</option>
            {statusOptions.map((status) => (
              <option key={status} value={status}>
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </option>
            ))}
          </select>
        </label>
      )}
      {children}
    </div>
  );
}
