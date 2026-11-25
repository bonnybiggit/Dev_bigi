import { api } from "./api";
const base = "/school/teacher-assignments";
export const assignmentApi = {
  get: async (path = "", params = {}) =>
    (await api.get(base + path, { params })).data,
  create: async (input) => (await api.post(base, input)).data,
  edit: async (id, input) => (await api.put(`${base}/${id}`, input)).data,
  action: async (path, input) => (await api.post(base + path, input)).data,
};
