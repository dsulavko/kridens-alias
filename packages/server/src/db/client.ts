import "dotenv/config";
import { DatabaseSync } from "node:sqlite";
import {
  ADD_COLLECTION_FILTER_JSON_COLUMN_SQL,
  ADD_COLLECTION_TYPE_COLUMN_SQL,
  ADD_GAMES_PLAYED_COLUMN_SQL,
  ADD_SOURCE_COLUMN_SQL,
  BACKFILL_WORD_CATEGORIES_SQL,
  CREATE_CATEGORIES_TABLE_SQL,
  CREATE_COLLECTIONS_TABLE_SQL,
  CREATE_SAVED_ROOM_USED_WORDS_TABLE_SQL,
  CREATE_SAVED_ROOMS_TABLE_SQL,
  CREATE_WORD_CATEGORIES_TABLE_SQL,
  CREATE_WORD_COLLECTIONS_TABLE_SQL,
  CREATE_WORDS_TABLE_SQL,
} from "./schema.js";

const dbPath = process.env.DB_PATH ?? "./words.db";

export const db = new DatabaseSync(dbPath);
db.exec(CREATE_WORDS_TABLE_SQL);
db.exec(CREATE_CATEGORIES_TABLE_SQL);
db.exec(CREATE_COLLECTIONS_TABLE_SQL);
db.exec(CREATE_WORD_COLLECTIONS_TABLE_SQL);
db.exec(CREATE_WORD_CATEGORIES_TABLE_SQL);
db.exec(CREATE_SAVED_ROOMS_TABLE_SQL);
db.exec(CREATE_SAVED_ROOM_USED_WORDS_TABLE_SQL);

const hasSourceColumn = (db.prepare("PRAGMA table_info(words)").all() as { name: string }[]).some(
  (col) => col.name === "source",
);
if (!hasSourceColumn) db.exec(ADD_SOURCE_COLUMN_SQL);

const hasGamesPlayedColumn = (db.prepare("PRAGMA table_info(saved_rooms)").all() as { name: string }[]).some(
  (col) => col.name === "games_played",
);
if (!hasGamesPlayedColumn) db.exec(ADD_GAMES_PLAYED_COLUMN_SQL);

const collectionsColumns = (db.prepare("PRAGMA table_info(collections)").all() as { name: string }[]).map(
  (col) => col.name,
);
if (!collectionsColumns.includes("type")) db.exec(ADD_COLLECTION_TYPE_COLUMN_SQL);
if (!collectionsColumns.includes("filter_json")) db.exec(ADD_COLLECTION_FILTER_JSON_COLUMN_SQL);

const categoryCount = (db.prepare("SELECT COUNT(*) as c FROM categories").get() as { c: number }).c;
if (categoryCount === 0) {
  const now = Date.now();
  const insertCategory = db.prepare("INSERT INTO categories (name, created_at) VALUES (?, ?)");
  insertCategory.run("noun", now);
  insertCategory.run("phrase", now);
}

const wordCategoriesCount = (db.prepare("SELECT COUNT(*) AS c FROM word_categories").get() as { c: number }).c;
if (wordCategoriesCount === 0) db.exec(BACKFILL_WORD_CATEGORIES_SQL);
