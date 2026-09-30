import type { IncomingMessage, ServerResponse } from "node:http";
import { getApprovedWords } from "./db/wordsRepo.js";
import type { RoomManager } from "./rooms/roomManager.js";

/** Single-device mode fetches the word pool once, then plays fully offline; the room route lets the
 * "join room" screen preview a room's real team names before the joiner is added as a player. */
export function handleHttpRequest(req: IncomingMessage, res: ServerResponse, roomManager: RoomManager): boolean {
  const url = new URL(req.url ?? "/", "http://localhost");

  res.setHeader("Access-Control-Allow-Origin", "*");

  if (url.pathname === "/api/words" && req.method === "GET") {
    const words = getApprovedWords();
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(words));
    return true;
  }

  const roomMatch = url.pathname.match(/^\/api\/rooms\/([A-Za-z0-9]+)$/);
  if (roomMatch && req.method === "GET") {
    const teams = roomManager.getPublicTeams(roomMatch[1]);
    if (!teams) {
      res.statusCode = 404;
      res.end();
      return true;
    }
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ teams }));
    return true;
  }

  return false;
}
