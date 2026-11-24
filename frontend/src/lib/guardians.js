export const relationshipLabels = {
  father: "Father",
  mother: "Mother",
  guardian: "Guardian",
  other: "Other",
};
export const guardianFields = [
  {
    name: "fullName",
    label: "Full name",
    required: true,
    maxLength: 120,
    wide: true,
  },
  { name: "email", label: "Email address", type: "email", maxLength: 254 },
  {
    name: "primaryPhone",
    label: "Primary phone",
    type: "tel",
    required: true,
    maxLength: 30,
  },
  {
    name: "alternativePhone",
    label: "Alternative phone",
    type: "tel",
    maxLength: 30,
  },
  {
    name: "gender",
    label: "Gender",
    type: "select",
    options: ["not_specified", "female", "male", "other"].map((value) => ({
      value,
      label:
        value === "not_specified"
          ? "Not specified"
          : value.charAt(0).toUpperCase() + value.slice(1),
    })),
  },
  {
    name: "address",
    label: "Residential address",
    type: "textarea",
    maxLength: 300,
    required: true,
    wide: true,
  },
  { name: "occupation", label: "Occupation", maxLength: 100, wide: true },
  {
    name: "emergencyContactName",
    label: "Emergency contact name",
    maxLength: 120,
  },
  {
    name: "emergencyContactPhone",
    label: "Emergency contact phone",
    type: "tel",
    maxLength: 30,
  },
  {
    name: "emergencyContactRelationship",
    label: "Emergency contact relationship",
    maxLength: 60,
    wide: true,
  },
];
export const guardianFormValues = (record) =>
  Object.fromEntries(
    guardianFields.map((field) => [
      field.name,
      record?.[field.name] || (field.name === "gender" ? "not_specified" : ""),
    ]),
  );
