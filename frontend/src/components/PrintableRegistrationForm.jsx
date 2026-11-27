const fullName = (value) =>
  value?.fullName ||
  [value?.firstName, value?.middleName, value?.lastName]
    .filter(Boolean)
    .join(" ");
import { SchoolLogo } from "./SchoolIdentity";
const dateText = (value) =>
  value
    ? new Date(value).toLocaleDateString("en-GB", { timeZone: "Africa/Lagos" })
    : "";
function Field({ label, value, wide = false, large = false }) {
  return (
    <div
      className={`paper-field ${wide ? "paper-wide" : ""} ${large ? "paper-large" : ""}`}
    >
      <span>{label}</span>
      <div className="writing-line">{value || "\u00a0"}</div>
    </div>
  );
}
function Signature({ label = "Signature" }) {
  return (
    <div className="paper-grid signature-area">
      <Field label={label} />
      <Field label="Date" />
    </div>
  );
}
function StudentIdentity({ s, snapshot }) {
  return (
    <div className="paper-grid">
      <Field label="Student full name" value={fullName(s)} wide />
      <Field label="Admission number (if enrolled)" value={s.admissionNumber} />
      <Field label="Academic session" value={snapshot.sessionName} />
      <Field label="Class" value={snapshot.className} />
      <Field label="Arm" value={snapshot.arm} />
    </div>
  );
}
function GuardianFields({ g, index }) {
  return (
    <section className="paper-section">
      <h3>Parent / guardian {index + 1}</h3>
      <div className="paper-grid">
        <Field label="Full name" value={g.fullName} wide />
        <Field
          label="Relationship to student"
          value={
            g.relationship === "guardian" && !g.fullName ? "" : g.relationship
          }
        />
        <Field label="Primary phone" value={g.primaryPhone} />
        <Field label="Alternative phone" value={g.alternativePhone} />
        <Field label="Email (if available)" value={g.email} />
        <Field label="Occupation (where required)" value={g.occupation} />
        <Field label="Emergency contact name" value={g.emergencyContactName} />
        <Field
          label="Emergency contact phone / relationship"
          value={[g.emergencyContactPhone, g.emergencyContactRelationship]
            .filter(Boolean)
            .join(" / ")}
        />
        <Field label="Residential address" value={g.address} wide large />
      </div>
    </section>
  );
}
function SafetyFields({ medical = {} }) {
  return (
    <>
      <p>
        Provide only information relevant to safety at school. Do not include
        unnecessary medical history.
      </p>
      <div className="paper-grid">
        <Field
          label="Relevant allergies"
          value={medical.allergies}
          wide
          large
        />
        <Field
          label="Relevant medical conditions"
          value={medical.conditions}
          wide
          large
        />
        <Field
          label="Guardian-provided school safety instructions"
          value={medical.safetyInstructions}
          wide
          large
        />
        <Field label="Emergency contact name" value={medical.emergencyName} />
        <Field label="Emergency contact phone" value={medical.emergencyPhone} />
        <Field
          label="Relationship to student"
          value={medical.emergencyRelationship}
        />
      </div>
    </>
  );
}
const chunks = (items, size) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, (i + 1) * size),
  );
