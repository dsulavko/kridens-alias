import { useEffect, useMemo, useState } from "react";
import type { AdminWord, Category, Weight, WordStatus } from "@kridens/core";
import { SERVER_HTTP_URL } from "../../config";

interface AdminWordsListProps {
  token: string;
  onLogout: () => void;
}

type CategoryFilter = Category | "all";
type StatusFilter = WordStatus | "all";
type WeightFilter = Weight | "all";

const WEIGHT_OPTIONS: Weight[] = [1, 2, 3, 4, 5];
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

  function handleSort(column: SortColumn) {
    if (column === sortColumn) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("asc");
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
          <option value="noun">noun</option>
          <option value="phrase">phrase</option>
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}>
          <option value="all">Все статусы</option>
          <option value="approved">approved</option>
          <option value="pending">pending</option>
          <option value="rejected">rejected</option>
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

      {words === null && !error ? (
        <p>Загрузка…</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                {COLUMNS.map((col) => (
                  <th key={col.key} className="sortable" onClick={() => handleSort(col.key)}>
                    {col.label}
                    {sortColumn === col.key && (
                      <span className="sort-arrow">{sortDirection === "asc" ? " ▲" : " ▼"}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((w) => (
                <tr key={w.id}>
                  <td>{w.id}</td>
                  <td>{w.text}</td>
                  <td>{w.category}</td>
                  <td>{w.weight}</td>
                  <td>{w.status}</td>
                  <td>{w.source ?? "—"}</td>
                  <td>{new Date(w.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <p className="muted">Ничего не найдено</p>}
        </div>
      )}
    </div>
  );
}
