import { useEffect, useState } from "react";
import { Plus, Search, School, ChevronLeft, ChevronRight } from "lucide-react";
import { api, errorMessage } from "../lib/api";
import SchoolTable from "../components/SchoolTable";
import SchoolForm from "../components/SchoolForm";
import SchoolDetails from "../components/SchoolDetails";
export default function Schools() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [register, setRegister] = useState(false);
  const [selected, setSelected] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const timer = setTimeout(() => {
      api
        .get("/schools", {
          params: { search, page, limit: 10 },
          signal: controller.signal,
        })
        .then(({ data }) => setData(data))
        .catch((e) => {
          if (e.code !== "ERR_CANCELED") setError(errorMessage(e));
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search, page, revision]);
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">SCHOOL MANAGEMENT</div>
          <h1>Your school network</h1>
          <p>Register, review, and manage every school.</p>
        </div>
        <button className="btn primary" onClick={() => setRegister(true)}>
          <Plus size={18} />
          Register school
        </button>
      </div>
      {notice && (
        <div className="alert success" role="status">
          {notice}
        </div>
      )}
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>
              All schools{" "}
              <span className="count-badge">{data?.total ?? "—"}</span>
            </h2>
            <p>A central directory of your registered schools.</p>
          </div>
          <div className="search-field">
            <Search size={18} />
            <input
              type="search"
              aria-label="Search schools by name or location"
              placeholder="Search name or location…"
              value={search}
              maxLength={100}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>
        {loading ? (
          <div className="loading-state" role="status">
            Loading schools…
          </div>
        ) : error ? (
          <div className="alert error" role="alert">
            {error}{" "}
            <button onClick={() => setRevision((v) => v + 1)}>Try again</button>
          </div>
        ) : data?.schools.length ? (
          <>
            <SchoolTable schools={data.schools} onView={setSelected} />
            <div className="pagination">
              <span>
                Showing {(page - 1) * 10 + 1}–{Math.min(page * 10, data.total)}{" "}
                of {data.total} schools
              </span>
              <div>
                <button
                  className="icon-button"
                  aria-label="Previous page"
                  disabled={page === 1}
                  onClick={() => setPage((v) => v - 1)}
                >
                  <ChevronLeft size={19} />
                </button>
                <span>Page {page}</span>
                <button
                  className="icon-button"
                  aria-label="Next page"
                  disabled={page * 10 >= data.total}
                  onClick={() => setPage((v) => v + 1)}
                >
                  <ChevronRight size={19} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="empty-state">
            <School size={34} />
            <h3>
              {search
                ? "No schools match your search"
                : "Add your first school"}
            </h3>
            <p>
              {search
                ? "Try another school name, city, or country."
                : "Start with Bright Future International School, Lagos, Nigeria."}
            </p>
            {!search && (
              <button className="btn primary" onClick={() => setRegister(true)}>
                Register school
              </button>
            )}
          </div>
        )}
      </section>
      {register && (
        <SchoolForm
          onClose={() => setRegister(false)}
          onCreated={() => {
            setRegister(false);
            setSearch("");
            setPage(1);
            setRevision((v) => v + 1);
            setNotice("School registered successfully.");
          }}
        />
      )}
      {selected && (
        <SchoolDetails
          school={selected}
          onClose={() => setSelected(null)}
          onUpdate={(school) => {
            setSelected(school);
            setRevision((v) => v + 1);
            setNotice("School status updated.");
          }}
        />
      )}
    </>
  );
}
