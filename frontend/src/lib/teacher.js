import { api } from "./api";
export const teacherApi = {
  get: async (path, params = {}) =>
    (await api.get(`/teacher/${path}`, { params })).data,
  updatePhone: async (phone) =>
    (await api.patch("/teacher/profile", { phone })).data,
  mark: async (input) =>
    (await api.put("/teacher/attendance/student", input)).data,
};
