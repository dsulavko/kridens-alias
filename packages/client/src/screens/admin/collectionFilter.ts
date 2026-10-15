import type { CollectionFilter } from "@kridens/core";

export function buildFilterQuery(filter: CollectionFilter): string {
  const params = new URLSearchParams();
  filter.category?.forEach((v) => params.append("category", v));
  filter.source?.forEach((v) => params.append("source", v));
  filter.weight?.forEach((v) => params.append("weight", String(v)));
  return params.toString();
}

export function formatCollectionFilter(filter: CollectionFilter | null): string {
  if (!filter) return "—";
  const parts: string[] = [];
  if (filter.category?.length) parts.push(`категория: ${filter.category.join(", ")}`);
  if (filter.source?.length) parts.push(`источник: ${filter.source.join(", ")}`);
  if (filter.weight?.length) parts.push(`сложность: ${filter.weight.join(", ")}`);
  return parts.length > 0 ? parts.join(", ") : "без фильтров (все слова)";
}
