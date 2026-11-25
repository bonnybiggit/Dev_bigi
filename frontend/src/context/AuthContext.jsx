import { createContext, useContext, useEffect, useState } from "react";
import { api } from "../lib/api";
const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api
      .get("/auth/me")
      .then(({ data }) => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    const id = api.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) setUser(null);
        return Promise.reject(error);
      },
    );
    return () => api.interceptors.response.eject(id);
  }, []);
  const login = async (
    credentials,
    schoolLogin = false,
    teacherLogin = false,
    studentLogin = false,
  ) => {
    const { data } = await api.post(
      studentLogin
        ? "/auth/student-login"
        : teacherLogin
          ? "/auth/teacher-login"
          : schoolLogin
            ? "/auth/school-login"
            : "/auth/login",
      credentials,
    );
    setUser(data.user);
  };
  const changePassword = async (input) => {
    const { data } = await api.post("/auth/change-password", input);
    setUser(data.user);
  };
  const logout = async () => {
    await api.post("/auth/logout");
    setUser(null);
  };
  return (
    <AuthContext.Provider
      value={{ user, loading, login, logout, changePassword }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export const useAuth = () => useContext(AuthContext);
