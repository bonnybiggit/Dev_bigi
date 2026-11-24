import { useState } from "react";
import Modal from "./Modal";
import { api } from "../lib/api";
import { configurationError } from "../lib/academicConfiguration";
import { defaultExam } from "../lib/examinations";
export default function ExaminationForm({ record, context, onClose, onSaved }) {
  const [values, setValues] = useState(() =>
    record
      ? {
          name: record.name,
          sessionId: record.sessionId,
          termId: record.termId,
          classId: record.classId,
          subjectIds: record.subjects.map((item) => item.subjectId),
          components: record.components.map((item) => ({ ...item })),
          totalMarks: record.totalMarks,
          gradingScale: record.gradingScale.map((item) => ({ ...item })),
          positionsEnabled: record.positionsEnabled,
          revision: record.revision,
        }
      : defaultExam(),
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  function change(event) {
    const { name, value } = event.target;
    setValues((previous) => ({
      ...previous,
      [name]: name === "totalMarks" ? Number(value) : value,
      ...(name === "sessionId" ? { termId: "" } : {}),
      ...(name === "classId" ? { subjectIds: [] } : {}),
    }));
  }
  function rowChange(type, index, key, value) {
    setValues((previous) => ({
      ...previous,
      [type]: previous[type].map((row, i) =>
        i === index
          ? {
              ...row,
              [key]: ["maxMarks", "weight", "minPercent"].includes(key)
                ? Number(value)
                : value,
            }
          : row,
      ),
    }));
  }
  async function submit(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const { data } = await api[record ? "put" : "post"](
        `/school/examinations${record ? `/${record._id}` : ""}`,
        values,
      );
      onSaved(data.record);
    } catch (e) {
      setError(configurationError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={record ? "Edit examination configuration" : "Create examination"}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form className="modal-body" onSubmit={submit}>
        <fieldset className="staff-form-fields" disabled={busy}>
          <label htmlFor="exam-name">Examination name</label>
          <input
            id="exam-name"
            name="name"
            maxLength={120}
            minLength={2}
            required
            value={values.name}
            onChange={change}
          />
          <div className="configuration-fields">
            {[
              ["sessionId", "Academic session", context.sessions],
              [
                "termId",
                "Academic term",
                context.terms.filter(
                  (item) => item.sessionId === values.sessionId,
                ),
              ],
              [
                "classId",
                "Class",
                context.classes.filter((item) => item.status === "active"),
              ],
            ].map(([key, label, rows]) => (
              <label key={key}>
                {label}
                <select
                  name={key}
                  required
                  value={values[key]}
                  onChange={change}
                >
                  <option value="">Select {label.toLowerCase()}</option>
                  {rows.map((item) => (
                    <option key={item._id} value={item._id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <label>
              Total final marks
              <input
                type="number"
                name="totalMarks"
                min={1}
                max={1000}
                required
                value={values.totalMarks}
                onChange={change}
              />
            </label>
          </div>
          <h3 className="finance-form-heading">Applicable subjects</h3>
          <div className="assignment-options">
            {context.subjects
              .filter(
                (item) =>
                  item.classId === values.classId && item.status === "active",
              )
              .map((item) => (
                <label key={item._id}>
                  <input
                    type="checkbox"
                    checked={values.subjectIds.includes(item._id)}
                    onChange={(event) =>
                      setValues((previous) => ({
                        ...previous,
                        subjectIds: event.target.checked
                          ? [...previous.subjectIds, item._id]
                          : previous.subjectIds.filter((id) => id !== item._id),
                      }))
                    }
                  />
                  {item.name}
                </label>
              ))}
          </div>
          <h3 className="finance-form-heading">Assessment components</h3>
          <p className="field-help">
            Weights must total 100%. Scores are normalized from raw maximum
            marks into the configured final total.
          </p>
          {values.components.map((item, index) => (
            <div className="exam-config-row" key={index}>
              <label>
                Key
                <input
                  aria-label={`Component ${index + 1} key`}
                  required
                  pattern="[a-z][a-z0-9_]{0,29}"
                  value={item.key}
                  onChange={(event) =>
                    rowChange("components", index, "key", event.target.value)
                  }
                />
              </label>
              <label>
                Name
                <input
                  required
                  maxLength={60}
                  value={item.name}
                  onChange={(event) =>
                    rowChange("components", index, "name", event.target.value)
                  }
                />
              </label>
              <label>
                Max marks
                <input
                  type="number"
                  min={1}
                  max={1000}
                  required
                  value={item.maxMarks}
                  onChange={(event) =>
                    rowChange(
                      "components",
                      index,
                      "maxMarks",
                      event.target.value,
                    )
                  }
                />
              </label>
              <label>
                Weight %
                <input
                  type="number"
                  min={1}
                  max={100}
                  required
                  value={item.weight}
                  onChange={(event) =>
                    rowChange("components", index, "weight", event.target.value)
                  }
                />
              </label>
              <button
                className="text-link action-link"
                type="button"
                disabled={values.components.length === 1}
                onClick={() =>
                  setValues((previous) => ({
                    ...previous,
                    components: previous.components.filter(
                      (_, i) => i !== index,
                    ),
                  }))
                }
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn secondary"
            disabled={values.components.length >= 10}
            onClick={() =>
              setValues((previous) => ({
                ...previous,
                components: [
                  ...previous.components,
                  {
                    key: `test_${previous.components.length + 1}`,
                    name: "Test",
                    maxMarks: 20,
                    weight: 10,
                  },
                ],
              }))
            }
          >
            Add component
          </button>
          <p className="field-help">
            Configured weight:{" "}
            {values.components.reduce((sum, item) => sum + item.weight, 0)}%
          </p>
          <h3 className="finance-form-heading">Grading scale</h3>
          <p className="field-help">
            Minimum percentages define non-overlapping bands. Include a 0% band;
            higher thresholds take precedence.
          </p>
          {values.gradingScale.map((item, index) => (
            <div className="exam-config-row" key={index}>
              <label>
                Minimum %
                <input
                  type="number"
                  required
                  min={0}
                  max={100}
                  value={item.minPercent}
                  onChange={(event) =>
                    rowChange(
                      "gradingScale",
                      index,
                      "minPercent",
                      event.target.value,
                    )
                  }
                />
              </label>
              <label>
                Grade
                <input
                  required
                  maxLength={10}
                  value={item.grade}
                  onChange={(event) =>
                    rowChange(
                      "gradingScale",
                      index,
                      "grade",
                      event.target.value,
                    )
                  }
                />
              </label>
              <label className="exam-wide-field">
                Remark
                <input
                  required
                  maxLength={100}
                  value={item.remark}
                  onChange={(event) =>
                    rowChange(
                      "gradingScale",
                      index,
                      "remark",
                      event.target.value,
                    )
                  }
                />
              </label>
              <button
                className="text-link action-link"
                type="button"
                disabled={values.gradingScale.length === 1}
                onClick={() =>
                  setValues((previous) => ({
                    ...previous,
                    gradingScale: previous.gradingScale.filter(
                      (_, i) => i !== index,
                    ),
                  }))
                }
              >
                Remove
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn secondary"
            disabled={values.gradingScale.length >= 15}
            onClick={() =>
              setValues((previous) => ({
                ...previous,
                gradingScale: [
                  ...previous.gradingScale,
                  { minPercent: 0, grade: "", remark: "" },
                ],
              }))
            }
          >
            Add grade band
          </button>
          <label className="finance-check">
            <input
              type="checkbox"
              checked={values.positionsEnabled}
              onChange={(event) =>
                setValues({ ...values, positionsEnabled: event.target.checked })
              }
            />
            Enable class positions (competition ties: 1, 1, 3)
          </label>
        </fieldset>
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        <div className="button-row">
          <button
            type="button"
            className="btn secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={busy || !values.subjectIds.length}
          >
            {busy ? "Saving…" : "Save examination"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
