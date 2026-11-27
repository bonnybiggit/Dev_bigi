import { useState } from "react";
import { api } from "../lib/api";

export function SchoolLogo({ school, className = "school-logo" }) {
  const source = school?.logoUrl || "";
  const [failed, setFailed] = useState("");
  const url = source.startsWith("/api/")
    ? `${api.defaults.baseURL.replace(/\/$/, "")}/${source.slice(5)}`
    : source;
  return source && failed !== source ? (
    <img
      className={className}
      src={url}
      alt={`${school.name} logo`}
      referrerPolicy="no-referrer"
      onError={() => setFailed(source)}
    />
  ) : null;
}
export function SchoolContact({ school }) {
  return (
    <>
      <p>
        {[school?.address, school?.city, school?.country]
          .filter(Boolean)
          .join(", ")}
      </p>
      <p>{[school?.phone, school?.email].filter(Boolean).join(" | ")}</p>
    </>
  );
}
export default function SchoolIdentity({ school }) {
  return (
    <div className="school-identity">
      <SchoolLogo school={school} />
      <div>
        <h2>{school?.name || "School Management"}</h2>
        <SchoolContact school={school} />
      </div>
    </div>
  );
}
