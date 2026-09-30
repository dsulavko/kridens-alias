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
