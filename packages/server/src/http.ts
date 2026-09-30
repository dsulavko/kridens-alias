import type { IncomingMessage, ServerResponse } from "node:http";
import type { WordStatus } from "@kridens/core";
import { isAuthorized, login } from "./adminAuth.js";
import { CategoryInUseError, createCategory, deleteCategory, listCategories } from "./db/categoriesRepo.js";
import {
  addWordsToCollection,
  CollectionInUseError,
  createCollection,
  deleteCollection,
  getCandidateWords,
  getCollectionWords,
  listCollections,
  removeWordsFromCollection,
} from "./db/collectionsRepo.js";
import {
  deleteWord,
  deleteWordsBulk,
  getApprovedWords,
  listAllForAdmin,
  updateStatus,
  updateStatusBulk,
  updateWeight,
  updateWeightBulk,
} from "./db/wordsRepo.js";
import type { RoomManager } from "./rooms/roomManager.js";

const WEIGHTS = [1, 2, 3, 4, 5];
function isValidWeight(value: unknown): value is 1 | 2 | 3 | 4 | 5 {
  return typeof value === "number" && WEIGHTS.includes(value);
}

const STATUSES: WordStatus[] = ["approved", "pending", "rejected"];
function isValidStatus(value: unknown): value is WordStatus {
  return typeof value === "string" && STATUSES.includes(value as WordStatus);
}

function isPositiveIntArray(value: unknown): value is number[] {
  return Array.isArray(value) && value.length > 0 && value.every((id) => typeof id === "number" && Number.isInteger(id) && id > 0);
}

