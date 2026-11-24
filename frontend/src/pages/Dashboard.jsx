import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  School,
  CircleCheck,
  CirclePause,
  Users,
  Plus,
  Building2,
} from "lucide-react";
import { api, errorMessage } from "../lib/api";
import SchoolTable from "../components/SchoolTable";
import SchoolDetails from "../components/SchoolDetails";
import SchoolForm from "../components/SchoolForm";
export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [register, setRegister] = useState(false);
  const [selected, setSelected] = useState(null);
  const load = useCallback(async () => {
    setError("");
    try {
      const [stats, recent] = await Promise.all([
        api.get("/schools/stats"),
        api.get("/schools?limit=5"),
      ]);
      setData({ stats: stats.data, schools: recent.data.schools });
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  const cards = [
    {
      key: "totalSchools",
      title: "Total schools",
      icon: School,
      color: "blue",
      note: "Across your network",
    },
    {
      key: "activeSchools",
      title: "Active schools",
      icon: CircleCheck,
      color: "green",
      note: "Currently operational",
    },
    {
      key: "suspendedSchools",
      title: "Suspended schools",
      icon: CirclePause,
      color: "amber",
      note: "Access temporarily paused",
    },
    {
      key: "totalUsers",
      title: "Total users",
      icon: Users,
      color: "purple",
      note: "Platform & school accounts",
    },
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR NETWORK AT A GLANCE</div>
          <h1>Platform overview</h1>
          <p>A clear view of your schools, all in one place.</p>
        </div>
        <button className="btn primary" onClick={() => setRegister(true)}>
          <Plus size={18} />
          Register school
        </button>
      </div>
      {error ? (
        <div className="alert error" role="alert">
          {error} <button onClick={load}>Try again</button>
        </div>
      ) : !data ? (
        <div className="loading-state">Loading your network…</div>
      ) : (
        <>
          <div className="stats-grid">
            {cards.map(({ key, title, icon: Icon, color, note }) => (
              <article className="stat-card" key={key}>
                <div className="stat-top">
                  <span>{title}</span>
                  <span className={`stat-icon ${color}`}>
                    <Icon size={21} />
                  </span>
                </div>
                <strong className="stat-value">
                  {data.stats[key].toLocaleString()}
                </strong>
                <p>{note}</p>
              </article>
            ))}
          </div>
          <section className="network-banner">
            <div className="banner-icon">
              <Building2 size={30} />
            </div>
            <div>
              <h2>Your schools. One connected workspace.</h2>
              <p>Register schools and manage access as your network grows.</p>
            </div>
            <Link className="btn secondary" to="/schools">
              Manage schools
            </Link>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Recently registered schools</h2>
                <p>The latest additions to your school network.</p>
              </div>
              <Link className="text-link" to="/schools">
                View all schools
              </Link>
            </div>
            {data.schools.length ? (
              <SchoolTable schools={data.schools} onView={setSelected} />
            ) : (
              <div className="empty-state">
                <School size={34} />
                <h3>Your school network starts here</h3>
                <p>Register your first school to get started.</p>
                <button
                  className="btn primary"
                  onClick={() => setRegister(true)}
                >
                  <Plus size={17} />
                  Register school
                </button>
              </div>
            )}
          </section>
        </>
      )}
      {register && (
        <SchoolForm
          onClose={() => setRegister(false)}
          onCreated={() => {
            setRegister(false);
            load();
          }}
        />
      )}
      {selected && (
        <SchoolDetails
          school={selected}
          onClose={() => setSelected(null)}
          onUpdate={(school) => {
            setSelected(school);
            load();
          }}
        />
      )}
    </>
  );
}
