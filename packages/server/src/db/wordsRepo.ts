import type { AdminWord, Category, Word, WordStatus } from "@kridens/core";
import { db } from "./client.js";
import type { WordRow } from "./schema.js";

export function getApprovedWords(category?: Category): Word[] {
  const rows = category
    ? (db.prepare("SELECT * FROM words WHERE status = 'approved' AND category = ?").all(category) as unknown as WordRow[])
    : (db.prepare("SELECT * FROM words WHERE status = 'approved'").all() as unknown as WordRow[]);

  return rows.map(toWord);
}

function getOrCreateCategoryId(name: string): number {
  const existing = db.prepare("SELECT id FROM categories WHERE name = ?").get(name) as { id: number } | undefined;
  if (existing) return existing.id;
  db.prepare("INSERT INTO categories (name, created_at) VALUES (?, ?)").run(name, Date.now());
  return (db.prepare("SELECT id FROM categories WHERE name = ?").get(name) as { id: number }).id;
}

export function insertWord(input: {
  text: string;
  category: Category;
  weight: Word["weight"];
  sourceFreq?: number;
  source?: string;
}) {
  const result = db
    .prepare(
      "INSERT INTO words (text, category, weight, source_freq, status, created_at, source) VALUES (?, ?, ?, ?, 'approved', ?, ?)",
    )
    .run(input.text, input.category, input.weight, input.sourceFreq ?? null, Date.now(), input.source ?? null);
  const categoryId = getOrCreateCategoryId(input.category);
  db.prepare("INSERT OR IGNORE INTO word_categories (word_id, category_id) VALUES (?, ?)").run(
    result.lastInsertRowid,
    categoryId,
  );
}

export function listAllForAdmin(): AdminWord[] {
  const rows = db.prepare("SELECT * FROM words ORDER BY id").all() as unknown as WordRow[];
  const categoriesByWordId = getCategoriesByWordId(rows.map((row) => row.id));
  return rows.map((row) => toAdminWord(row, categoriesByWordId.get(row.id) ?? []));
}

export function listDistinctSources(): string[] {
  const rows = db.prepare("SELECT DISTINCT source FROM words WHERE source IS NOT NULL ORDER BY source").all() as {
    source: string;
  }[];
  return rows.map((row) => row.source);
}

/** Batches the word -> categories lookup for a set of word ids, for `AdminWord` rows which (unlike
 * the game-facing `Word`) can carry several categories. */
export function getCategoriesByWordId(wordIds: number[]): Map<number, Category[]> {
  const map = new Map<number, Category[]>();
  if (wordIds.length === 0) return map;
  const placeholders = wordIds.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT wc.word_id AS wordId, c.name AS name FROM word_categories wc
       JOIN categories c ON c.id = wc.category_id
       WHERE wc.word_id IN (${placeholders})
       ORDER BY c.name`,
    )
    .all(...wordIds) as { wordId: number; name: string }[];
  for (const row of rows) {
    const list = map.get(row.wordId) ?? [];
    list.push(row.name);
    map.set(row.wordId, list);
  }
  return map;
}

export function updateWeight(id: number, weight: Word["weight"]) {
  db.prepare("UPDATE words SET weight = ? WHERE id = ?").run(weight, id);
}

export function updateWeightBulk(ids: number[], weight: Word["weight"]) {
  const placeholders = ids.map(() => "?").join(",");
  db.prepare(`UPDATE words SET weight = ? WHERE id IN (${placeholders})`).run(weight, ...ids);
}

export function updateStatus(id: number, status: WordStatus) {
  db.prepare("UPDATE words SET status = ? WHERE id = ?").run(status, id);
}

export function updateStatusBulk(ids: number[], status: WordStatus) {
  const placeholders = ids.map(() => "?").join(",");
  db.prepare(`UPDATE words SET status = ? WHERE id IN (${placeholders})`).run(status, ...ids);
}

export function deleteWord(id: number) {
  db.prepare("DELETE FROM word_collections WHERE word_id = ?").run(id);
  db.prepare("DELETE FROM word_categories WHERE word_id = ?").run(id);
  db.prepare("DELETE FROM words WHERE id = ?").run(id);
}

export function deleteWordsBulk(ids: number[]) {
  const placeholders = ids.map(() => "?").join(",");
  db.prepare(`DELETE FROM word_collections WHERE word_id IN (${placeholders})`).run(...ids);
  db.prepare(`DELETE FROM word_categories WHERE word_id IN (${placeholders})`).run(...ids);
  db.prepare(`DELETE FROM words WHERE id IN (${placeholders})`).run(...ids);
}

export function toWord(row: WordRow): Word {
  return {
    id: row.id,
    text: row.text,
    category: row.category,
    weight: row.weight as Word["weight"],
  };
}

export function toAdminWord(row: WordRow, categories: Category[]): AdminWord {
  return {
    id: row.id,
    text: row.text,
    categories,
    weight: row.weight as Word["weight"],
    status: row.status,
    sourceFreq: row.source_freq,
    createdAt: row.created_at,
    source: row.source,
  };
}
