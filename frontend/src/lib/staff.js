export const staffLabels = {
  teaching: "Teaching",
  non_teaching: "Non-teaching",
  full_time: "Full-time",
  part_time: "Part-time",
  contract: "Contract",
  temporary: "Temporary",
  intern: "Intern",
  female: "Female",
  male: "Male",
  other: "Other",
  not_specified: "Not specified",
};
const options = (values) =>
  values.map((value) => ({ value, label: staffLabels[value] }));
export const staffFields = [
  {
    name: "category",
    label: "Staff category",
    type: "select",
    required: true,
    options: options(["teaching", "non_teaching"]),
  },
  {
    name: "employeeId",
    label: "Employee ID",
    required: true,
    maxLength: 40,
    placeholder: "e.g. BFIS-001",
  },
  {
    name: "fullName",
    label: "Full name",
    required: true,
    maxLength: 120,
    wide: true,
  },
  {
    name: "email",
    label: "Email address",
    type: "email",
    required: true,
    maxLength: 254,
  },
  {
    name: "phone",
    label: "Phone number",
    type: "tel",
    required: true,
    maxLength: 30,
  },
  {
    name: "gender",
    label: "Gender",
    type: "select",
    required: true,
    options: options(["not_specified", "female", "male", "other"]),
  },
  { name: "dateOfBirth", label: "Date of birth", type: "date" },
  {
    name: "address",
    label: "Address",
    type: "textarea",
    maxLength: 300,
    wide: true,
  },
  {
    name: "employmentDate",
    label: "Employment date",
    type: "date",
    required: true,
  },
  {
    name: "employmentType",
    label: "Employment type",
    type: "select",
    required: true,
    options: options([
      "full_time",
      "part_time",
      "contract",
      "temporary",
      "intern",
    ]),
  },
  { name: "department", label: "Department", required: true, maxLength: 80 },
  { name: "designation", label: "Designation", required: true, maxLength: 100 },
];
export function staffFormValues(record) {
  const values = Object.fromEntries(
    staffFields.map((field) => [field.name, record?.[field.name] ?? ""]),
  );
  values.gender ||= "not_specified";
  values.employmentType ||= "full_time";
  values.category ||= "teaching";
  for (const field of ["dateOfBirth", "employmentDate"])
    values[field] = values[field]?.slice(0, 10) || "";
  return {
    ...values,
    classIds: record?.classIds || [],
    subjectIds: record?.subjectIds || [],
  };
}
