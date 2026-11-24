import { useCallback, useEffect, useState } from "react";
import {
  Plus,
  Search,
  Users,
  GraduationCap,
  Briefcase,
  CircleCheck,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { api } from "../lib/api";
import { configurationError } from "../lib/academicConfiguration";
import { staffLabels } from "../lib/staff";
import { StatusBadge } from "../components/SchoolTable";
import StaffForm from "../components/StaffForm";
import StaffDetails from "../components/StaffDetails";
import ConfirmationDialog from "../components/ConfirmationDialog";

export default function StaffManagement() {
  const [filters, setFilters] = useState({
    search: "",
    category: "",
    status: "",
    employmentType: "",
  });
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState(null);
  const [stats, setStats] = useState(null);
  const [options, setOptions] = useState(null);
  const [error, setError] = useState("");
  const [optionsError, setOptionsError] = useState("");
  const [actionError, setActionError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [editor, setEditor] = useState(null);
  const [selected, setSelected] = useState(null);
  const [confirmation, setConfirmation] = useState(null);
  const loadOptions = useCallback(async () => {
    setOptionsError("");
    try {
      const [classes, subjects] = await Promise.all([
        api.get("/school/classes"),
        api.get("/school/subjects"),
      ]);
      setOptions({
        classes: classes.data.records,
        subjects: subjects.data.records,
      });
    } catch (e) {
      setOptionsError(configurationError(e));
    }
  }, []);
  useEffect(() => {
    loadOptions();
  }, [loadOptions]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const timer = setTimeout(async () => {
      try {
        const [list, counts] = await Promise.all([
          api.get("/school/staff", {
            params: { ...filters, page, limit: 10 },
            signal: controller.signal,
          }),
          api.get("/school/staff/stats", { signal: controller.signal }),
        ]);
        if (page > 1 && !list.data.records.length && list.data.total > 0) {
          setPage(Math.ceil(list.data.total / 10));
          return;
        }
        setData(list.data);
        setStats(counts.data);
      } catch (e) {
        if (e.code !== "ERR_CANCELED") setError(configurationError(e));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [filters, page, revision]);
  function filter(name, value) {
    setFilters((previous) => ({ ...previous, [name]: value }));
    setPage(1);
  }
  async function openRecord(record, edit) {
    setBusy(true);
    setActionError("");
    try {
      const { data } = await api.get(`/school/staff/${record._id}`);
      if (edit) {
        setSelected(null);
        setEditor({ record: data.record });
      } else setSelected(data.record);
    } catch (e) {
      setActionError(configurationError(e));
    } finally {
      setBusy(false);
    }
  }
  async function statusChange() {
    setBusy(true);
    setActionError("");
    try {
      await api.patch(`/school/staff/${confirmation._id}/status`, {
        status: confirmation.status === "active" ? "inactive" : "active",
      });
      setConfirmation(null);
      setNotice(
        "Staff status updated. The record and its references have been retained.",
      );
      setRevision((value) => value + 1);
    } catch (e) {
      setActionError(configurationError(e));
    } finally {
      setBusy(false);
    }
  }
  const cards = [
    { key: "totalStaff", title: "Total staff", icon: Users, color: "blue" },
    {
      key: "teachingStaff",
      title: "Teaching staff",
      icon: GraduationCap,
      color: "purple",
    },
    {
      key: "nonTeachingStaff",
      title: "Non-teaching staff",
      icon: Briefcase,
      color: "amber",
    },
    {
      key: "activeStaff",
      title: "Active staff",
      icon: CircleCheck,
      color: "green",
    },
  ];
  const hasFilters = Object.values(filters).some(Boolean);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">PEOPLE & OPERATIONS</div>
          <h1>Teachers & staff</h1>
          <p>Manage your school's team, profiles, and teaching assignments.</p>
        </div>
        <button
          className="btn primary"
          disabled={!options || busy}
          onClick={() => {
            setActionError("");
            setEditor({ record: null });
          }}
        >
          <Plus size={18} />
          Add staff member
        </button>
      </div>
      {notice && (
        <div className="alert success" role="status">
          {notice}
        </div>
      )}
      {optionsError && (
        <div className="alert error" role="alert">
          {optionsError}
          <button onClick={loadOptions}>Reload assignment options</button>
        </div>
      )}
      {actionError && !confirmation && (
        <div className="alert error" role="alert">
          {actionError}
        </div>
      )}
      {error ? (
        <div className="alert error" role="alert">
          {error}
          <button onClick={() => setRevision((value) => value + 1)}>
            Retry
          </button>
        </div>
      ) : (
        !loading &&
        stats && (
          <div className="stats-grid staff-stats">
            {cards.map(({ key, title, icon: Icon, color }) => (
              <article className="stat-card" key={key}>
                <div className="stat-top">
                  <span>{title}</span>
                  <span className={`stat-icon ${color}`}>
                    <Icon size={21} />
                  </span>
                </div>
                <strong className="stat-value">
                  {stats[key].toLocaleString()}
                </strong>
                <p>
                  {key === "activeStaff"
                    ? `${stats.inactiveStaff} inactive records`
                    : "Across this school · all records"}
                </p>
              </article>
            ))}
          </div>
        )
      )}
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Staff directory</h2>
            <p>Search, review, and maintain your school staff records.</p>
          </div>
        </div>
        <div className="staff-filters">
          <div className="search-field">
            <Search size={18} />
            <input
              type="search"
              aria-label="Search staff"
              value={filters.search}
              maxLength={100}
              placeholder="Search name, ID, email, department…"
              onChange={(e) => filter("search", e.target.value)}
            />
          </div>
          {[
            ["category", "All categories", ["teaching", "non_teaching"]],
            ["status", "All statuses", ["active", "inactive"]],
            [
              "employmentType",
              "All employment types",
              ["full_time", "part_time", "contract", "temporary", "intern"],
            ],
          ].map(([key, label, values]) => (
            <select
              key={key}
              aria-label={label}
              value={filters[key]}
              onChange={(e) => filter(key, e.target.value)}
            >
              <option value="">{label}</option>
              {values.map((value) => (
                <option key={value} value={value}>
                  {staffLabels[value] ||
                    (value === "active" ? "Active" : "Inactive")}
                </option>
              ))}
            </select>
          ))}
        </div>
        {loading ? (
          <div className="loading-state" role="status">
            Loading staff records…
          </div>
        ) : error ? (
          <div className="empty-state">
            <p>Staff records could not be loaded. Please retry above.</p>
          </div>
        ) : !data?.records.length ? (
          <div className="empty-state">
            <Users size={34} />
            <h3>
              {hasFilters
                ? "No matching staff records"
                : "Build your school team"}
            </h3>
            <p>
              {hasFilters
                ? "Try another search or clear your filters."
                : "Add the first teaching or non-teaching staff member."}
            </p>
            {hasFilters && (
              <button
                className="btn secondary"
                onClick={() => {
                  setFilters({
                    search: "",
                    category: "",
                    status: "",
                    employmentType: "",
                  });
                  setPage(1);
                }}
              >
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Staff member</th>
                    <th>Employee ID</th>
                    <th>Category</th>
                    <th>Department / designation</th>
                    <th>Employment</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.records.map((record) => (
                    <tr key={record._id}>
                      <td>
                        <strong>{record.fullName}</strong>
                        <span className="staff-secondary">{record.email}</span>
                      </td>
                      <td>{record.employeeId}</td>
                      <td>{staffLabels[record.category]}</td>
                      <td>
                        {record.department}
                        <span className="staff-secondary">
                          {record.designation}
                        </span>
                      </td>
                      <td>{staffLabels[record.employmentType]}</td>
                      <td>
                        <StatusBadge status={record.status} />
                      </td>
                      <td>
                        <div className="table-actions">
                          <button
                            className="text-link"
                            disabled={!options || busy}
                            onClick={() => openRecord(record, false)}
                          >
                            View
                          </button>
                          <button
                            className="text-link"
                            disabled={!options || busy}
                            onClick={() => openRecord(record, true)}
                          >
                            Edit
                          </button>
                          <button
                            className="text-link"
                            disabled={busy}
                            onClick={() => {
                              setActionError("");
                              setConfirmation(record);
                            }}
                          >
                            {record.status === "active"
                              ? "Deactivate"
                              : "Activate"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pagination">
              <span>
                Showing {(page - 1) * 10 + 1}–{Math.min(page * 10, data.total)}{" "}
                of {data.total} staff
              </span>
              <div>
                <button
                  className="icon-button"
                  aria-label="Previous page"
                  disabled={page === 1}
                  onClick={() => setPage((value) => value - 1)}
                >
                  <ChevronLeft size={19} />
                </button>
                <span>Page {page}</span>
                <button
                  className="icon-button"
                  aria-label="Next page"
                  disabled={page * 10 >= data.total}
                  onClick={() => setPage((value) => value + 1)}
                >
                  <ChevronRight size={19} />
                </button>
              </div>
            </div>
          </>
        )}
      </section>
      {editor && (
        <StaffForm
          record={editor.record}
          {...options}
          onClose={() => setEditor(null)}
          onSaved={() => {
            setEditor(null);
            setNotice("Staff profile saved successfully.");
            setRevision((value) => value + 1);
          }}
        />
      )}
      {selected && (
        <StaffDetails
          record={selected}
          {...options}
          onClose={() => setSelected(null)}
          onEdit={(record) => {
            setSelected(null);
            setEditor({ record });
          }}
        />
      )}
      {confirmation && (
        <ConfirmationDialog
          title={`${confirmation.status === "active" ? "Deactivate" : "Activate"} staff member`}
          description={`${confirmation.status === "active" ? "Deactivate" : "Activate"} ${confirmation.fullName}? The profile, assignments, and any linked records will remain intact. Staff records do not control login account access.`}
          busy={busy}
          error={actionError}
          onClose={() => setConfirmation(null)}
          onConfirm={statusChange}
        />
      )}
    </>
  );
}
