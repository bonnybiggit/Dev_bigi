export default function AttendancePlacementFields({
  options,
  values,
  onChange,
  disabled,
  all = false,
}) {
  const schoolClass = options?.classes.find(
    (record) => record._id === values.classId,
  );
  return (
    <>
      <label>
        Academic session
        <select
          name="sessionId"
          value={values.sessionId}
          disabled={disabled || !options}
          required={!all}
          onChange={onChange}
        >
          <option value="">{all ? "All sessions" : "Select session"}</option>
          {options?.sessions.map((item) => (
            <option key={item._id} value={item._id}>
              {item.name}
              {item.status !== "active" ? " (inactive)" : ""}
            </option>
          ))}
        </select>
      </label>
      <label>
        Class
        <select
          name="classId"
          value={values.classId}
          disabled={disabled || !options}
          required={!all}
          onChange={onChange}
        >
          <option value="">{all ? "All classes" : "Select class"}</option>
          {options?.classes.map((item) => (
            <option key={item._id} value={item._id}>
              {item.name}
              {item.status !== "active" ? " (inactive)" : ""}
            </option>
          ))}
        </select>
      </label>
      <label>
        Class arm
        <select
          name="arm"
          value={values.arm}
          disabled={disabled || !schoolClass?.arms.length}
          required={!all && !!schoolClass?.arms.length}
          onChange={onChange}
        >
          <option value="">
            {schoolClass?.arms.length
              ? all
                ? "All arms"
                : "Select arm"
              : "No arm"}
          </option>
          {schoolClass?.arms.map((arm) => (
            <option key={arm} value={arm}>
              {arm}
              {schoolClass.inactiveArms?.includes(arm) ? " (inactive)" : ""}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
