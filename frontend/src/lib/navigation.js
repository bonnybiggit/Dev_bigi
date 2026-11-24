export const dashboardPath = (user) =>
  user?.mustChangePassword
    ? "/change-password"
    : user?.role === "teacher"
      ? "/teacher"
      : user?.role === "school_admin"
        ? "/school"
        : "/";
