import { useState } from "react";
import { FileBarChart, Search } from "lucide-react";
import { api } from "../lib/api";
import { configurationError } from "../lib/academicConfiguration";
import {
  attendanceToday,
  attendanceLabels,
  attendancePercent,
} from "../lib/attendance";
import { studentName } from "../lib/students";
import useStudentOptions from "../hooks/useStudentOptions";
import AttendancePlacementFields from "../components/AttendancePlacementFields";
import AttendanceSummary from "../components/AttendanceSummary";
import AttendanceAudit from "../components/AttendanceAudit";
import EntityPicker from "../components/EntityPicker";
import Modal from "../components/Modal";
import Pagination from "../components/Pagination";
export default function AttendanceReports() {
  const { options, error: optionsError, reload } = useStudentOptions();
  const [filters, setFilters] = useState({
    kind: "student",
    period: "daily",
    date: attendanceToday(),
    from: attendanceToday(),
    to: attendanceToday(),
    sessionId: "",
    classId: "",
    arm: "",
    category: "",
    status: "",
    search: "",
  });
  const [person, setPerson] = useState(null),
    [picker, setPicker] = useState(false),
    [data, setData] = useState(null),
    [loaded, setLoaded] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [audit, setAudit] = useState(null);
  function change(event) {
    const { name, value } = event.target;
    if (name === "kind") {
      setPerson(null);
      setFilters((previous) => ({
        ...previous,
        kind: value,
        sessionId: "",
        classId: "",
        arm: "",
        category: "",
      }));
    } else
      setFilters((previous) => ({
        ...previous,
        [name]: value,
        ...(name === "classId" ? { arm: "" } : {}),
      }));
  }
  async function load(values, selected, page = 1) {
    setBusy(true);
    setError("");
    const { kind, period, date, from, to, ...rest } = values;
    const params = {
      period,
      ...(period === "custom" ? { from, to } : { date }),
      ...rest,
      page,
      limit: 25,
    };
    if (kind === "staff") {
      delete params.sessionId;
      delete params.classId;
      delete params.arm;
    } else delete params.category;
    const endpoint = selected
      ? `/school/attendance/${kind}/history/${selected._id}`
      : "/school/attendance/reports";
    if (!selected) params.kind = kind;
    try {
      const { data } = await api.get(endpoint, { params });
      setData(data);
      setLoaded({ values: { ...values }, person: selected });
    } catch (e) {
      setError(configurationError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">ATTENDANCE MANAGEMENT</div>
          <h1>Attendance reports</h1>
          <p>
            Daily, weekly, monthly and individual histories with preserved audit
            information.
          </p>
        </div>
      </div>
      {optionsError && filters.kind === "student" && (
        <div className="alert error" role="alert">
          {optionsError}
          <button onClick={reload}>Reload academic filters</button>
        </div>
      )}
      <form
        className="panel attendance-filter-panel"
        onSubmit={(event) => {
          event.preventDefault();
          load(filters, person);
        }}
      >
        <fieldset className="attendance-controls" disabled={busy}>
          <label>
            Register
            <select name="kind" value={filters.kind} onChange={change}>
              <option value="student">Students</option>
              <option value="staff">Staff</option>
            </select>
          </label>
          <label>
            Period
            <select name="period" value={filters.period} onChange={change}>
              {["daily", "weekly", "monthly", "custom"].map((value) => (
                <option key={value} value={value}>
                  {value.charAt(0).toUpperCase() + value.slice(1)}
                </option>
              ))}
            </select>
          </label>
          {filters.period === "custom" ? (
            <>
              <label>
                From
                <input
                  name="from"
                  type="date"
                  required
                  max={attendanceToday()}
                  value={filters.from}
                  onChange={change}
                />
              </label>
              <label>
                To
                <input
                  name="to"
                  type="date"
                  required
                  max={attendanceToday()}
                  value={filters.to}
                  onChange={change}
                />
              </label>
            </>
          ) : (
            <label>
              Date in period (WAT)
              <input
                name="date"
                type="date"
                required
                max={attendanceToday()}
                value={filters.date}
                onChange={change}
              />
            </label>
          )}
          {filters.kind === "student" ? (
            <AttendancePlacementFields
              options={options}
              values={filters}
              onChange={change}
              all
            />
          ) : (
            <label>
              Staff category
              <select
                name="category"
                value={filters.category}
                onChange={change}
              >
                <option value="">All categories</option>
                <option value="teaching">Teaching</option>
                <option value="non_teaching">Non-teaching</option>
              </select>
            </label>
          )}
          <label>
            Status
            <select name="status" value={filters.status} onChange={change}>
              <option value="">All statuses</option>
              {Object.entries(attendanceLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Search name or ID
            <input
              name="search"
              maxLength={100}
              value={filters.search}
              onChange={change}
            />
          </label>
          <button
            type="button"
            className="btn secondary"
            onClick={() => setPicker(true)}
          >
            <Search size={17} />
            Choose individual
          </button>
          {person && (
            <div className="attendance-person">
              <strong>
                {filters.kind === "student"
                  ? studentName(person)
                  : person.fullName}
              </strong>
              <button
                type="button"
                className="text-link action-link"
                onClick={() => setPerson(null)}
              >
                Clear individual
              </button>
            </div>
          )}
          <button className="btn primary">
            {busy ? "Loading…" : "Run report"}
          </button>
        </fieldset>
      </form>
      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}
      {!data ? (
        <section className="panel empty-state">
          <FileBarChart size={32} />
          <h3>Choose a period to view attendance</h3>
          <p>
            Unmarked days are not inferred as absences. Weeks run Monday–Sunday;
            future days in the current period are excluded.
          </p>
        </section>
      ) : (
        !error && (
          <>
            <div className="page-heading">
              <div>
                <h2>
                  {loaded.values.kind === "student" ? "Student" : "Staff"}{" "}
                  report · {data.range.from} to {data.range.to}
                </h2>
                <p>
                  {loaded.person
                    ? `Individual: ${loaded.values.kind === "student" ? studentName(loaded.person) : loaded.person.fullName}`
                    : "All matching records"}{" "}
                  · summaries follow the selected filters.
                </p>
              </div>
            </div>
            <AttendanceSummary summary={data.summary} />
            <section className="panel attendance-report-panel">
              <div className="panel-heading">
                <h2>Daily breakdown</h2>
              </div>
              {!data.daily.length ? (
                <div className="empty-state">
                  <p>No recorded attendance for these filters.</p>
                </div>
              ) : (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Present</th>
                        <th>Absent</th>
                        <th>Late</th>
                        <th>Excused</th>
                        <th>Attendance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.daily.map((row) => (
                        <tr key={row.date}>
                          <td>{row.date}</td>
                          {["present", "absent", "late", "excused"].map(
                            (key) => (
                              <td key={key}>{row[key]}</td>
                            ),
                          )}
                          <td>{attendancePercent(row.attendancePercentage)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            <section className="panel">
              <div className="panel-heading">
                <h2>Attendance records</h2>
              </div>
              {!data.records.length ? (
                <div className="empty-state">
                  <p>No records match this report.</p>
                </div>
              ) : (
                <>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Name / ID</th>
                          <th>Placement / category</th>
                          <th>Status</th>
                          <th>Modified by</th>
                          <th>Audit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.records.map((row) => (
                          <tr key={row._id}>
                            <td>{row.date.slice(0, 10)}</td>
                            <td>
                              <strong>{row.personName}</strong>
                              <span className="staff-secondary">
                                {row.identifier}
                              </span>
                            </td>
                            <td>
                              {row.kind === "student"
                                ? `${row.sessionName} · ${row.className}${row.arm ? ` / ${row.arm}` : ""}`
                                : row.category === "teaching"
                                  ? "Teaching"
                                  : "Non-teaching"}
                            </td>
                            <td>{attendanceLabels[row.status]}</td>
                            <td>
                              {row.updatedByName}
                              <span className="staff-secondary">
                                {new Date(row.updatedAt).toLocaleString(
                                  "en-GB",
                                  { timeZone: "Africa/Lagos" },
                                )}{" "}
                                WAT
                              </span>
                            </td>
                            <td>
                              <button
                                className="text-link action-link"
                                onClick={() => setAudit(row)}
                              >
                                View history
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Pagination
                    page={data.page}
                    total={data.total}
                    limit={25}
                    onPage={(page) => load(loaded.values, loaded.person, page)}
                  />
                </>
              )}
            </section>
          </>
        )
      )}
      {picker && (
        <Modal
          title="Choose attendance history"
          onClose={() => setPicker(false)}
        >
          <div className="modal-body">
            <EntityPicker
              kind={filters.kind === "student" ? "students" : "staff"}
              allowArchived
              selected={person}
              onSelect={(record) => {
                setPerson(record);
                setPicker(false);
              }}
            />
          </div>
        </Modal>
      )}
      {audit && (
        <AttendanceAudit record={audit} onClose={() => setAudit(null)} />
      )}
    </>
  );
}
