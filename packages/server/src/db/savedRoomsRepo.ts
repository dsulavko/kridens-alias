import type { RoomRules, SavedRoomInfo } from "@kridens/core";
import { db } from "./client.js";

export function createSavedRoom(guid: string, rules: RoomRules): void {
  db.prepare("INSERT INTO saved_rooms (guid, rules_json, created_at) VALUES (?, ?, ?)").run(
    guid,
    JSON.stringify(rules),
    Date.now(),
  );
}

export function updateSavedRoomRules(guid: string, rules: RoomRules): void {
  db.prepare("UPDATE saved_rooms SET rules_json = ? WHERE guid = ?").run(JSON.stringify(rules), guid);
}

export function getSavedRoomRules(guid: string): RoomRules | undefined {
  const row = db.prepare("SELECT rules_json FROM saved_rooms WHERE guid = ?").get(guid) as
    | { rules_json: string }
    | undefined;
  return row ? (JSON.parse(row.rules_json) as RoomRules) : undefined;
}

export function getSavedRoomUsedWordIds(guid: string): Set<number> {
  const rows = db.prepare("SELECT word_id FROM saved_room_used_words WHERE saved_room_guid = ?").all(guid) as {
    word_id: number;
  }[];
  return new Set(rows.map((r) => r.word_id));
}

/**
 * Wrapped in one transaction: with "Максимум слов в ходе" off, a single turn's deck is sized to
 * the whole available pool (thousands of words), and committing each row separately measured
 * at ~2s for that many rows — long enough to stall the server's single event loop for every
 * other room too. Batched in one transaction, the same insert takes single-digit milliseconds.
 */
export function addSavedRoomUsedWordIds(guid: string, wordIds: number[]): void {
  if (wordIds.length === 0) return;
  const insert = db.prepare("INSERT OR IGNORE INTO saved_room_used_words (saved_room_guid, word_id) VALUES (?, ?)");
  db.exec("BEGIN");
  try {
    for (const id of wordIds) insert.run(guid, id);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

/** Called when the word pool under this GUID has been fully exhausted, so the next turn can start looping from the top. */
export function clearSavedRoomUsedWordIds(guid: string): void {
  db.prepare("DELETE FROM saved_room_used_words WHERE saved_room_guid = ?").run(guid);
}

/** +1 each time a fresh match begins under this GUID — the initial `startGame()` of a live
 * session and every `playAgain()` within it, but not a `newSetup()` back to the lobby, which
 * doesn't start playing again on its own. */
export function incrementSavedRoomGamesPlayed(guid: string): void {
  db.prepare("UPDATE saved_rooms SET games_played = games_played + 1 WHERE guid = ?").run(guid);
}

export function listSavedRoomsForAdmin(): SavedRoomInfo[] {
  return db
    .prepare(
      `SELECT sr.guid AS guid, sr.created_at AS createdAt, sr.games_played AS gamesPlayed,
              COUNT(w.word_id) AS wordCount
       FROM saved_rooms sr
       LEFT JOIN saved_room_used_words w ON w.saved_room_guid = sr.guid
       GROUP BY sr.guid
       ORDER BY sr.created_at DESC`,
    )
    .all() as unknown as SavedRoomInfo[];
}

export function deleteSavedRoom(guid: string): void {
  db.prepare("DELETE FROM saved_room_used_words WHERE saved_room_guid = ?").run(guid);
  db.prepare("DELETE FROM saved_rooms WHERE guid = ?").run(guid);
}
