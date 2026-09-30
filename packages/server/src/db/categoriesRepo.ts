import type { CategoryInfo } from "@kridens/core";
import { db } from "./client.js";

export class CategoryInUseError extends Error {}

export function listCategories(): CategoryInfo[] {
  return db
    .prepare(
      "SELECT c.id, c.name, COUNT(w.id) AS wordCount FROM categories c LEFT JOIN words w ON w.category = c.name GROUP BY c.id ORDER BY c.name",
    )
    .all() as unknown as CategoryInfo[];
}

export function createCategory(name: string) {
  db.prepare("INSERT INTO categories (name, created_at) VALUES (?, ?)").run(name, Date.now());
}

export function deleteCategory(id: number) {
  const row = db.prepare("SELECT name FROM categories WHERE id = ?").get(id) as { name: string } | undefined;
  if (!row) return;
  const { count } = db.prepare("SELECT COUNT(*) AS count FROM words WHERE category = ?").get(row.name) as {
    count: number;
  };
  if (count > 0) throw new CategoryInUseError();
  db.prepare("DELETE FROM categories WHERE id = ?").run(id);
}
