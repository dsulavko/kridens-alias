import type { Category, Word } from "@kridens/core";
import { db } from "./client.js";
import type { WordRow } from "./schema.js";

export function getApprovedWords(category?: Category): Word[] {
  const rows = category
    ? (db.prepare("SELECT * FROM words WHERE status = 'approved' AND category = ?").all(category) as unknown as WordRow[])
    : (db.prepare("SELECT * FROM words WHERE status = 'approved'").all() as unknown as WordRow[]);

  return rows.map(toWord);
}

export function insertWord(input: { text: string; category: Category; weight: Word["weight"]; sourceFreq?: number }) {
  db.prepare(
    "INSERT INTO words (text, category, weight, source_freq, status, created_at) VALUES (?, ?, ?, ?, 'approved', ?)",
  ).run(input.text, input.category, input.weight, input.sourceFreq ?? null, Date.now());
}

export function listAll(): Word[] {
  const rows = db.prepare("SELECT * FROM words").all() as unknown as WordRow[];
  return rows.map(toWord);
}

function toWord(row: WordRow): Word {
  return {
    id: row.id,
    text: row.text,
    category: row.category,
    weight: row.weight as Word["weight"],
  };
}