export default function PrintableRegistrationForm({ document, title }) {
  const snapshot = document.snapshot,
    s = snapshot.student || {},
    staff = snapshot.staff || {},
    administrator = snapshot.administrator || {},
    school = snapshot.school || {},
    type = document.type;
  const boundedMedical = { ...(snapshot.medical || {}) };
  for (const key of ["allergies", "conditions", "safetyInstructions"])
    if ((boundedMedical[key] || "").length > 300)
      boundedMedical[key] =
        "See referenced safety-information continuation pages.";
  const pages = [];
  const add = (heading, content) => pages.push({ heading, content });
  const official = (
    <>
      <h3>Official use only</h3>
      <div className="paper-grid">
        <Field
          label="Admission decision"
          value={
            snapshot.applicationStatus === "approved" ||
            snapshot.applicationStatus === "enrolled"
              ? "Approved"
              : ""
          }
        />
        <Field
          label="Approved class / arm"
          value={[snapshot.className, snapshot.arm].filter(Boolean).join(" / ")}
        />
        <Field label="Admission number" value={s.admissionNumber} />
        <Field label="Admission date" value={dateText(s.admissionDate)} />
        <Field label="Reviewing administrator" />
        <Field label="Administrator signature / date" />
      </div>
      <div className="stamp-placeholder">Official school stamp</div>
    </>
  );
  if (type === "student_application") {
    add(
      "Student personal information",
      <>
        <div className="passport-placeholder">
          Affix passport photograph here
        </div>
        <div className="paper-grid">
          <Field label="Surname" value={s.lastName} />
          <Field label="First name" value={s.firstName} />
          <Field label="Middle name" value={s.middleName} />
          <Field
            label="Date of birth"
            value={s.dateOfBirth ? String(s.dateOfBirth).slice(0, 10) : ""}
          />
          <Field
            label="Gender"
            value={s.gender === "not_specified" ? "" : s.gender}
          />
          <Field label="Nationality (where required)" value={s.nationality} />
          <Field label="Residential address" value={s.address} wide large />
          <Field label="Previous school" value={s.previousSchool} wide large />
          <Field label="Class applying for" value={snapshot.className} />
          <Field label="Intended arm (if known)" value={snapshot.arm} />
          <Field
            label="Intended academic session"
            value={snapshot.sessionName}
            wide
          />
        </div>
        <p>
          Complete all relevant sections. Issuing this form does not enrol a
          student or create a login account.
        </p>
      </>,
    );
    const guardians = snapshot.guardians?.length
      ? snapshot.guardians
      : [{}, {}];
    chunks(guardians, 1).forEach((group, i) =>
      add(
        "Parent and guardian information",
        <>
          {group.map((g, j) => (
            <GuardianFields key={j} g={g} index={i + j} />
          ))}
          <p>
            Additional guardians may be recorded on a clearly referenced
            continuation sheet. The school verifies identity and relationships
            before linking records.
          </p>
        </>,
      ),
    );
    add(
      "Medical and emergency information",
      <>
        <SafetyFields medical={boundedMedical} />
      </>,
    );
    chunks(snapshot.checklist, 6).forEach((group, i) =>
      add(
        i ? "Supporting documents continuation" : "Supporting documents",
        <>
          <h3>Supporting documents checklist</h3>
          <div className="paper-checklist">
            {group.map((label) => (
              <div key={label}>
                <span className="paper-checkbox">
                  {snapshot.receivedDocuments?.includes(label) ? "X" : ""}
                </span>
                {label}
              </div>
            ))}
          </div>
          <Field label="Additional document notes" wide large />
        </>,
      ),
    );
    const privacy = Array.from(
      snapshot.privacyNotice || "Contact the school for its privacy notice.",
    );
    chunks(privacy, 750).forEach((part, i) =>
      add(
        i
          ? "Privacy notice continuation"
          : "Parent declaration and privacy notice",
        <>
          <h3>School privacy notice</h3>
          <p className="paper-notice">{part.join("")}</p>
          {i === Math.ceil(privacy.length / 750) - 1 && (
            <>
              <h3>Parent / guardian declaration</h3>
              <p>
                I confirm that the information supplied is accurate to the best
                of my knowledge. I will notify the school of relevant changes
                and have read the school-specific privacy notice.
              </p>
              <Field label="Parent / guardian name" />
              <Signature label="Parent / guardian signature" />
            </>
          )}
        </>,
      ),
    );
    add("Official admission review", official);
  } else if (type === "guardian_registration") {
    add(
      "Guardian identity, contact and declaration",
      <>
        <GuardianFields g={snapshot.guardians?.[0] || {}} index={0} />
        <p>
          I confirm that these details are accurate. The school must verify my
          identity and relationship to each child; sharing a phone number alone
          does not establish identity.
        </p>
        <p className="paper-notice">
          {snapshot.privacyNotice.length > 500
            ? "School privacy notice: see the referenced continuation pages."
            : snapshot.privacyNotice}
        </p>
        <Signature label="Guardian signature" />
      </>,
    );
    const children = snapshot.children?.length
      ? snapshot.children
      : Array.from({ length: 8 }, () => ({}));
    chunks(children, 4).forEach((group) =>
      add(
        "Children attending the school",
        <>
          <p>
            One verified guardian record can link to several children. Do not
            create a duplicate record solely because another child applies.
          </p>
          <table className="paper-table">
            <thead>
              <tr>
                <th>Child's name</th>
                <th>Admission number</th>
                <th>Class / arm</th>
                <th>Relationship</th>
              </tr>
            </thead>
            <tbody>
              {group.map((c, i) => (
                <tr key={i}>
                  <td>{fullName(c)}</td>
                  <td>{c.admissionNumber}</td>
                  <td>{[c.className, c.arm].filter(Boolean).join(" / ")}</td>
                  <td>{c.relationship}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>,
      ),
    );
    add(
      "Official guardian verification",
      <>
        <Field
          label="Existing verified guardian record / new record decision"
          wide
        />
        <Field label="Verified by school administrator / date" wide />
        <Signature />
      </>,
    );
  } else if (type === "medical_emergency") {
    add(
      "Private student safety information",
      <>
        <StudentIdentity s={s} snapshot={snapshot} />
        <SafetyFields medical={boundedMedical} />
        <p>
          Restricted school record. Share only with authorised school personnel
          under school procedures.
        </p>
        <Signature label="Parent / guardian signature" />
      </>,
    );
    add(
      "Emergency contact verification",
      <>
        <StudentIdentity s={s} snapshot={snapshot} />
        <div className="paper-grid">
          <Field label="Additional emergency contact name" />
          <Field label="Phone / relationship" />
          <Field label="School safety arrangements discussed" wide large />
          <Field label="Changes notified to the school" wide large />
        </div>
        <p>
          Record only necessary operational safety information. This form does
          not provide medical advice or replace the school's emergency
          procedures.
        </p>
        <Field label="School administrator receiving this information" />
        <Signature />
      </>,
    );
  } else if (["teacher_registration", "staff_registration"].includes(type)) {
    add(
      "Personal and professional information",
      <>
        <div className="passport-placeholder">Passport photograph</div>
        <div className="paper-grid">
          <Field label="Full name" value={staff.fullName} wide />
          <Field label="Phone" value={staff.phone} />
          <Field label="Email" value={staff.email} />
          <Field label="Residential address" value={staff.address} wide large />
          <Field label="Educational qualifications" wide large />
          <Field label="Professional certifications" wide large />
          <Field
            label={
              type === "teacher_registration"
                ? "Teaching experience"
                : "Relevant work experience"
            }
            wide
            large
          />
        </div>
      </>,
    );
    add(
      "Employment declaration and official approval",
      <>
        <div className="paper-grid">
          <Field label="Previous employment" wide large />
          <Field label="Proposed designation" />
          <Field label="Emergency contact name" />
          <Field label="Emergency phone / relationship" wide />
        </div>
        <p>
          I confirm the accuracy of the information supplied. Official
          employment and any teaching assignments require separate school
          authorisation. No passwords or authentication secrets should be
          written on this form.
        </p>
        <Signature label="Applicant signature" />
        <h3>Official use only</h3>
        <div className="paper-grid">
          <Field label="Employee ID" value={staff.employeeId} />
          <Field
            label="Employment date"
            value={dateText(staff.employmentDate)}
          />
          <Field label="Approved designation" value={staff.designation} />
          <Field label="Department" value={staff.department} />
          <Field label="Employment status" value={staff.status} />
          <Field label="Administrator approval" />
        </div>
        <Signature label="Authorising administrator signature" />
      </>,
    );
  } else if (type === "administrator_registration") {
    add(
      "Administrator registration information",
      <>
        <div className="paper-grid">
          <Field label="Full name" value={administrator.name} wide />
          <Field label="Phone" value={administrator.phone} />
          <Field label="Email" value={administrator.email} />
          <Field label="Residential / contact address" wide large />
          <Field label="Qualifications (where required)" wide large />
          <Field label="Designation" />
          <Field label="Employment information" wide large />
        </div>
        <Signature label="Applicant signature" />
      </>,
    );
    add(
      "Responsibilities and official approval",
      <>
        <Field label="Applicant name" value={administrator.name} />
        <Field label="Requested / authorised responsibilities" wide large />
        <Field label="Employment date / department / status" wide large />
        <p>
          This printed form does not grant permissions or create an
          administrator account. School administrator account provisioning
          remains under Super Administrator authority.
        </p>
        <Signature label="Official authorisation signature" />
        <Field label="Approving authority and approval date" wide />
        <div className="stamp-placeholder">Official school stamp</div>
      </>,
    );
  } else if (type === "teacher_assignment") {
    const assignments = snapshot.assignments?.length
      ? snapshot.assignments
      : Array.from({ length: 6 }, () => ({}));
    chunks(assignments, 6).forEach((group) =>
      add(
        "Class and subject allocation record",
        <>
          <div className="paper-grid">
            <Field label="Teacher name" value={staff.fullName} />
            <Field label="Employee ID" value={staff.employeeId} />
          </div>
          {snapshot.assignmentMode === "legacy" && (
            <p>
              Legacy arrays require administrator review. No academic period or
              arm relationships have been inferred.
            </p>
          )}
          <table className="paper-table">
            <thead>
              <tr>
                <th>Session / term</th>
                <th>Class / arm</th>
                <th>Subject</th>
                <th>Lead class teacher</th>
                <th>Attendance scope recorded</th>
              </tr>
            </thead>
            <tbody>
              {group.map((a, i) => (
                <tr key={i}>
                  <td>
                    {[a.sessionName, a.termName].filter(Boolean).join(" / ")}
                  </td>
                  <td>{[a.className, a.arm].filter(Boolean).join(" / ")}</td>
                  <td>{a.subjectName}</td>
                  <td>
                    {a.kind ? (a.kind === "class_teacher" ? "Yes" : "No") : ""}
                  </td>
                  <td>
                    {a.kind
                      ? a.attendance
                        ? "Explicit grant; verify period"
                        : "Not granted"
                      : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            Official permissions remain controlled by Teacher Assignments in the
            system. Signing or editing this paper does not change subject,
            attendance, financial or administrative access.
          </p>
          <Signature label="Teacher acknowledgement" />
          <Signature label="School administrator authorisation" />
        </>,
      ),
    );
  } else if (type === "admission_acceptance") {
    add(
      "Admission decision and acceptance",
      <>
        <p>To the parent / guardian of:</p>
        <StudentIdentity s={s} snapshot={snapshot} />
        <h3>
          Admission decision:{" "}
          {document.generic ? "________________" : "Approved"}
        </h3>
        <p>
          This letter records the school's admission decision for the academic
          session and class stated above. Application reference:{" "}
          {snapshot.applicationReference || "________________"}.
        </p>
        <p>
          {s.admissionNumber
            ? "The permanent admission number shown above identifies the registered student."
            : "Approval of an application is separate from completed enrolment. A permanent admission number is issued only when enrolment is completed."}
        </p>
        <Field
          label="School-specific acceptance instructions / conditions"
          wide
          large
        />
        <Signature label="Authorised school administrator signature" />
        <div className="stamp-placeholder">Official school stamp</div>
        <h3>Parent / guardian acknowledgement</h3>
        <Field label="Parent / guardian full name" />
        <Signature label="Acceptance acknowledgement signature" />
      </>,
    );
  } else if (["student_transfer", "student_withdrawal"].includes(type)) {
    add(
      type === "student_transfer" ? "Transfer request" : "Withdrawal request",
      <>
        <StudentIdentity s={s} snapshot={snapshot} />
        <div className="paper-grid">
          <Field label="Requested effective date" />
          <Field label="Parent / guardian name and phone" />
          <Field label="Reason for request" wide large />
          {type === "student_transfer" && (
            <>
              <Field label="Destination school / proposed class" wide large />
              <Field label="Destination school contact details" wide large />
            </>
          )}
        </div>
        <p>
          This request form does not change enrolment records. An authorised
          administrator must review and record any approved change separately.
        </p>
        <Signature label="Parent / guardian signature" />
      </>,
    );
    add(
      "Official review and handover",
      <>
        <StudentIdentity s={s} snapshot={snapshot} />
        <Field label="Review decision / authorised action" wide large />
        <Field label="Documents returned / handover details" wide large />
        <Field label="Approved effective date" />
        <Field label="School administrator handling the request" />
        <Signature label="Authorising signature" />
        <div className="stamp-placeholder">Official school stamp</div>
      </>,
    );
  } else if (type === "student_clearance") {
    add(
      "Administrative clearance review",
      <>
        <StudentIdentity s={s} snapshot={snapshot} />
        <p>
          Each department completes its own review. Blank or unsigned fields do
          not certify clearance. No fee-access restriction is applied by issuing
          this form.
        </p>
        <table className="paper-table">
          <thead>
            <tr>
              <th>Department / item</th>
              <th>Review outcome / notes</th>
              <th>Officer signature / date</th>
            </tr>
          </thead>
          <tbody>
            {[
              "Accounts / finance review",
              "Library materials",
              "School property",
              "Class records",
              "Academic records",
              "Other school requirements",
            ].map((label) => (
              <tr key={label}>
                <td>{label}</td>
                <td />
                <td />
              </tr>
            ))}
          </tbody>
        </table>
      </>,
    );
    add(
      "Clearance authorisation",
      <>
        <StudentIdentity s={s} snapshot={snapshot} />
        <Field label="Final school decision / outstanding items" wide large />
        <Signature label="Authorised administrator signature" />
        <div className="stamp-placeholder">Official school stamp</div>
      </>,
    );
  }
  if (["student_application", "medical_emergency"].includes(type)) {
    for (const [key, label] of [
      ["allergies", "Allergies"],
      ["conditions", "Medical conditions"],
      ["safetyInstructions", "School safety instructions"],
    ]) {
      const value = snapshot.medical?.[key] || "";
      if (value.length > 300)
        chunks(Array.from(value), 500).forEach((part, index) =>
          add(
            label + " continuation " + (index + 1),
            <>
              <StudentIdentity s={s} snapshot={snapshot} />
              <Field label={label} value={part.join("")} wide large />
              <p>
                Restricted safety record. Keep this continuation with the
                referenced form.
              </p>
            </>,
          ),
        );
    }
  }
  if (type === "guardian_registration" && snapshot.privacyNotice.length > 500)
    chunks(Array.from(snapshot.privacyNotice), 700).forEach((part, index) =>
      add(
        "School privacy notice " + (index + 1),
        <p className="paper-notice">{part.join("")}</p>,
      ),
    );
  return (
    <div className="registration-print-preview">
      {pages.map((page, index) => (
        <article className="registration-form-sheet" key={index}>
          <header className="registration-form-header">
            <SchoolLogo school={school} />
            <div>
              <h1>{school.name}</h1>
              <p>
                {[school.address, school.city, school.country]
                  .filter(Boolean)
                  .join(", ")}
              </p>
              <p>{[school.phone, school.email].filter(Boolean).join(" | ")}</p>
            </div>
          </header>
          <div className="form-reference">
            <strong>
              {document.generic
                ? "GENERIC TEMPLATE - UNTRACKED / NOT ISSUED"
                : document.reference}
            </strong>
            <span>
              Date issued: {dateText(document.createdAt) || "________________"}
            </span>
          </div>
          {(document.status === "cancelled" ||
            ["cancelled", "withdrawn", "rejected"].includes(
              document.applicationStatus || snapshot.applicationStatus,
            )) && (
            <div className="paper-cancelled">
              {document.applicationStatus || document.status} - retained copy
              only
            </div>
          )}
          <h2>{title}</h2>
          <h3 className="form-page-title">{page.heading}</h3>
          <div className="form-sheet-content">{page.content}</div>
          <footer className="registration-form-footer">
            <span>{school.name}</span>
            <span>
              {document.reference || "Generic template"} | v
              {document.templateVersion} | Page {index + 1} of {pages.length}
            </span>
          </footer>
        </article>
      ))}
    </div>
  );
}
