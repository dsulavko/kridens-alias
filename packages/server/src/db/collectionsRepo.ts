import type { AdminWord, CollectionInfo } from "@kridens/core";
import { db } from "./client.js";
import type { WordRow } from "./schema.js";
import { toAdminWord } from "./wordsRepo.js";

export class CollectionInUseError extends Error {}

export function listCollections(): CollectionInfo[] {
  return db
    .prepare(
      `SELECT c.id, c.name, c.created_at AS createdAt, COUNT(wc.word_id) AS wordCount
       FROM collections c
       LEFT JOIN word_collections wc ON wc.collection_id = c.id
       GROUP BY c.id
       ORDER BY c.name`,
    )
    .all() as unknown as CollectionInfo[];
}

export function createCollection(name: string) {
  db.prepare("INSERT INTO collections (name, created_at) VALUES (?, ?)").run(name, Date.now());
}

function getCollectionWordCount(id: number): number {
  const row = db.prepare("SELECT COUNT(*) AS count FROM word_collections WHERE collection_id = ?").get(id) as {
    count: number;
  };
  return row.count;
}

export function deleteCollection(id: number) {
  if (getCollectionWordCount(id) > 0) throw new CollectionInUseError();
  db.prepare("DELETE FROM collections WHERE id = ?").run(id);
}

export function getCollectionWords(id: number): AdminWord[] {
  const rows = db
    .prepare(
      `SELECT w.* FROM words w
       JOIN word_collections wc ON wc.word_id = w.id
       WHERE wc.collection_id = ?
       ORDER BY w.id`,
    )
    .all(id) as unknown as WordRow[];
  return rows.map(toAdminWord);
}

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
    conditions.push("w.category = ?");
    params.push(category);
  }
  if (weight) {
    conditions.push("w.weight = ?");
    params.push(weight);
  }
  const rows = db
    .prepare(`SELECT w.* FROM words w WHERE ${conditions.join(" AND ")} ORDER BY w.text LIMIT ?`)
    .all(...params, limit) as unknown as WordRow[];
  return rows.map(toAdminWord);
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
