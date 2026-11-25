export const documentTypes = {
  student_application: {
    title: "Student Application Form",
    category: "Admissions",
    code: "APP",
  },
  guardian_registration: {
    title: "Parent and Guardian Registration Form",
    category: "Family and safety",
    code: "PAR",
  },
  medical_emergency: {
    title: "Student Medical and Emergency Information Form",
    category: "Family and safety",
    code: "MED",
  },
  teacher_registration: {
    title: "Teacher Registration Form",
    category: "Staff and administration",
    code: "TCH",
  },
  staff_registration: {
    title: "Non-Teaching Staff Registration Form",
    category: "Staff and administration",
    code: "STF",
  },
  administrator_registration: {
    title: "School Administrator Registration Form",
    category: "Staff and administration",
    code: "ADM",
  },
  teacher_assignment: {
    title: "Teacher Class and Subject Assignment Form",
    category: "Staff and administration",
    code: "ASN",
  },
  admission_acceptance: {
    title: "Admission Acceptance Letter",
    category: "Admissions",
    code: "ACC",
  },
  student_transfer: {
    title: "Student Transfer Form",
    category: "Student records",
    code: "TRF",
  },
  student_withdrawal: {
    title: "Student Withdrawal Form",
    category: "Student records",
    code: "WDR",
  },
  student_clearance: {
    title: "Student Clearance Form",
    category: "Student records",
    code: "CLR",
  },
};
export const defaultChecklist = [
  "Birth certificate",
  "Passport photographs",
  "Previous school report",
  "Transfer certificate (where applicable)",
];
export const defaultPrivacyNotice =
  "The school uses this information for admission, authorised school administration and student safety. Contact the school administrator to ask about access, corrections, retention and the school privacy policy.";
