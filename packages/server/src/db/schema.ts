export interface WordRow {
  id: number;
  text: string;
  category: "noun" | "phrase";
  weight: number;
  source_freq: number | null;
  status: "approved" | "pending" | "rejected";
  created_at: number;
  source: string | null;
}

export const CREATE_WORDS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS words (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    category TEXT NOT NULL,
    weight INTEGER NOT NULL,
    source_freq REAL,
    status TEXT NOT NULL DEFAULT 'approved',
    created_at INTEGER NOT NULL,
    source TEXT
  );
`;

/** words.db predates the `source` column — add it in place for databases created before this change. */
export const ADD_SOURCE_COLUMN_SQL = `ALTER TABLE words ADD COLUMN source TEXT;`;

export const CREATE_CATEGORIES_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL
  );
`;

export const CREATE_COLLECTIONS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS collections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL,
    type TEXT NOT NULL DEFAULT 'static',
    filter_json TEXT
  );
`;

/** collections predates `type`/`filter_json` — add them in place for databases created before dynamic collections. */
export const ADD_COLLECTION_TYPE_COLUMN_SQL = `ALTER TABLE collections ADD COLUMN type TEXT NOT NULL DEFAULT 'static';`;
export const ADD_COLLECTION_FILTER_JSON_COLUMN_SQL = `ALTER TABLE collections ADD COLUMN filter_json TEXT;`;

export const CREATE_WORD_COLLECTIONS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS word_collections (
    word_id INTEGER NOT NULL,
    collection_id INTEGER NOT NULL,
    PRIMARY KEY (word_id, collection_id)
  );
`;

/** Many-to-many: the admin console lets a word carry several categories, unlike the legacy
 * `words.category` column (kept only to back the game-facing `Word` type, which never filters by it). */
export const CREATE_WORD_CATEGORIES_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS word_categories (
    word_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    PRIMARY KEY (word_id, category_id)
  );
`;

/** One-time backfill for databases created before word_categories existed: turns each word's
 * legacy single `category` column value into its first (and, until reassigned, only) tag. */
export const BACKFILL_WORD_CATEGORIES_SQL = `
  INSERT OR IGNORE INTO word_categories (word_id, category_id)
  SELECT w.id, c.id FROM words w JOIN categories c ON c.name = w.category;
`;

/** A host-saved room: its rules snapshot (kept in sync while the lobby that saved it is still
 * open) plus, via `saved_room_used_words`, every word played under its GUID across however many
 * separate live rooms have been created from its link. */
export const CREATE_SAVED_ROOMS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS saved_rooms (
    guid TEXT PRIMARY KEY,
    rules_json TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    games_played INTEGER NOT NULL DEFAULT 0
  );
`;

/** saved_rooms predates the `games_played` column — add it in place for databases created before this change. */
export const ADD_GAMES_PLAYED_COLUMN_SQL = `ALTER TABLE saved_rooms ADD COLUMN games_played INTEGER NOT NULL DEFAULT 0;`;

export const CREATE_SAVED_ROOM_USED_WORDS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS saved_room_used_words (
    saved_room_guid TEXT NOT NULL,
    word_id INTEGER NOT NULL,
    PRIMARY KEY (saved_room_guid, word_id)
  );
`;
