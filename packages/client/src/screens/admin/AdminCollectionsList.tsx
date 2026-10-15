import { useEffect, useState } from "react";
import type { CategoryInfo, CollectionFilter, CollectionInfo, CollectionType } from "@kridens/core";
import { SERVER_HTTP_URL } from "../../config";
import AdminCollectionDetail from "./AdminCollectionDetail";
import CollectionFilterEditor from "./CollectionFilterEditor";
import { formatCollectionFilter } from "./collectionFilter";

interface AdminCollectionsListProps {
  token: string;
  onLogout: () => void;
}

type TypeFilter = CollectionType | "all";

const NAME_MAX_LENGTH = 100;
const NAME_REQUIRED_MESSAGE = "Введите название коллекции";

export default function AdminCollectionsList({ token, onLogout }: AdminCollectionsListProps) {
  const [collections, setCollections] = useState<CollectionInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [categories, setCategories] = useState<CategoryInfo[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<CollectionInfo | null>(null);
  const [openCollection, setOpenCollection] = useState<CollectionInfo | null>(null);

  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [nameInvalid, setNameInvalid] = useState(false);
  const [newType, setNewType] = useState<CollectionType>("static");
  const [newFilter, setNewFilter] = useState<CollectionFilter>({});
  const [modalError, setModalError] = useState<string | null>(null);

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

  useEffect(() => {
    fetch(`${SERVER_HTTP_URL}/api/admin/categories`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: CategoryInfo[]) => setCategories(data))
      .catch(() => setCategories([]));
    fetch(`${SERVER_HTTP_URL}/api/admin/sources`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: string[]) => setSources(data))
      .catch(() => setSources([]));
  }, [token]);

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

  function openAddModal() {
    setNewName("");
    setNameInvalid(false);
    setNewType("static");
    setNewFilter({});
    setModalError(null);
    setShowAddModal(true);
  }

  async function createCollection() {
    const name = newName.trim();
    if (!name) {
      setNameInvalid(true);
      setModalError(NAME_REQUIRED_MESSAGE);
      return;
    }
    setNameInvalid(false);
    try {
      const res = await fetch(`${SERVER_HTTP_URL}/api/admin/collections`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name, type: newType, filter: newType === "dynamic" ? newFilter : undefined }),
      });
      if (res.status === 401) {
        onLogout();
        return;
      }
      if (res.status === 409) {
        setModalError("Такая коллекция уже существует");
        return;
      }
      if (!res.ok) throw new Error("request failed");
      setShowAddModal(false);
      load();
    } catch {
      setModalError("Не удалось добавить коллекцию");
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

  const visibleCollections = collections?.filter((c) => typeFilter === "all" || c.type === typeFilter) ?? null;

  return (
    <div className="admin-words">
      <div className="admin-words-header">
        <h2>Коллекции ({collections?.length ?? "…"})</h2>
      </div>

      {error && !showAddModal && <p className="error">{error}</p>}

      <div className="admin-create-form">
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}>
          <option value="all">Все типы</option>
          <option value="static">Статическая</option>
          <option value="dynamic">Динамическая</option>
        </select>
        <button onClick={openAddModal}>Добавить</button>
      </div>

      {visibleCollections === null && !error ? (
        <p>Загрузка…</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Название</th>
                <th>Тип</th>
                <th>Фильтр</th>
                <th>Слов</th>
                <th>Создано</th>
                <th></th>
                <th className="actions-col"></th>
              </tr>
            </thead>
            <tbody>
              {visibleCollections?.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.type === "dynamic" ? "Динамическая" : "Статическая"}</td>
                  <td className="muted">{c.type === "dynamic" ? formatCollectionFilter(c.filter) : "—"}</td>
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
                      disabled={c.type === "static" && c.wordCount > 0}
                      title={c.type === "static" && c.wordCount > 0 ? "Сначала уберите слова из коллекции" : "Удалить"}
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
          {visibleCollections?.length === 0 && <p className="muted">Коллекций пока нет</p>}
        </div>
      )}

      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal modal-wide">
            <div className="modal-scroll">
              <p>Новая коллекция</p>
              <input
                autoFocus
                className={nameInvalid ? "field-invalid" : undefined}
                value={newName}
                maxLength={NAME_MAX_LENGTH}
                onChange={(e) => {
                  setNameInvalid(false);
                  setModalError(null);
                  setNewName(e.target.value);
                }}
                placeholder="Название коллекции"
                onKeyDown={(e) => e.key === "Enter" && createCollection()}
              />
              <select value={newType} onChange={(e) => setNewType(e.target.value as CollectionType)}>
                <option value="static">Статическая</option>
                <option value="dynamic">Динамическая</option>
              </select>
              {newType === "dynamic" && (
                <CollectionFilterEditor
                  token={token}
                  filter={newFilter}
                  onChange={setNewFilter}
                  categories={categories}
                  sources={sources}
                />
              )}
              {modalError && <p className="error">{modalError}</p>}
              <div className="actions">
                <button onClick={() => setShowAddModal(false)}>Отмена</button>
                <button onClick={createCollection}>Добавить</button>
              </div>
            </div>
          </div>
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
