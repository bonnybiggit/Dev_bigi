export const schoolTypes = [
  "Nursery",
  "Primary",
  "Nursery and Primary",
  "Secondary",
  "Other",
];
const name = (maxLength = 80) => ({
  name: "name",
  label: "Name",
  required: true,
  maxLength,
});
const dates = [
  { name: "startDate", label: "Start date", type: "date", required: true },
  { name: "endDate", label: "End date", type: "date", required: true },
];
const options = (records) =>
  records.map((record) => ({ value: record._id, label: record.name }));
export const configurationKinds = {
  sessions: {
    title: "Academic sessions",
    singular: "academic session",
    description: "Set the academic calendar and manage the current session.",
    initial: { name: "", startDate: "", endDate: "" },
    fields: () => [
      { ...name(40), placeholder: "e.g. 2026/2027", wide: true },
      ...dates,
    ],
  },
  terms: {
    title: "Academic terms",
    singular: "term",
    description: "Organize First, Second, and Third Term within a session.",
    initial: { sessionId: "", name: "First Term", startDate: "", endDate: "" },
    fields: ({ sessions, editing }) => [
      {
        name: "sessionId",
        label: "Academic session",
        type: "select",
        required: true,
        options: options(sessions),
        disabled: editing,
        wide: true,
      },
      {
        name: "name",
        label: "Term",
        type: "select",
        required: true,
        options: ["First Term", "Second Term", "Third Term"].map((value) => ({
          value,
          label: value,
        })),
        wide: true,
      },
      ...dates,
    ],
  },
  classes: {
    title: "Classes",
    singular: "class",
    description: "Manage class names, arms, and total class capacity.",
    initial: { name: "", arms: "", inactiveArms: "", capacity: "30" },
    fields: () => [
      {
        ...name(),
        placeholder: "e.g. Nursery 1",
        suggestions: [
          "Nursery 1",
          "Nursery 2",
          "Nursery 3",
          ...Array.from({ length: 6 }, (_, i) => `Primary ${i + 1}`),
        ],
        wide: true,
      },
      {
        name: "arms",
        label: "Arms",
        maxLength: 500,
        placeholder: "A, B, C",
        help: "Optional, comma-separated names. Arm names must be unique.",
      },
      {
        name: "capacity",
        label: "Total class capacity",
        type: "number",
        min: 1,
        max: 10000,
        required: true,
        help: "Capacity across all arms of this class.",
      },
      {
        name: "inactiveArms",
        label: "Inactive arms",
        maxLength: 500,
        placeholder: "e.g. C",
        help: "Optional, comma-separated arms to close to new student placements. Existing students are retained.",
        wide: true,
      },
    ],
  },
  subjects: {
    title: "Subjects",
    singular: "subject",
    description: "Assign subjects to classes and manage their availability.",
    initial: { name: "", classId: "", code: "", description: "" },
    fields: ({ classes }) => [
      { ...name(100), wide: true },
      {
        name: "classId",
        label: "Class",
        type: "select",
        required: true,
        options: options(
          classes.filter((record) => record.status === "active"),
        ),
      },
      {
        name: "code",
        label: "Subject code",
        maxLength: 30,
        placeholder: "e.g. ENG",
      },
      {
        name: "description",
        label: "Description",
        type: "textarea",
        maxLength: 1000,
        wide: true,
      },
    ],
  },
};
export const formValues = (kind, record) => {
  if (!record) return { ...configurationKinds[kind].initial };
  return Object.fromEntries(
    Object.keys(configurationKinds[kind].initial).map((key) => [
      key,
      ["arms", "inactiveArms"].includes(key)
        ? (record[key] || []).join(", ")
        : ["startDate", "endDate"].includes(key)
          ? record[key].slice(0, 10)
          : (record[key] ?? ""),
    ]),
  );
};
export const formPayload = (kind, values) =>
  kind === "classes"
    ? {
        ...values,
        capacity: Number(values.capacity),
        inactiveArms: values.inactiveArms?.trim()
          ? values.inactiveArms.split(",").map((value) => value.trim())
          : [],
        arms: values.arms.trim()
          ? values.arms.split(",").map((value) => value.trim())
          : [],
      }
    : values;
export const configurationError = (error) => {
  const data = error.response?.data;
  return data?.errors?.length
    ? data.errors.map((item) => `${item.field}: ${item.message}`).join(" · ")
    : data?.message || "Unable to reach the server. Please try again.";
};
