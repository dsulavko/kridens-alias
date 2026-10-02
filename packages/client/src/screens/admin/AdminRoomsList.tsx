import { useEffect, useState } from "react";
import type { SavedRoomInfo } from "@kridens/core";
import { SERVER_HTTP_URL } from "../../config";

interface AdminRoomsListProps {
  token: string;
  onLogout: () => void;
}

export default function AdminRoomsList({ token, onLogout }: AdminRoomsListProps) {
  const [rooms, setRooms] = useState<SavedRoomInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<SavedRoomInfo | null>(null);

  function load() {
    fetch(`${SERVER_HTTP_URL}/api/admin/saved-rooms`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        if (res.status === 401) {
          onLogout();
          throw new Error("unauthorized");
        }
        if (!res.ok) throw new Error("request failed");
        return res.json();
      })
      .then((data: SavedRoomInfo[]) => setRooms(data))
      .catch((err) => {
        if (err.message !== "unauthorized") setError("Не удалось загрузить комнаты");
      });
  }

  useEffect(load, [token]);

  async function performDelete() {
    const room = confirmDelete;
    if (!room) return;
    setConfirmDelete(null);
    try {
      const res = await fetch(`${SERVER_HTTP_URL}/api/admin/saved-rooms/${room.guid}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        onLogout();
        return;
      }
      if (!res.ok) throw new Error("request failed");
      setRooms((prev) => (prev ? prev.filter((r) => r.guid !== room.guid) : prev));
    } catch {
      setError("Не удалось удалить комнату");
    }
  }

  return (
    <div className="admin-words">
      <div className="admin-words-header">
        <h2>Комнаты ({rooms?.length ?? "…"})</h2>
      </div>

      {error && <p className="error">{error}</p>}

      {rooms === null && !error ? (
        <p>Загрузка…</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Создана</th>
                <th>Слов отыграно</th>
                <th>Игр сыграно</th>
                <th className="actions-col"></th>
              </tr>
            </thead>
            <tbody>
              {rooms?.map((r) => (
                <tr key={r.guid}>
                  <td className="mono">{r.guid}</td>
                  <td>{new Date(r.createdAt).toLocaleDateString()}</td>
                  <td>{r.wordCount}</td>
                  <td>{r.gamesPlayed}</td>
                  <td className="actions-col">
                    <button
                      className="icon-btn danger"
                      aria-label="Удалить"
                      title="Удалить"
                      onClick={() => setConfirmDelete(r)}
                    >
                      🗑
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rooms?.length === 0 && <p className="muted">Сохранённых комнат пока нет</p>}
        </div>
      )}

      {confirmDelete && (
        <div className="modal-overlay">
          <div className="modal">
            <p>Удалить сохранённую комнату «{confirmDelete.guid}»? Её история сыгранных слов будет потеряна.</p>
            <div className="actions">
              <button onClick={() => setConfirmDelete(null)}>Отмена</button>
              <button className="danger" onClick={performDelete}>
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
