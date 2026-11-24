import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Plus,
  Search,
  Users,
  CircleCheck,
  CirclePause,
  Link2,
} from "lucide-react";
import { api } from "../lib/api";
import { configurationError } from "../lib/academicConfiguration";
import GuardianForm from "../components/GuardianForm";
import GuardianStatusAction from "../components/GuardianStatusAction";
import Pagination from "../components/Pagination";
import { StatusBadge } from "../components/SchoolTable";
const initialFilters = { search: "", status: "", linkage: "" };
export default function GuardianManagement() {
  const navigate = useNavigate();
  const [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const timer = setTimeout(async () => {
      try {
        const [list, counts] = await Promise.all([
          api.get("/school/guardians", {
            params: { ...filters, page, limit: 10 },
            signal: controller.signal,
          }),
          api.get("/school/guardians/stats", { signal: controller.signal }),
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
  function filter(key, value) {
    setFilters((previous) => ({ ...previous, [key]: value }));
    setPage(1);
  }
  const cards = [
    {
      key: "totalGuardians",
      title: "Total guardians",
      icon: Users,
      color: "blue",
    },
    {
      key: "activeGuardians",
      title: "Active profiles",
      icon: CircleCheck,
      color: "green",
    },
    {
      key: "inactiveGuardians",
      title: "Inactive profiles",
      icon: CirclePause,
      color: "amber",
    },
    {
      key: "linkedStudents",
      title: "Linked students",
      icon: Link2,
      color: "purple",
    },
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">FAMILY CONTACTS</div>
          <h1>Parents & guardians</h1>
          <p>
            Manage contact profiles and student relationships across your
            school.
          </p>
        </div>
        <button className="btn primary" onClick={() => setCreating(true)}>
          <Plus size={18} />
          Register guardian
        </button>
      </div>
      {notice && (
        <div className="alert success" role="status">
          {notice}
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
              <article key={key} className="stat-card">
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
                  {key === "linkedStudents"
                    ? `${stats.relationships} current relationships`
                    : "Across this school · all profiles"}
                </p>
              </article>
            ))}
          </div>
        )
      )}
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Guardian directory</h2>
            <p>Search by name, email, or phone and review linked children.</p>
          </div>
        </div>
        <div className="guardian-filters">
          <div className="search-field">
            <Search size={18} />
            <input
              type="search"
              aria-label="Search guardians"
              maxLength={100}
              value={filters.search}
              placeholder="Search name, email, or phone…"
              onChange={(event) => filter("search", event.target.value)}
            />
          </div>
          <select
            aria-label="Guardian status filter"
            value={filters.status}
            onChange={(event) => filter("status", event.target.value)}
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <select
            aria-label="Guardian relationship filter"
            value={filters.linkage}
            onChange={(event) => filter("linkage", event.target.value)}
          >
            <option value="">All profiles</option>
            <option value="linked">With student links</option>
            <option value="unlinked">Without student links</option>
          </select>
        </div>
        {loading ? (
          <div className="loading-state" role="status">
            Loading guardians…
          </div>
        ) : error ? (
          <div className="empty-state">
            <p>Profiles could not be loaded. Please retry above.</p>
          </div>
        ) : !data?.records.length ? (
          <div className="empty-state">
            <Users size={32} />
            <h3>No guardians found</h3>
            <p>Register a profile or adjust your search and filters.</p>
            {Object.values(filters).some(Boolean) && (
              <button
                className="btn secondary"
                onClick={() => {
                  setFilters(initialFilters);
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
                    <th>Full name</th>
                    <th>Email</th>
                    <th>Primary phone</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.records.map((record) => (
                    <tr key={record._id}>
                      <td>
                        <strong>{record.fullName}</strong>
                      </td>
                      <td>{record.email || "Not recorded"}</td>
                      <td>{record.primaryPhone}</td>
                      <td>
                        <StatusBadge status={record.status} />
                      </td>
                      <td>
                        <div className="table-actions">
                          <Link
                            className="text-link"
                            to={`/school/guardians/${record._id}`}
                          >
                            View profile
                          </Link>
                          <GuardianStatusAction
                            record={record}
                            onUpdated={() => {
                              setNotice(
                                "Guardian status updated; student links retained.",
                              );
                              setRevision((value) => value + 1);
                            }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} total={data.total} onPage={setPage} />
          </>
        )}
      </section>
      {creating && (
        <GuardianForm
          onClose={() => setCreating(false)}
          onSaved={(record) => navigate(`/school/guardians/${record._id}`)}
        />
      )}
    </>
  );
}
