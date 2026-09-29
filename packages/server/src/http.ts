import type { IncomingMessage, ServerResponse } from "node:http";
import { getApprovedWords } from "./db/wordsRepo.js";

/** Single REST endpoint: single-device mode fetches the word pool once, then plays fully offline. */
export function handleHttpRequest(req: IncomingMessage, res: ServerResponse): boolean {
  const url = new URL(req.url ?? "/", "http://localhost");

  res.setHeader("Access-Control-Allow-Origin", "*");

  if (url.pathname === "/api/words" && req.method === "GET") {
    const words = getApprovedWords();
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(words));
    return true;
  }

  return false;
}
