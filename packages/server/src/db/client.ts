import "dotenv/config";
import { DatabaseSync } from "node:sqlite";
import { CREATE_WORDS_TABLE_SQL } from "./schema.js";

const dbPath = process.env.DB_PATH ?? "./words.db";

export const db = new DatabaseSync(dbPath);
db.exec(CREATE_WORDS_TABLE_SQL);
