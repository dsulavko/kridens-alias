import type { IncomingMessage } from "node:http";
import { randomUUID } from "node:crypto";

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

const sessions = new Map<string, number>();

export function login(username: string, password: string): string | null {
  if (username !== process.env.ADMIN_USERNAME || password !== process.env.ADMIN_PASSWORD) return null;
  const token = randomUUID();
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  return token;
}

export function isAuthorized(req: IncomingMessage): boolean {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return false;
  const token = header.slice("Bearer ".length);
  const expiresAt = sessions.get(token);
  if (!expiresAt) return false;
  if (expiresAt < Date.now()) {
    sessions.delete(token);
    return false;
  }
  return true;
}
