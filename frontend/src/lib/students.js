export const studentLabels = {
  active: "Active",
  inactive: "Inactive",
  archived: "Archived",
  pending: "Pending",
  admitted: "Admitted",
  waitlisted: "Waitlisted",
  rejected: "Rejected",
  female: "Female",
  male: "Male",
  other: "Other",
  not_specified: "Not specified",
};
export const studentName = (record) =>
  [record.firstName, record.middleName, record.lastName]
    .filter(Boolean)
    .join(" ");
const choices = (values) =>
  values.map((value) => ({ value, label: studentLabels[value] }));
export const studentPersonalFields = [
  {
    name: "admissionNumber",
    label: "Admission number",
    required: true,
    maxLength: 40,
    wide: true,
  },
  { name: "firstName", label: "First name", required: true, maxLength: 60 },
  { name: "middleName", label: "Middle name", maxLength: 60 },
  { name: "lastName", label: "Last name", required: true, maxLength: 60 },
  { name: "dateOfBirth", label: "Date of birth", type: "date", required: true },
  {
    name: "gender",
    label: "Gender",
    type: "select",
    required: true,
    options: choices(["female", "male", "other", "not_specified"]),
  },
  {
    name: "admissionDate",
    label: "Admission date",
    type: "date",
    required: true,
  },
  {
    name: "address",
    label: "Contact address",
    type: "textarea",
    maxLength: 300,
    required: true,
    wide: true,
  },
  {
    name: "previousSchool",
    label: "Previous school",
    maxLength: 160,
    wide: true,
  },
];
export function studentFormValues(record) {
  const result = Object.fromEntries(
    studentPersonalFields.map((field) => [
      field.name,
      record?.[field.name] ?? "",
    ]),
  );
  for (const key of ["dateOfBirth", "admissionDate"])
    result[key] = result[key].slice(0, 10);
  return {
    ...result,
    gender: result.gender || "not_specified",
    sessionId: record?.sessionId || "",
    classId: record?.classId || "",
    arm: record?.arm || "",
    admissionStatus: record?.admissionStatus || "pending",
  };
}
export function placementFields(options, values, existing) {
  const available = (records, current) =>
    records
      .filter((record) => record.status === "active" || record._id === current)
      .map((record) => ({
        value: record._id,
        label: `${record.name}${record.status !== "active" ? " (inactive; retained)" : ""}`,
      }));
  const schoolClass = options.classes.find(
    (record) => record._id === values.classId,
  );
  const arms =
    schoolClass?.arms.filter(
      (arm) =>
        !schoolClass.inactiveArms?.includes(arm) ||
        (existing?.classId === values.classId && existing?.arm === arm),
    ) || [];
  return [
    {
      name: "sessionId",
      label: "Academic session",
      type: "select",
      required: true,
      options: available(options.sessions, existing?.sessionId),
    },
    {
      name: "classId",
      label: "Class",
      type: "select",
      required: true,
      options: available(options.classes, existing?.classId),
    },
    {
      name: "arm",
      label: "Class arm",
      type: "select",
      required: !!schoolClass?.arms.length,
      disabled: !schoolClass?.arms.length,
      options: arms.map((arm) => ({
        value: arm,
        label: `${arm}${schoolClass.inactiveArms?.includes(arm) ? " (inactive; retained)" : ""}`,
      })),
      help:
        schoolClass && !schoolClass.arms.length
          ? "This class has no arms."
          : "Choose an arm from the selected class.",
    },
    {
      name: "admissionStatus",
      label: "Admission status",
      type: "select",
      required: true,
      options: choices(["pending", "admitted", "waitlisted", "rejected"]),
    },
  ];
}
