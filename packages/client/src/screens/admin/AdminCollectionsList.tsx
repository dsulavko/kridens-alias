import { useEffect, useState } from "react";
import type { CollectionInfo } from "@kridens/core";
import { SERVER_HTTP_URL } from "../../config";
import AdminCollectionDetail from "./AdminCollectionDetail";

interface AdminCollectionsListProps {
  token: string;
  onLogout: () => void;
}

export default function AdminCollectionsList({ token, onLogout }: AdminCollectionsListProps) {
  const [collections, setCollections] = useState<CollectionInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<CollectionInfo | null>(null);
  const [openCollection, setOpenCollection] = useState<CollectionInfo | null>(null);

  function load() {
    fetch(`${SERVER_HTTP_URL}/api/admin/collections`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        if (res.status === 401) {
          onLogout();
          throw new Error("unauthorized");
        }
        if (!res.ok) throw new Error("request failed");
        return res.json();
      })
      .then((data: CollectionInfo[]) => setCollections(data))
      .catch((err) => {
        if (err.message !== "unauthorized") setError("Не удалось загрузить коллекции");
      });
  }

  useEffect(load, [token]);

  if (openCollection) {
    return (
      <AdminCollectionDetail
        collection={openCollection}
        token={token}
        onLogout={onLogout}
        onBack={() => {
          setOpenCollection(null);
          load();
        }}
      />
    );
  }

  async function createCollection() {
    const name = newName.trim();
    if (!name) return;
    try {
      const res = await fetch(`${SERVER_HTTP_URL}/api/admin/collections`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name }),
      });
      if (res.status === 401) {
        onLogout();
        return;
      }
      if (res.status === 409) {
        setError("Такая коллекция уже существует");
        return;
      }
      if (!res.ok) throw new Error("request failed");
      setNewName("");
      setError(null);
      load();
    } catch {
      setError("Не удалось добавить коллекцию");
    }
  }

  async function performDelete() {
    const collection = confirmDelete;
    if (!collection) return;
    setConfirmDelete(null);
    try {
      const res = await fetch(`${SERVER_HTTP_URL}/api/admin/collections/${collection.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        onLogout();
        return;
      }
      if (!res.ok) throw new Error("request failed");
      setCollections((prev) => (prev ? prev.filter((c) => c.id !== collection.id) : prev));
    } catch {
      setError("Не удалось удалить коллекцию");
    }
  }

  return (
    <div className="admin-words">
      <div className="admin-words-header">
        <h2>Коллекции ({collections?.length ?? "…"})</h2>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="admin-create-form">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Новая коллекция"
          onKeyDown={(e) => e.key === "Enter" && createCollection()}
        />
        <button onClick={createCollection}>Добавить</button>
      </div>

      {collections === null && !error ? (
        <p>Загрузка…</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Название</th>
                <th>Слов</th>
                <th>Создано</th>
                <th></th>
                <th className="actions-col"></th>
              </tr>
            </thead>
            <tbody>
              {collections?.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.wordCount}</td>
                  <td>{new Date(c.createdAt).toLocaleDateString()}</td>
                  <td>
                    <button className="ghost-btn" onClick={() => setOpenCollection(c)}>
                      Открыть
                    </button>
                  </td>
                  <td className="actions-col">
                    <button
                      className="icon-btn danger"
                      disabled={c.wordCount > 0}
                      title={c.wordCount > 0 ? "Сначала уберите слова из коллекции" : "Удалить"}
                      aria-label="Удалить"
                      onClick={() => setConfirmDelete(c)}
                    >
                      🗑
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {collections?.length === 0 && <p className="muted">Коллекций пока нет</p>}
        </div>
      )}

      {confirmDelete && (
        <div className="modal-overlay">
          <div className="modal">
            <p>Удалить коллекцию «{confirmDelete.name}»?</p>
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
