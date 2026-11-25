import { api } from "./api";
export const studentPortalApi = {
  get: async (path, params = {}) =>
    (await api.get(`/student/${path}`, { params })).data,
};
