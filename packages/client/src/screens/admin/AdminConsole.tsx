import { useState } from "react";
import AdminLogin from "./AdminLogin";
import AdminWordsList from "./AdminWordsList";
import "./admin.css";

const TOKEN_STORAGE_KEY = "kridens_admin_token";

export default function AdminConsole() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_STORAGE_KEY));

  function handleLogin(newToken: string) {
    localStorage.setItem(TOKEN_STORAGE_KEY, newToken);
    setToken(newToken);
  }

  function handleLogout() {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null);
  }

  return (
    <div className="admin-page">
      {token ? <AdminWordsList token={token} onLogout={handleLogout} /> : <AdminLogin onLogin={handleLogin} />}
    </div>
  );
}
