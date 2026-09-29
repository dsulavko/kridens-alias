export interface WordRow {
  id: number;
  text: string;
  category: "noun" | "phrase";
  weight: number;
  source_freq: number | null;
  status: "approved" | "pending" | "rejected";
  created_at: number;
}

export const CREATE_WORDS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS words (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    category TEXT NOT NULL,
    weight INTEGER NOT NULL,
    source_freq REAL,
    status TEXT NOT NULL DEFAULT 'approved',
    created_at INTEGER NOT NULL
  );
`;
