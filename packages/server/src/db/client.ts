import "dotenv/config";
import { DatabaseSync } from "node:sqlite";
import {
  ADD_SOURCE_COLUMN_SQL,
  CREATE_CATEGORIES_TABLE_SQL,
  CREATE_COLLECTIONS_TABLE_SQL,
  CREATE_WORD_COLLECTIONS_TABLE_SQL,
  CREATE_WORDS_TABLE_SQL,
} from "./schema.js";

const dbPath = process.env.DB_PATH ?? "./words.db";

export const db = new DatabaseSync(dbPath);
db.exec(CREATE_WORDS_TABLE_SQL);
db.exec(CREATE_CATEGORIES_TABLE_SQL);
db.exec(CREATE_COLLECTIONS_TABLE_SQL);
db.exec(CREATE_WORD_COLLECTIONS_TABLE_SQL);

const hasSourceColumn = (db.prepare("PRAGMA table_info(words)").all() as { name: string }[]).some(
  (col) => col.name === "source",
);
if (!hasSourceColumn) db.exec(ADD_SOURCE_COLUMN_SQL);

const categoryCount = (db.prepare("SELECT COUNT(*) as c FROM categories").get() as { c: number }).c;
if (categoryCount === 0) {
  const now = Date.now();
  const insertCategory = db.prepare("INSERT INTO categories (name, created_at) VALUES (?, ?)");
  insertCategory.run("noun", now);
  insertCategory.run("phrase", now);
}
