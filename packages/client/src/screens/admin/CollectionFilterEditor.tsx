import { useEffect, useState } from "react";
import type { CategoryInfo, CollectionFilter, Weight } from "@kridens/core";
import { SERVER_HTTP_URL } from "../../config";
import { buildFilterQuery } from "./collectionFilter";

interface CollectionFilterEditorProps {
  token: string;
  filter: CollectionFilter;
  onChange: (filter: CollectionFilter) => void;
  categories: CategoryInfo[];
  sources: string[];
}

const WEIGHT_OPTIONS: Weight[] = [1, 2, 3, 4, 5];

/** Shared row height for every multiselect, so category/source/weight line up regardless of how
 * many options each one has — longer lists scroll inside the box instead of growing it. */
const SELECT_SIZE = 6;

/** Sentinel option meaning "no restriction on this field" — selecting it clears any specific
 * values (and picking a specific value drops it, since the two are mutually exclusive). */
const ALL_VALUE = "__all__";

function resolveSelection(selectedValues: string[]): string[] | undefined {
  const withoutAll = selectedValues.filter((v) => v !== ALL_VALUE);
  return withoutAll.length > 0 ? withoutAll : undefined;
}

/** Multiselect per filter dimension (category/source/weight match if a word's value is any of the
 * selected options), plus a live count of how many approved words currently match. */
export default function CollectionFilterEditor({
  token,
  filter,
  onChange,
  categories,
  sources,
}: CollectionFilterEditorProps) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const query = buildFilterQuery(filter);
    fetch(`${SERVER_HTTP_URL}/api/admin/collections/preview-count?${query}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { count: number } | null) => setCount(data?.count ?? null))
      .catch((err) => {
        if (err.name !== "AbortError") setCount(null);
      });
    return () => controller.abort();
  }, [token, filter]);

  return (
    <div className="collection-filter-editor">
      <div className="collection-filter-field">
        <label>Категория</label>
        <select
          multiple
          size={SELECT_SIZE}
          value={filter.category?.length ? filter.category : [ALL_VALUE]}
          onChange={(e) =>
            onChange({ ...filter, category: resolveSelection(Array.from(e.target.selectedOptions, (o) => o.value)) })
          }
        >
          <option value={ALL_VALUE}>Все</option>
          {categories.map((c) => (
            <option key={c.id} value={c.name}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="collection-filter-field">
        <label>Источник</label>
        <select
          multiple
          size={SELECT_SIZE}
          value={filter.source?.length ? filter.source : [ALL_VALUE]}
          onChange={(e) =>
            onChange({ ...filter, source: resolveSelection(Array.from(e.target.selectedOptions, (o) => o.value)) })
          }
        >
          <option value={ALL_VALUE}>Все</option>
          {sources.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      <div className="collection-filter-field">
        <label>Сложность</label>
        <select
          multiple
          size={SELECT_SIZE}
          value={filter.weight?.length ? filter.weight.map(String) : [ALL_VALUE]}
          onChange={(e) => {
            const resolved = resolveSelection(Array.from(e.target.selectedOptions, (o) => o.value));
            onChange({ ...filter, weight: resolved?.map(Number) as Weight[] | undefined });
          }}
        >
          <option value={ALL_VALUE}>Все</option>
          {WEIGHT_OPTIONS.map((w) => (
            <option key={w} value={w}>
              {w}
            </option>
          ))}
        </select>
      </div>

      <p className="muted collection-filter-count">Слов попадёт в коллекцию: {count === null ? "…" : count}</p>
    </div>
  );
}
