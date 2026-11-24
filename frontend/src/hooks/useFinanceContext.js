import { useCallback, useEffect, useState } from "react";
import { api } from "../lib/api";
import { configurationError } from "../lib/academicConfiguration";
export default function useFinanceContext() {
  const [context, setContext] = useState(null),
    [error, setError] = useState("");
  const reload = useCallback(async () => {
    setError("");
    try {
      const { data } = await api.get("/school/finance/context");
      setContext(data);
    } catch (e) {
      setError(configurationError(e));
    }
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);
  return { context, error, reload };
}
