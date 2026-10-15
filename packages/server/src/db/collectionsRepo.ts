import type { AdminWord, CollectionFilter, CollectionInfo, CollectionType, Word } from "@kridens/core";
import { isCollectionReferencedBySavedRoom } from "./savedRoomsRepo.js";
import { db } from "./client.js";
import type { WordRow } from "./schema.js";
import { getCategoriesByWordId, toAdminWord, toWord } from "./wordsRepo.js";

function toAdminWords(rows: WordRow[]): AdminWord[] {
  const categoriesByWordId = getCategoriesByWordId(rows.map((row) => row.id));
  return rows.map((row) => toAdminWord(row, categoriesByWordId.get(row.id) ?? []));
}

export class CollectionInUseError extends Error {}

interface CollectionRow {
  id: number;
  name: string;
  createdAt: number;
  type: CollectionType;
  filter: CollectionFilter | null;
}

/** Pre-multiselect filters stored a single scalar per field; wrapping a lone value in an array
 * keeps those collections working under the current (array-valued) `CollectionFilter` shape. */
function normalizeFilterField<T>(value: unknown): T[] | undefined {
  if (value === null || value === undefined) return undefined;
  const list = Array.isArray(value) ? (value as T[]) : [value as T];
  return list.length > 0 ? list : undefined;
}

function parseFilter(filterJson: string | null): CollectionFilter | null {
  if (!filterJson) return null;
  try {
    const raw = JSON.parse(filterJson) as Record<string, unknown>;
    return {
      category: normalizeFilterField(raw.category),
      source: normalizeFilterField(raw.source),
      weight: normalizeFilterField(raw.weight),
    };
  } catch {
    return null;
  }
}

/** Builds the WHERE clause (and params) matching a dynamic collection's filter against `words`.
 * Dynamic collections only ever surface approved words, unconditionally. Beyond that, an
 * empty/unset field matches any value, so an empty filter matches every approved word, and a
 * field with several values matches a word whose own value is any one of them. */
export function buildFilterWhere(filter: CollectionFilter | null): { sql: string; params: (string | number)[] } {
  const conditions: string[] = ["status = 'approved'"];
  const params: (string | number)[] = [];
  if (filter?.category?.length) {
    const placeholders = filter.category.map(() => "?").join(",");
    conditions.push(
      `EXISTS (SELECT 1 FROM word_categories wc JOIN categories c ON c.id = wc.category_id WHERE wc.word_id = words.id AND c.name IN (${placeholders}))`,
    );
    params.push(...filter.category);
  }
  if (filter?.source?.length) {
    const placeholders = filter.source.map(() => "?").join(",");
    conditions.push(`source IN (${placeholders})`);
    params.push(...filter.source);
  }
  if (filter?.weight?.length) {
    const placeholders = filter.weight.map(() => "?").join(",");
    conditions.push(`weight IN (${placeholders})`);
    params.push(...filter.weight);
  }
  return { sql: conditions.join(" AND "), params };
}

export function countWordsMatchingFilter(filter: CollectionFilter | null): number {
  const { sql, params } = buildFilterWhere(filter);
  const row = db.prepare(`SELECT COUNT(*) AS count FROM words WHERE ${sql}`).get(...params) as { count: number };
  return row.count;
}

function getCollectionRow(id: number): CollectionRow | undefined {
  const row = db.prepare("SELECT id, name, created_at AS createdAt, type, filter_json AS filterJson FROM collections WHERE id = ?").get(id) as
    | { id: number; name: string; createdAt: number; type: CollectionType; filterJson: string | null }
    | undefined;
  if (!row) return undefined;
  return { id: row.id, name: row.name, createdAt: row.createdAt, type: row.type, filter: parseFilter(row.filterJson) };
}

export function getCollection(id: number): CollectionRow | undefined {
  return getCollectionRow(id);
}

function countStaticWords(id: number): number {
  const row = db.prepare("SELECT COUNT(*) AS count FROM word_collections WHERE collection_id = ?").get(id) as {
    count: number;
  };
  return row.count;
}

export function listCollections(): CollectionInfo[] {
  const rows = db
    .prepare("SELECT id, name, created_at AS createdAt, type, filter_json AS filterJson FROM collections ORDER BY name")
    .all() as { id: number; name: string; createdAt: number; type: CollectionType; filterJson: string | null }[];
  return rows.map((row) => {
    const filter = parseFilter(row.filterJson);
    return {
      id: row.id,
      name: row.name,
      createdAt: row.createdAt,
      type: row.type,
      filter,
      wordCount: row.type === "dynamic" ? countWordsMatchingFilter(filter) : countStaticWords(row.id),
    };
  });
}

