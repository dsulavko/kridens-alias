import type { CategoryInfo } from "@kridens/core";
import { db } from "./client.js";

export class CategoryInUseError extends Error {}

export function listCategories(): CategoryInfo[] {
  return db
    .prepare(
      `SELECT c.id, c.name, COUNT(wc.word_id) AS wordCount
       FROM categories c
       LEFT JOIN word_categories wc ON wc.category_id = c.id
       GROUP BY c.id
       ORDER BY c.name`,
    )
    .all() as unknown as CategoryInfo[];
}

export function createCategory(name: string) {
  db.prepare("INSERT INTO categories (name, created_at) VALUES (?, ?)").run(name, Date.now());
}

export function deleteCategory(id: number) {
  const row = db.prepare("SELECT id FROM categories WHERE id = ?").get(id) as { id: number } | undefined;
  if (!row) return;
  const { count } = db.prepare("SELECT COUNT(*) AS count FROM word_categories WHERE category_id = ?").get(id) as {
    count: number;
  };
  if (count > 0) throw new CategoryInUseError();
  db.prepare("DELETE FROM categories WHERE id = ?").run(id);
}
