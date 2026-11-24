import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { configurationError } from "../lib/academicConfiguration";
export default function useStudentOptions() {
  const [options, setOptions] = useState(null);
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    setError("");
    try {
      const [sessions, classes] = await Promise.all([
        api.get("/school/sessions"),
        api.get("/school/classes"),
      ]);
      setOptions({
        sessions: sessions.data.records,
        classes: classes.data.records,
      });
    } catch (e) {
      setError(configurationError(e));
    }
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);
  return { options, error, reload };
}
