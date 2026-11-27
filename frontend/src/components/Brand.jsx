import { GraduationCap } from "lucide-react";
import { SchoolLogo, SchoolContact } from "./SchoolIdentity";
export default function Brand({ school }) {
  return (
    <div className="brand">
      <span className="brand-icon">
        {school?.logoUrl ? (
          <SchoolLogo school={school} />
        ) : (
          <GraduationCap size={25} />
        )}
      </span>
      <div>
        {school?.name || "School Management"}
        <div className="brand-subtitle">
          {school ? <SchoolContact school={school} /> : "SCHOOL MANAGEMENT"}
        </div>
      </div>
    </div>
  );
}
