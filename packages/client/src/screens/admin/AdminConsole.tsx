import { useEffect, useState } from "react";
import AdminLogin from "./AdminLogin";
import AdminSidebar, { type AdminView } from "./AdminSidebar";
import AdminWordsList from "./AdminWordsList";
import AdminCategoriesList from "./AdminCategoriesList";
import AdminCollectionsList from "./AdminCollectionsList";
import "./admin.css";

const TOKEN_STORAGE_KEY = "kridens_admin_token";

export default function AdminConsole() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_STORAGE_KEY));
  const [view, setView] = useState<AdminView>("words");

  useEffect(() => {
    document.body.classList.toggle("admin-mode", token !== null);
    return () => document.body.classList.remove("admin-mode");
  }, [token]);

  function handleLogin(newToken: string) {
    localStorage.setItem(TOKEN_STORAGE_KEY, newToken);
    setToken(newToken);
  }

  function handleLogout() {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken(null);
  }

  if (!token) {
    return (
      <div className="admin-page">
        <AdminLogin onLogin={handleLogin} />
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div className="admin-layout">
        <AdminSidebar view={view} onChangeView={setView} onLogout={handleLogout} />
        <div className="admin-content">
          {view === "words" && <AdminWordsList token={token} onLogout={handleLogout} />}
          {view === "categories" && <AdminCategoriesList token={token} onLogout={handleLogout} />}
          {view === "collections" && <AdminCollectionsList token={token} onLogout={handleLogout} />}
        </div>
      </div>
    </div>
  );
}
