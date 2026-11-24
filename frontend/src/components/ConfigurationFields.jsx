export default function ConfigurationFields({ fields, values, onChange }) {
  return (
    <div className="configuration-fields">
      {fields.map((field) => (
        <div className={field.wide ? "field-wide" : ""} key={field.name}>
          <label htmlFor={`field-${field.name}`}>
            {field.label}
            {field.required ? " *" : ""}
          </label>
          {field.type === "select" ? (
            <select
              id={`field-${field.name}`}
              name={field.name}
              value={values[field.name] ?? ""}
              onChange={onChange}
              required={field.required}
              disabled={field.disabled}
            >
              <option value="" disabled>
                Select {field.label.toLowerCase()}
              </option>
              {field.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : field.type === "textarea" ? (
            <textarea
              id={`field-${field.name}`}
              name={field.name}
              value={values[field.name] ?? ""}
              onChange={onChange}
              maxLength={field.maxLength}
              required={field.required}
              rows={3}
            />
          ) : (
            <>
              <input
                id={`field-${field.name}`}
                name={field.name}
                type={field.type || "text"}
                value={values[field.name] ?? ""}
                onChange={onChange}
                required={field.required}
                min={field.min}
                max={field.max}
                maxLength={field.maxLength}
                placeholder={field.placeholder}
                list={
                  field.suggestions ? `suggestions-${field.name}` : undefined
                }
              />
              {field.suggestions && (
                <datalist id={`suggestions-${field.name}`}>
                  {field.suggestions.map((value) => (
                    <option key={value} value={value} />
                  ))}
                </datalist>
              )}
            </>
          )}
          {field.help && <p className="field-help">{field.help}</p>}
        </div>
      ))}
    </div>
  );
}
