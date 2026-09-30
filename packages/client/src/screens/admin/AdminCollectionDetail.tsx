import { useEffect, useState } from "react";
import type { AdminWord, CategoryInfo, CollectionInfo, Weight } from "@kridens/core";
import { SERVER_HTTP_URL } from "../../config";

interface AdminCollectionDetailProps {
  collection: CollectionInfo;
  token: string;
  onLogout: () => void;
  onBack: () => void;
}

type WeightFilter = Weight | "all";

const WEIGHT_OPTIONS: Weight[] = [1, 2, 3, 4, 5];

export default function AdminCollectionDetail({ collection, token, onLogout, onBack }: AdminCollectionDetailProps) {
  const [words, setWords] = useState<AdminWord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [weightFilter, setWeightFilter] = useState<WeightFilter>("all");
  const [candidates, setCandidates] = useState<AdminWord[]>([]);
  const [categories, setCategories] = useState<CategoryInfo[]>([]);

  function loadWords() {
    fetch(`${SERVER_HTTP_URL}/api/admin/collections/${collection.id}/words`, {
      headers: { Authorization: `Bearer ${token}` },
    })
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
        if (err.message !== "unauthorized") setError("Не удалось загрузить слова коллекции");
      });
  }

  useEffect(loadWords, [collection.id, token]);

  useEffect(() => {
    fetch(`${SERVER_HTTP_URL}/api/admin/categories`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => (res.ok ? res.json() : []))
      .then((data: CategoryInfo[]) => setCategories(data))
      .catch(() => setCategories([]));
  }, [token]);

  useEffect(() => {
    const query = search.trim();
    if (!query && categoryFilter === "all" && weightFilter === "all") {
      setCandidates([]);
      return;
    }
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (categoryFilter !== "all") params.set("category", categoryFilter);
    if (weightFilter !== "all") params.set("weight", String(weightFilter));
    const controller = new AbortController();
    fetch(`${SERVER_HTTP_URL}/api/admin/collections/${collection.id}/candidate-words?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then((res) => {
        if (res.status === 401) {
          onLogout();
          throw new Error("unauthorized");
        }
        if (!res.ok) throw new Error("request failed");
        return res.json();
      })
      .then((data: AdminWord[]) => setCandidates(data))
      .catch((err) => {
        if (err.name !== "AbortError" && err.message !== "unauthorized") setError("Не удалось найти слова");
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, categoryFilter, weightFilter, collection.id, token]);

  async function addWord(word: AdminWord) {
    try {
      const res = await fetch(`${SERVER_HTTP_URL}/api/admin/collections/${collection.id}/words`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ids: [word.id] }),
      });
      if (res.status === 401) {
        onLogout();
        return;
      }
      if (!res.ok) throw new Error("request failed");
      setWords((prev) => (prev ? [...prev, word] : [word]));
      setCandidates((prev) => prev.filter((c) => c.id !== word.id));
    } catch {
      setError("Не удалось добавить слово в коллекцию");
    }
  }

  async function removeWord(word: AdminWord) {
    try {
      const res = await fetch(`${SERVER_HTTP_URL}/api/admin/collections/${collection.id}/words`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ids: [word.id] }),
      });
      if (res.status === 401) {
        onLogout();
        return;
      }
      if (!res.ok) throw new Error("request failed");
      setWords((prev) => (prev ? prev.filter((w) => w.id !== word.id) : prev));
    } catch {
      setError("Не удалось убрать слово из коллекции");
    }
  }

  return (
    <div className="admin-words">
      <div className="admin-words-header">
        <h2>Коллекция «{collection.name}» ({words?.length ?? "…"})</h2>
        <button className="ghost-btn" onClick={onBack}>
          ← Назад
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      <section>
        <h3>Добавить слова</h3>
        <div className="admin-create-form">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск по слову" />
          <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="all">Все категории</option>
            {categories.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
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
        {candidates.length > 0 && (
          <ul className="admin-candidate-list">
            {candidates.map((w) => (
              <li key={w.id}>
                <span>
                  {w.text} <span className="muted">({w.category})</span>
                </span>
                <button onClick={() => addWord(w)}>+ Добавить</button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {words === null && !error ? (
        <p>Загрузка…</p>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Слово</th>
                <th>Категория</th>
                <th>Сложность</th>
                <th className="actions-col"></th>
              </tr>
            </thead>
            <tbody>
              {words?.map((w) => (
                <tr key={w.id}>
                  <td>{w.id}</td>
                  <td>{w.text}</td>
                  <td>{w.category}</td>
                  <td>{w.weight}</td>
                  <td className="actions-col">
                    <button
                      className="icon-btn danger"
                      title="Убрать из коллекции"
                      aria-label="Убрать из коллекции"
                      onClick={() => removeWord(w)}
                    >
                      🗑
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {words?.length === 0 && <p className="muted">В коллекции пока нет слов</p>}
        </div>
      )}
    </div>
  );
}
