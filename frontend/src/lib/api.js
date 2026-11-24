import axios from "axios";
// Keep network access behind this boundary for a future offline repository adapter.
// Authentication and platform administration always require a live connection.
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
  withCredentials: true,
  timeout: 15000,
});
export const errorMessage = (error) =>
  error.response?.data?.message ||
  "Unable to reach the server. Check your connection and try again.";
