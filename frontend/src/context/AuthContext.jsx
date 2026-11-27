import { createContext, useContext, useEffect, useState } from "react";
import { api } from "../lib/api";
const AuthContext = createContext(null);
const schoolLoginPath = (user) =>
  `${user.role === "student" ? "/student-login" : user.role === "teacher" ? "/teacher-login" : user.role === "school_admin" ? "/school-login" : "/login"}${user.schoolId ? `?school=${user.schoolId}` : ""}`;
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [school, setSchool] = useState(null);
  const [loginPath, setLoginPath] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api
      .get("/auth/me")
      .then(({ data }) => {
        setUser(data.user);
        setLoginPath(schoolLoginPath(data.user));
        setSchool(data.school);
      })
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    const id = api.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          setUser(null);
          setSchool(null);
        }
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
    setLoginPath(schoolLoginPath(data.user));
    setSchool(data.school);
  };
  const changePassword = async (input) => {
    const { data } = await api.post("/auth/change-password", input);
    setUser(data.user);
    setSchool(data.school);
  };
  const logout = async () => {
    await api.post("/auth/logout");
    setUser(null);
    setSchool(null);
  };
  return (
    <AuthContext.Provider
      value={{
        user,
        school,
        loginPath,
        setSchool,
        loading,
        login,
        logout,
        changePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export const useAuth = () => useContext(AuthContext);