function parseName(body: string): string | null {
  try {
    const { name } = JSON.parse(body) as { name?: unknown };
    const trimmed = typeof name === "string" ? name.trim() : "";
    return trimmed && trimmed.length <= 60 ? trimmed : null;
  } catch {
    return null;
  }
}

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
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
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

  if (url.pathname === "/api/admin/words/bulk-weight" && req.method === "PATCH") {
    if (!isAuthorized(req)) {
      res.statusCode = 401;
      res.end();
      return true;
    }
    readBody(req).then((body) => {
      try {
        const { ids, weight } = JSON.parse(body) as { ids?: unknown; weight?: unknown };
        if (!isPositiveIntArray(ids) || !isValidWeight(weight)) {
          res.statusCode = 400;
          res.end();
          return;
        }
        updateWeightBulk(ids, weight);
        res.statusCode = 204;
        res.end();
      } catch {
        res.statusCode = 400;
        res.end();
      }
    });
    return true;
  }

  if (url.pathname === "/api/admin/words/bulk-status" && req.method === "PATCH") {
    if (!isAuthorized(req)) {
      res.statusCode = 401;
      res.end();
      return true;
    }
    readBody(req).then((body) => {
      try {
        const { ids, status } = JSON.parse(body) as { ids?: unknown; status?: unknown };
        if (!isPositiveIntArray(ids) || !isValidStatus(status)) {
          res.statusCode = 400;
          res.end();
          return;
        }
        updateStatusBulk(ids, status);
        res.statusCode = 204;
        res.end();
      } catch {
        res.statusCode = 400;
        res.end();
      }
    });
    return true;
  }

  const wordIdMatch = url.pathname.match(/^\/api\/admin\/words\/(\d+)$/);
  if (wordIdMatch && req.method === "PATCH") {
    if (!isAuthorized(req)) {
      res.statusCode = 401;
      res.end();
      return true;
    }
    const id = Number(wordIdMatch[1]);
    readBody(req).then((body) => {
      try {
        const { weight, status } = JSON.parse(body) as { weight?: unknown; status?: unknown };
        const hasWeight = weight !== undefined;
        const hasStatus = status !== undefined;
        if ((!hasWeight && !hasStatus) || (hasWeight && !isValidWeight(weight)) || (hasStatus && !isValidStatus(status))) {
          res.statusCode = 400;
          res.end();
          return;
        }
        if (hasWeight) updateWeight(id, weight);
        if (hasStatus) updateStatus(id, status);
        res.statusCode = 204;
        res.end();
      } catch {
        res.statusCode = 400;
        res.end();
      }
    });
    return true;
  }

  if (url.pathname === "/api/admin/words/bulk-delete" && req.method === "DELETE") {
    if (!isAuthorized(req)) {
      res.statusCode = 401;
      res.end();
      return true;
    }
    readBody(req).then((body) => {
      try {
        const { ids } = JSON.parse(body) as { ids?: unknown };
        if (!isPositiveIntArray(ids)) {
          res.statusCode = 400;
          res.end();
          return;
        }
        deleteWordsBulk(ids);
        res.statusCode = 204;
        res.end();
      } catch {
        res.statusCode = 400;
        res.end();
      }
    });
    return true;
  }

  if (wordIdMatch && req.method === "DELETE") {
    if (!isAuthorized(req)) {
      res.statusCode = 401;
      res.end();
      return true;
    }
    deleteWord(Number(wordIdMatch[1]));
    res.statusCode = 204;
    res.end();
    return true;
  }

  if (url.pathname === "/api/admin/categories" && req.method === "GET") {
    if (!isAuthorized(req)) {
      res.statusCode = 401;
      res.end();
      return true;
    }
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(listCategories()));
    return true;
  }

  if (url.pathname === "/api/admin/categories" && req.method === "POST") {
    if (!isAuthorized(req)) {
      res.statusCode = 401;
      res.end();
      return true;
    }
    readBody(req).then((body) => {
      const name = parseName(body);
      if (!name) {
        res.statusCode = 400;
        res.end();
        return;
      }
      try {
        createCategory(name);
        res.statusCode = 204;
      } catch {
        res.statusCode = 409;
      }
      res.end();
    });
    return true;
  }

  const categoryIdMatch = url.pathname.match(/^\/api\/admin\/categories\/(\d+)$/);
  if (categoryIdMatch && req.method === "DELETE") {
    if (!isAuthorized(req)) {
      res.statusCode = 401;
      res.end();
      return true;
    }
    try {
      deleteCategory(Number(categoryIdMatch[1]));
      res.statusCode = 204;
    } catch (err) {
      res.statusCode = err instanceof CategoryInUseError ? 409 : 400;
    }
    res.end();
    return true;
  }

  if (url.pathname === "/api/admin/collections" && req.method === "GET") {
    if (!isAuthorized(req)) {
      res.statusCode = 401;
      res.end();
      return true;
    }
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(listCollections()));
    return true;
  }

  if (url.pathname === "/api/admin/collections" && req.method === "POST") {
    if (!isAuthorized(req)) {
      res.statusCode = 401;
      res.end();
      return true;
    }
    readBody(req).then((body) => {
      const name = parseName(body);
      if (!name) {
        res.statusCode = 400;
        res.end();
        return;
      }
      try {
        createCollection(name);
        res.statusCode = 204;
      } catch {
        res.statusCode = 409;
      }
      res.end();
    });
    return true;
  }

  const collectionIdMatch = url.pathname.match(/^\/api\/admin\/collections\/(\d+)$/);
  if (collectionIdMatch && req.method === "DELETE") {
    if (!isAuthorized(req)) {
      res.statusCode = 401;
      res.end();
      return true;
    }
    try {
      deleteCollection(Number(collectionIdMatch[1]));
      res.statusCode = 204;
    } catch (err) {
      res.statusCode = err instanceof CollectionInUseError ? 409 : 400;
    }
    res.end();
    return true;
  }

  const collectionWordsMatch = url.pathname.match(/^\/api\/admin\/collections\/(\d+)\/words$/);
  if (collectionWordsMatch && req.method === "GET") {
    if (!isAuthorized(req)) {
      res.statusCode = 401;
      res.end();
      return true;
    }
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(getCollectionWords(Number(collectionWordsMatch[1]))));
    return true;
  }

  if (collectionWordsMatch && req.method === "POST") {
    if (!isAuthorized(req)) {
      res.statusCode = 401;
      res.end();
      return true;
    }
    const collectionId = Number(collectionWordsMatch[1]);
    readBody(req).then((body) => {
      try {
        const { ids } = JSON.parse(body) as { ids?: unknown };
        if (!isPositiveIntArray(ids)) {
          res.statusCode = 400;
          res.end();
          return;
        }
        addWordsToCollection(collectionId, ids);
        res.statusCode = 204;
        res.end();
      } catch {
        res.statusCode = 400;
        res.end();
      }
    });
    return true;
  }

  if (collectionWordsMatch && req.method === "DELETE") {
    if (!isAuthorized(req)) {
      res.statusCode = 401;
      res.end();
      return true;
    }
    const collectionId = Number(collectionWordsMatch[1]);
    readBody(req).then((body) => {
      try {
        const { ids } = JSON.parse(body) as { ids?: unknown };
        if (!isPositiveIntArray(ids)) {
          res.statusCode = 400;
          res.end();
          return;
        }
        removeWordsFromCollection(collectionId, ids);
        res.statusCode = 204;
        res.end();
      } catch {
        res.statusCode = 400;
        res.end();
      }
    });
    return true;
  }

  const candidateWordsMatch = url.pathname.match(/^\/api\/admin\/collections\/(\d+)\/candidate-words$/);
  if (candidateWordsMatch && req.method === "GET") {
    if (!isAuthorized(req)) {
      res.statusCode = 401;
      res.end();
      return true;
    }
    const query = url.searchParams.get("q") ?? "";
    const category = url.searchParams.get("category") || null;
    const weightParam = Number(url.searchParams.get("weight"));
    const weight = isValidWeight(weightParam) ? weightParam : null;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(getCandidateWords(Number(candidateWordsMatch[1]), query, category, weight)));
    return true;
  }

  return false;
}
