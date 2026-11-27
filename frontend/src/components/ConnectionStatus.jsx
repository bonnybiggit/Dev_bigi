import { useEffect, useState } from "react";
import { api } from "../lib/api";
export default function ConnectionStatus() {
  const [status, setStatus] = useState("connected");
  useEffect(() => {
    let active = true,
      failed = false,
      pending = false;
    const check = async () => {
      if (pending) return;
      pending = true;
      try {
        await api.get("/health", { timeout: 3000 });
        if (active && failed) setStatus("recovered");
        failed = false;
      } catch {
        failed = true;
        if (active) setStatus("offline");
      } finally {
        pending = false;
      }
    };
    const timer = setInterval(check, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  if (status === "connected") return null;
  return (
    <div
      className="alert error no-print"
      role="status"
      style={{ position: "sticky", top: 0, zIndex: 1000 }}
    >
      {status === "offline"
        ? "Server connection lost. Records cannot be loaded or saved. Reconnecting over the local network..."
        : "Server connection restored. Reload to refresh records and check your session; unsaved form entries will be lost."}
      {status === "recovered" && (
        <button className="btn" onClick={() => window.location.reload()}>
          Reload workspace
        </button>
      )}
    </div>
  );
}
