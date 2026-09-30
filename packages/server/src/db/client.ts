import "dotenv/config";
import { DatabaseSync } from "node:sqlite";
import { ADD_SOURCE_COLUMN_SQL, CREATE_WORDS_TABLE_SQL } from "./schema.js";

const dbPath = process.env.DB_PATH ?? "./words.db";

export const db = new DatabaseSync(dbPath);
db.exec(CREATE_WORDS_TABLE_SQL);

const hasSourceColumn = (db.prepare("PRAGMA table_info(words)").all() as { name: string }[]).some(
  (col) => col.name === "source",
);
if (!hasSourceColumn) db.exec(ADD_SOURCE_COLUMN_SQL);
