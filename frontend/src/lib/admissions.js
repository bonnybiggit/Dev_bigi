import { api } from "./api";
export const admissionsApi = {
  get: async (path, params = {}) =>
    (await api.get(`/school/${path}`, { params })).data,
  post: async (path, input = {}) =>
    (await api.post(`/school/${path}`, input)).data,
  put: async (path, input) => (await api.put(`/school/${path}`, input)).data,
};
export const applicationStatusLabels = {
  awaiting_form: "Awaiting completed form",
  form_received: "Form received",
  under_review: "Under review",
  approved: "Approved",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  cancelled: "Cancelled",
  enrolled: "Enrolled",
};
export const blankApplicant = () => ({
  firstName: "",
  middleName: "",
  lastName: "",
  dateOfBirth: "",
  gender: "not_specified",
  address: "",
  nationality: "",
  previousSchool: "",
});
export const blankApplicationGuardian = () => ({
  guardianId: null,
  verified: false,
  createNewConfirmed: false,
  relationship: "guardian",
  fullName: "",
  primaryPhone: "",
  alternativePhone: "",
  email: "",
  address: "",
  occupation: "",
  gender: "not_specified",
  emergencyContactName: "",
  emergencyContactPhone: "",
  emergencyContactRelationship: "",
});