export function createCollection(name: string, type: CollectionType = "static", filter: CollectionFilter | null = null) {
  db.prepare("INSERT INTO collections (name, created_at, type, filter_json) VALUES (?, ?, ?, ?)").run(
    name,
    Date.now(),
    type,
    type === "dynamic" ? JSON.stringify(filter ?? {}) : null,
  );
}

export function updateCollection(id: number, updates: { name?: string; filter?: CollectionFilter | null }) {
  const collection = getCollectionRow(id);
  if (!collection) return;
  if (updates.name !== undefined) {
    db.prepare("UPDATE collections SET name = ? WHERE id = ?").run(updates.name, id);
  }
  if (updates.filter !== undefined && collection.type === "dynamic") {
    db.prepare("UPDATE collections SET filter_json = ? WHERE id = ?").run(JSON.stringify(updates.filter ?? {}), id);
  }
}

export function deleteCollection(id: number) {
  const collection = getCollectionRow(id);
  if (!collection) return;
  if (collection.type === "static" && countStaticWords(id) > 0) throw new CollectionInUseError();
  if (isCollectionReferencedBySavedRoom(id)) throw new CollectionInUseError();
  db.prepare("DELETE FROM word_collections WHERE collection_id = ?").run(id);
  db.prepare("DELETE FROM collections WHERE id = ?").run(id);
}

/** The game-facing word pool for a room scoped to this collection — always approved-only, same
 * rule dynamic collections already enforce via `buildFilterWhere`, applied here too for static
 * ones (which otherwise have no status filter of their own). */
export function getApprovedWordsForCollection(id: number): Word[] {
  const collection = getCollectionRow(id);
  if (!collection) return [];
  if (collection.type === "dynamic") {
    const { sql, params } = buildFilterWhere(collection.filter);
    const rows = db.prepare(`SELECT * FROM words WHERE ${sql} ORDER BY id`).all(...params) as unknown as WordRow[];
    return rows.map(toWord);
  }
  const rows = db
    .prepare(
      `SELECT w.* FROM words w
       JOIN word_collections wc ON wc.word_id = w.id
       WHERE wc.collection_id = ? AND w.status = 'approved'
       ORDER BY w.id`,
    )
    .all(id) as unknown as WordRow[];
  return rows.map(toWord);
}

export function getCollectionWords(id: number): AdminWord[] {
  const collection = getCollectionRow(id);
  if (!collection) return [];
  if (collection.type === "dynamic") {
    const { sql, params } = buildFilterWhere(collection.filter);
    const rows = db.prepare(`SELECT * FROM words WHERE ${sql} ORDER BY id`).all(...params) as unknown as WordRow[];
    return toAdminWords(rows);
  }
  const rows = db
    .prepare(
      `SELECT w.* FROM words w
       JOIN word_collections wc ON wc.word_id = w.id
       WHERE wc.collection_id = ?
       ORDER BY w.id`,
    )
    .all(id) as unknown as WordRow[];
  return toAdminWords(rows);
}

/** Candidate search only applies to static collections — dynamic ones have no manual membership. */
export function getCandidateWords(
  id: number,
  query: string,
  category: string | null,
  weight: number | null,
  limit = 50,
): AdminWord[] {
  const conditions = [
    "w.text LIKE ? COLLATE NOCASE",
    "w.id NOT IN (SELECT word_id FROM word_collections WHERE collection_id = ?)",
  ];
  const params: (string | number)[] = [`%${query}%`, id];
  if (category) {
    conditions.push(
      "EXISTS (SELECT 1 FROM word_categories wc JOIN categories c ON c.id = wc.category_id WHERE wc.word_id = w.id AND c.name = ?)",
    );
    params.push(category);
  }
  if (weight) {
    conditions.push("w.weight = ?");
    params.push(weight);
  }
  const rows = db
    .prepare(`SELECT w.* FROM words w WHERE ${conditions.join(" AND ")} ORDER BY w.text LIMIT ?`)
    .all(...params, limit) as unknown as WordRow[];
  return toAdminWords(rows);
}

export function addWordsToCollection(id: number, wordIds: number[]) {
  const stmt = db.prepare("INSERT OR IGNORE INTO word_collections (word_id, collection_id) VALUES (?, ?)");
  for (const wordId of wordIds) stmt.run(wordId, id);
}

export function removeWordsFromCollection(id: number, wordIds: number[]) {
  const placeholders = wordIds.map(() => "?").join(",");
  db.prepare(`DELETE FROM word_collections WHERE collection_id = ? AND word_id IN (${placeholders})`).run(
    id,
    ...wordIds,
  );
}
