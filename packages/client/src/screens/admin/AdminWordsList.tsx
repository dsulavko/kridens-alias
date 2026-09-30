import { useEffect, useMemo, useState } from "react";
import type { AdminWord, Category, CategoryInfo, Weight, WordStatus } from "@kridens/core";
import { SERVER_HTTP_URL } from "../../config";

interface AdminWordsListProps {
  token: string;
  onLogout: () => void;
}

type CategoryFilter = Category | "all";
type StatusFilter = WordStatus | "all";
type WeightFilter = Weight | "all";

const WEIGHT_OPTIONS: Weight[] = [1, 2, 3, 4, 5];
const STATUS_OPTIONS: WordStatus[] = ["approved", "pending", "rejected"];
const PAGE_SIZE = 50;
type SortColumn = "id" | "text" | "category" | "weight" | "status" | "source" | "createdAt";
type SortDirection = "asc" | "desc";

const COLUMNS: { key: SortColumn; label: string }[] = [
  { key: "id", label: "ID" },
  { key: "text", label: "Слово" },
  { key: "category", label: "Категория" },
  { key: "weight", label: "Сложность" },
  { key: "status", label: "Статус" },
  { key: "source", label: "Источник" },
  { key: "createdAt", label: "Создано" },
];

export default function AdminWordsList({ token, onLogout }: AdminWordsListProps) {
  const [words, setWords] = useState<AdminWord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [weightFilter, setWeightFilter] = useState<WeightFilter>("all");
  const [sortColumn, setSortColumn] = useState<SortColumn>("id");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkWeight, setBulkWeight] = useState<Weight>(1);
  const [bulkStatus, setBulkStatus] = useState<WordStatus>("approved");
  const [page, setPage] = useState(1);
  const [confirmDeleteWord, setConfirmDeleteWord] = useState<AdminWord | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [categories, setCategories] = useState<CategoryInfo[]>([]);

  useEffect(() => {
    fetch(`${SERVER_HTTP_URL}/api/admin/words`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        if (res.status === 401) {
          onLogout();
          throw new Error("unauthorized");
        }
        if (!res.ok) throw new Error("request failed");
        return res.json();
      })
      .then((data: AdminWord[]) => setWords(data))
      .catch((err) => {
        if (err.message !== "unauthorized") setError("Не удалось загрузить слова");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    fetch(`${SERVER_HTTP_URL}/api/admin/categories`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: CategoryInfo[]) => setCategories(data))
      .catch(() => setCategories([]));
  }, [token]);

  const filtered = useMemo(() => {
    if (!words) return [];
    const query = search.trim().toLowerCase();
    const rows = words.filter((w) => {
      if (categoryFilter !== "all" && w.category !== categoryFilter) return false;
      if (statusFilter !== "all" && w.status !== statusFilter) return false;
      if (weightFilter !== "all" && w.weight !== weightFilter) return false;
      if (query && !w.text.toLowerCase().includes(query)) return false;
      return true;
    });
    const sign = sortDirection === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = a[sortColumn] ?? "";
      const bv = b[sortColumn] ?? "";
      if (typeof av === "string" && typeof bv === "string") return av.localeCompare(bv) * sign;
      return ((av as number) - (bv as number)) * sign;
    });
  }, [words, search, categoryFilter, statusFilter, weightFilter, sortColumn, sortDirection]);

  useEffect(() => {
    setPage(1);
  }, [search, categoryFilter, statusFilter, weightFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const paged = useMemo(
    () => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filtered, currentPage],
  );

  function handleSort(column: SortColumn) {
    if (column === sortColumn) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  }

  function toggleSelected(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allPageSelected = paged.length > 0 && paged.every((w) => selectedIds.has(w.id));

  function toggleSelectAllOnPage() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        paged.forEach((w) => next.delete(w.id));
      } else {
        paged.forEach((w) => next.add(w.id));
      }
      return next;
    });
  }

  async function applyWeight(id: number, weight: Weight) {
    const previous = words;
    setWords((prev) => (prev ? prev.map((w) => (w.id === id ? { ...w, weight } : w)) : prev));
    try {
      const res = await fetch(`${SERVER_HTTP_URL}/api/admin/words/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ weight }),
      });
      if (res.status === 401) {
        onLogout();
        return;
      }
      if (!res.ok) throw new Error("request failed");
    } catch {
      setWords(previous);
      setError("Не удалось обновить сложность");
    }
  }

  async function applyStatus(id: number, status: WordStatus) {
    const previous = words;
    setWords((prev) => (prev ? prev.map((w) => (w.id === id ? { ...w, status } : w)) : prev));
    try {
      const res = await fetch(`${SERVER_HTTP_URL}/api/admin/words/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      });
      if (res.status === 401) {
        onLogout();
        return;
      }
      if (!res.ok) throw new Error("request failed");
    } catch {
      setWords(previous);
      setError("Не удалось обновить статус");
    }
  }

  async function applyBulkWeight() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    const previous = words;
    setWords((prev) => (prev ? prev.map((w) => (selectedIds.has(w.id) ? { ...w, weight: bulkWeight } : w)) : prev));
    try {
      const res = await fetch(`${SERVER_HTTP_URL}/api/admin/words/bulk-weight`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ids, weight: bulkWeight }),
      });
      if (res.status === 401) {
        onLogout();
        return;
      }
      if (!res.ok) throw new Error("request failed");
      setSelectedIds(new Set());
    } catch {
      setWords(previous);
      setError("Не удалось обновить сложность выбранных слов");
    }
  }

  async function applyBulkStatus() {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    const previous = words;
    setWords((prev) => (prev ? prev.map((w) => (selectedIds.has(w.id) ? { ...w, status: bulkStatus } : w)) : prev));
    try {
      const res = await fetch(`${SERVER_HTTP_URL}/api/admin/words/bulk-status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ids, status: bulkStatus }),
      });
      if (res.status === 401) {
        onLogout();
        return;
      }
      if (!res.ok) throw new Error("request failed");
      setSelectedIds(new Set());
    } catch {
      setWords(previous);
      setError("Не удалось обновить статус выбранных слов");
    }
  }

  async function performDeleteWord() {
    const word = confirmDeleteWord;
    if (!word) return;
    setConfirmDeleteWord(null);
    const previous = words;
    setWords((prev) => (prev ? prev.filter((w) => w.id !== word.id) : prev));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(word.id);
      return next;
    });
    try {
      const res = await fetch(`${SERVER_HTTP_URL}/api/admin/words/${word.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        onLogout();
        return;
      }
      if (!res.ok) throw new Error("request failed");
    } catch {
      setWords(previous);
      setError("Не удалось удалить слово");
    }
  }

  async function performDeleteBulk() {
    setConfirmBulkDelete(false);
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    const previous = words;
    setWords((prev) => (prev ? prev.filter((w) => !selectedIds.has(w.id)) : prev));
    try {
      const res = await fetch(`${SERVER_HTTP_URL}/api/admin/words/bulk-delete`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ids }),
      });
      if (res.status === 401) {
        onLogout();
        return;
      }
      if (!res.ok) throw new Error("request failed");
      setSelectedIds(new Set());
    } catch {
      setWords(previous);
      setError("Не удалось удалить выбранные слова");
    }
  }

  return (
    <div className="admin-words">
      <div className="admin-words-header">
        <h2>Слова ({words?.length ?? "…"})</h2>
        <button className="ghost-btn" onClick={onLogout}>
          Выйти
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="admin-filters">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск по слову" />
        <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value as CategoryFilter)}>
          <option value="all">Все категории</option>
          {categories.map((c) => (
            <option key={c.id} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
          <option value="all">Все статусы</option>
          {STATUS_OPTIONS.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
        <select
          value={weightFilter}
          onChange={(e) => setWeightFilter(e.target.value === "all" ? "all" : (Number(e.target.value) as Weight))}
        >
          <option value="all">Вся сложность</option>
          {WEIGHT_OPTIONS.map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </select>
      </div>

      {selectedIds.size > 0 && (
        <div className="admin-bulk-bar">
          <span>Выбрано: {selectedIds.size}</span>
          <select value={bulkWeight} onChange={(e) => setBulkWeight(Number(e.target.value) as Weight)}>
            {WEIGHT_OPTIONS.map((w) => (
              <option key={w} value={w}>
                Сложность {w}
              </option>
            ))}
          </select>
          <button onClick={applyBulkWeight}>Применить</button>
          <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value as WordStatus)}>
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
          <button onClick={applyBulkStatus}>Применить</button>
          <button className="danger" onClick={() => setConfirmBulkDelete(true)}>
            Удалить
          </button>
          <button className="ghost-btn" onClick={() => setSelectedIds(new Set())}>
            Снять выбор
          </button>
        </div>
      )}

      {words === null && !error ? (
        <p>Загрузка…</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th className="checkbox-col">
                  <input type="checkbox" checked={allPageSelected} onChange={toggleSelectAllOnPage} />
                </th>
                {COLUMNS.map((col) => (
                  <th key={col.key} className="sortable" onClick={() => handleSort(col.key)}>
                    {col.label}
                    {sortColumn === col.key && (
                      <span className="sort-arrow">{sortDirection === "asc" ? " ▲" : " ▼"}</span>
                    )}
                  </th>
                ))}
                <th className="actions-col"></th>
              </tr>
            </thead>
            <tbody>
              {paged.map((w) => (
                <tr key={w.id}>
                  <td className="checkbox-col">
                    <input type="checkbox" checked={selectedIds.has(w.id)} onChange={() => toggleSelected(w.id)} />
                  </td>
                  <td>{w.id}</td>
                  <td>{w.text}</td>
                  <td>{w.category}</td>
                  <td>
                    <select value={w.weight} onChange={(e) => applyWeight(w.id, Number(e.target.value) as Weight)}>
                      {WEIGHT_OPTIONS.map((weight) => (
                        <option key={weight} value={weight}>
                          {weight}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <select value={w.status} onChange={(e) => applyStatus(w.id, e.target.value as WordStatus)}>
                      {STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>
                          {status}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="source-col" title={w.source ?? undefined}>
                    {w.source ?? "—"}
                  </td>
                  <td>{new Date(w.createdAt).toLocaleDateString()}</td>
                  <td className="actions-col">
                    <button className="icon-btn danger" aria-label="Удалить" title="Удалить" onClick={() => setConfirmDeleteWord(w)}>
                      🗑
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <p className="muted">Ничего не найдено</p>}
          {filtered.length > 0 && (
            <div className="admin-pagination">
              <button className="ghost-btn" disabled={currentPage <= 1} onClick={() => setPage((p) => p - 1)}>
                ← Назад
              </button>
              <span>
                Страница {currentPage} из {pageCount} ({filtered.length} слов)
              </span>
              <button className="ghost-btn" disabled={currentPage >= pageCount} onClick={() => setPage((p) => p + 1)}>
                Вперёд →
              </button>
            </div>
          )}
        </div>
      )}

      {confirmDeleteWord && (
        <div className="modal-overlay">
          <div className="modal">
            <p>Удалить слово «{confirmDeleteWord.text}»?</p>
            <div className="actions">
              <button onClick={() => setConfirmDeleteWord(null)}>Отмена</button>
              <button className="danger" onClick={performDeleteWord}>
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmBulkDelete && (
        <div className="modal-overlay">
          <div className="modal">
            <p>
              Удалить {selectedIds.size} слов{selectedIds.size === 1 ? "о" : "а"}?
            </p>
            <div className="actions">
              <button onClick={() => setConfirmBulkDelete(false)}>Отмена</button>
              <button className="danger" onClick={performDeleteBulk}>
                Удалить
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
