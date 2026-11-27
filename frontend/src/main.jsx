import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext.jsx";
import App from "./App.jsx";
import ConnectionStatus from "./components/ConnectionStatus.jsx";
import "./styles.css";
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ConnectionStatus />
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
