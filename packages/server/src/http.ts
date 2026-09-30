import type { IncomingMessage, ServerResponse } from "node:http";
import { isAuthorized, login } from "./adminAuth.js";
import { getApprovedWords, listAllForAdmin } from "./db/wordsRepo.js";
import type { RoomManager } from "./rooms/roomManager.js";

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/** Single-device mode fetches the word pool once, then plays fully offline; the room route lets the
 * "join room" screen confirm a room code exists before the joiner is added as a player. */
export function handleHttpRequest(req: IncomingMessage, res: ServerResponse, roomManager: RoomManager): boolean {
  const url = new URL(req.url ?? "/", "http://localhost");

  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.statusCode = 204;
    res.end();
    return true;
  }

  if (url.pathname === "/api/words" && req.method === "GET") {
    const words = getApprovedWords();
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(words));
    return true;
  }

  const roomMatch = url.pathname.match(/^\/api\/rooms\/([A-Za-z0-9]+)$/);
  if (roomMatch && req.method === "GET") {
    res.statusCode = roomManager.getRoom(roomMatch[1]) ? 204 : 404;
    res.end();
    return true;
  }

  if (url.pathname === "/api/admin/login" && req.method === "POST") {
    readBody(req).then((body) => {
      try {
        const { username, password } = JSON.parse(body) as { username?: string; password?: string };
        const token = login(username ?? "", password ?? "");
        if (!token) {
          res.statusCode = 401;
          res.end();
          return;
        }
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ token }));
      } catch {
        res.statusCode = 400;
        res.end();
      }
    });
    return true;
  }

  if (url.pathname === "/api/admin/words" && req.method === "GET") {
    if (!isAuthorized(req)) {
      res.statusCode = 401;
      res.end();
      return true;
    }
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(listAllForAdmin()));
    return true;
  }

  return false;
}
