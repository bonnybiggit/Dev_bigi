import { useEffect, useState, useId } from "react";
import { api } from "../lib/api";
import { configurationError } from "../lib/academicConfiguration";
import { studentName } from "../lib/students";
import Pagination from "./Pagination";
export default function EntityPicker({
  kind,
  onSelect,
  selected,
  disabled,
  allowArchived = false,
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const id = useId();
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    const timer = setTimeout(() => {
      api
        .get(`/school/${kind}`, {
          params: {
            search,
            page,
            limit: 5,
            ...(kind === "guardians" ? { status: "active" } : {}),
          },
          signal: controller.signal,
        })
        .then(({ data }) => setData(data))
        .catch((e) => {
          if (e.code !== "ERR_CANCELED") setError(configurationError(e));
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search, page, kind, revision]);
  return (
    <section className="entity-picker">
      <label htmlFor={id}>
        Find{" "}
        {kind === "students"
          ? "a student by name or admission number"
          : kind === "staff"
            ? "a staff member by name or employee ID"
            : "an active guardian by name, email, or phone"}
      </label>
      <input
        id={id}
        value={search}
        maxLength={100}
        disabled={disabled}
        type="search"
        onChange={(event) => {
          setSearch(event.target.value);
          setPage(1);
        }}
      />
      {selected && (
        <p className="field-help">
          Selected:{" "}
          <strong>
            {kind === "students" ? studentName(selected) : selected.fullName}
          </strong>
        </p>
      )}
      {loading ? (
        <p className="field-help" role="status">
          Loading matches…
        </p>
      ) : error ? (
        <div className="alert error" role="alert">
          {error}
          <button
            type="button"
            onClick={() => setRevision((value) => value + 1)}
          >
            Retry
          </button>
        </div>
      ) : !data?.records.length ? (
        <p className="field-help">
          No matches. Try a different search or register the profile first.
        </p>
      ) : (
        <>
          <div className="entity-results">
            {data.records.map((record) => (
              <button
                type="button"
                key={record._id}
                aria-pressed={selected?._id === record._id}
                disabled={
                  disabled ||
                  (kind === "students" &&
                    record.status === "archived" &&
                    !allowArchived)
                }
                onClick={() => onSelect(record)}
              >
                <strong>
                  {kind === "students" ? studentName(record) : record.fullName}
                </strong>
                <span>
                  {kind === "students"
                    ? `${record.admissionNumber}${record.status === "archived" ? " · archived" : ""}`
                    : kind === "staff"
                      ? record.employeeId
                      : record.primaryPhone}
                </span>
              </button>
            ))}
          </div>
          <Pagination
            page={page}
            total={data.total}
            limit={5}
            onPage={setPage}
          />
        </>
      )}
    </section>
  );
}
