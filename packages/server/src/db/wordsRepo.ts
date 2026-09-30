import type { AdminWord, Category, Word, WordStatus } from "@kridens/core";
import { db } from "./client.js";
import type { WordRow } from "./schema.js";

export function getApprovedWords(category?: Category): Word[] {
  const rows = category
    ? (db.prepare("SELECT * FROM words WHERE status = 'approved' AND category = ?").all(category) as unknown as WordRow[])
    : (db.prepare("SELECT * FROM words WHERE status = 'approved'").all() as unknown as WordRow[]);

  return rows.map(toWord);
}

export function insertWord(input: {
  text: string;
  category: Category;
  weight: Word["weight"];
  sourceFreq?: number;
  source?: string;
}) {
  db.prepare(
    "INSERT INTO words (text, category, weight, source_freq, status, created_at, source) VALUES (?, ?, ?, ?, 'approved', ?, ?)",
  ).run(input.text, input.category, input.weight, input.sourceFreq ?? null, Date.now(), input.source ?? null);
}

export function listAllForAdmin(): AdminWord[] {
  const rows = db.prepare("SELECT * FROM words ORDER BY id").all() as unknown as WordRow[];
  return rows.map(toAdminWord);
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
  db.prepare("DELETE FROM words WHERE id = ?").run(id);
}

export function deleteWordsBulk(ids: number[]) {
  const placeholders = ids.map(() => "?").join(",");
  db.prepare(`DELETE FROM word_collections WHERE word_id IN (${placeholders})`).run(...ids);
  db.prepare(`DELETE FROM words WHERE id IN (${placeholders})`).run(...ids);
}

function toWord(row: WordRow): Word {
  return {
    id: row.id,
    text: row.text,
    category: row.category,
    weight: row.weight as Word["weight"],
  };
}

export function toAdminWord(row: WordRow): AdminWord {
  return {
    id: row.id,
    text: row.text,
    category: row.category,
    weight: row.weight as Word["weight"],
    status: row.status,
    sourceFreq: row.source_freq,
    createdAt: row.created_at,
    source: row.source,
  };
}
