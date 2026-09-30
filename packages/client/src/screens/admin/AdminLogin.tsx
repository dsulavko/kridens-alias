import { useState } from "react";
import { SERVER_HTTP_URL } from "../../config";

interface AdminLoginProps {
  onLogin: (token: string) => void;
}

export default function AdminLogin({ onLogin }: AdminLoginProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${SERVER_HTTP_URL}/api/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        setError("Неверный логин или пароль");
        return;
      }
      const { token } = (await res.json()) as { token: string };
      onLogin(token);
    } catch {
      setError("Не удалось подключиться к серверу");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="admin-login" onSubmit={handleSubmit}>
      <h2>Admin Console</h2>
      <input
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="Логин"
        autoComplete="username"
        required
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Пароль"
        autoComplete="current-password"
        required
      />
      {error && <p className="error">{error}</p>}
      <button type="submit" className="primary" disabled={submitting}>
        Войти
      </button>
    </form>
  );
}
