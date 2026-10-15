import { useEffect, useState } from "react";
import type { CategoryInfo } from "@kridens/core";
import { SERVER_HTTP_URL } from "../../config";

interface AdminCategoriesListProps {
  token: string;
  onLogout: () => void;
}

const CATEGORY_NAME_MAX_LENGTH = 100;
const CATEGORY_NAME_REQUIRED_MESSAGE = "Введите название категории";

export default function AdminCategoriesList({ token, onLogout }: AdminCategoriesListProps) {
  const [categories, setCategories] = useState<CategoryInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [nameInvalid, setNameInvalid] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<CategoryInfo | null>(null);

  function load() {
    fetch(`${SERVER_HTTP_URL}/api/admin/categories`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        if (res.status === 401) {
          onLogout();
          throw new Error("unauthorized");
        }
        if (!res.ok) throw new Error("request failed");
        return res.json();
      })
      .then((data: CategoryInfo[]) => setCategories(data))
      .catch((err) => {
        if (err.message !== "unauthorized") setError("Не удалось загрузить категории");
      });
  }

  useEffect(load, [token]);

  async function createCategory() {
    const name = newName.trim();
    if (!name) {
      setNameInvalid(true);
      setError(CATEGORY_NAME_REQUIRED_MESSAGE);
      return;
    }
    setNameInvalid(false);
    try {
      const res = await fetch(`${SERVER_HTTP_URL}/api/admin/categories`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name }),
      });
      if (res.status === 401) {
        onLogout();
        return;
      }
      if (res.status === 409) {
        setError("Такая категория уже существует");
        return;
      }
      if (!res.ok) throw new Error("request failed");
      setNewName("");
      setShowAddModal(false);
      setError(null);
      load();
    } catch {
      setError("Не удалось добавить категорию");
    }
  }

  async function performDelete() {
    const category = confirmDelete;
    if (!category) return;
    setConfirmDelete(null);
    try {
      const res = await fetch(`${SERVER_HTTP_URL}/api/admin/categories/${category.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        onLogout();
        return;
      }
      if (!res.ok) throw new Error("request failed");
      setCategories((prev) => (prev ? prev.filter((c) => c.id !== category.id) : prev));
    } catch {
      setError("Не удалось удалить категорию");
    }
  }

  return (
    <div className="admin-words">
      <div className="admin-words-header">
        <h2>Категории ({categories?.length ?? "…"})</h2>
        <button
          onClick={() => {
            setNewName("");
            setNameInvalid(false);
            setError(null);
            setShowAddModal(true);
          }}
        >
          Добавить
        </button>
      </div>

      {error && !showAddModal && <p className="error">{error}</p>}

      {categories === null && !error ? (
        <p>Загрузка…</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Название</th>
                <th>Слов</th>
                <th className="actions-col"></th>
              </tr>
            </thead>
            <tbody>
              {categories?.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.wordCount}</td>
                  <td className="actions-col">
                    <button
                      className="icon-btn danger"
                      disabled={c.wordCount > 0}
                      title={c.wordCount > 0 ? "Сначала уберите слова с этой категорией" : "Удалить"}
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
          {categories?.length === 0 && <p className="muted">Категорий пока нет</p>}
        </div>
      )}

      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal">
            <p>Новая категория</p>
            <input
              autoFocus
              className={nameInvalid ? "field-invalid" : undefined}
              value={newName}
              maxLength={CATEGORY_NAME_MAX_LENGTH}
              onChange={(e) => {
                setNameInvalid(false);
                setError(null);
                setNewName(e.target.value);
              }}
              placeholder="Название категории"
              onKeyDown={(e) => e.key === "Enter" && createCategory()}
            />
            {error && <p className="error">{error}</p>}
            <div className="actions">
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setNameInvalid(false);
                  setError(null);
                }}
              >
                Отмена
              </button>
              <button onClick={createCategory}>Добавить</button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="modal-overlay">
          <div className="modal">
            <p>Удалить категорию «{confirmDelete.name}»?</p>
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
