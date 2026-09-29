import type { Server as HttpServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import type { ClientMessage, ServerMessage } from "@kridens/core";
import { getApprovedWords } from "../db/wordsRepo.js";
import { RoomManager } from "../rooms/roomManager.js";

interface SocketContext {
  roomCode: string | null;
  playerId: string;
}

export function attachWebSocketServer(httpServer: HttpServer): RoomManager {
  const wss = new WebSocketServer({ server: httpServer });
  const roomManager = new RoomManager();
  const contexts = new WeakMap<WebSocket, SocketContext>();

  wss.on("connection", (socket) => {
    contexts.set(socket, { roomCode: null, playerId: crypto.randomUUID() });

    socket.on("message", (raw) => {
      let message: ClientMessage;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return sendError(socket, "Malformed message");
      }
      handleMessage(socket, message, roomManager, contexts);
    });

    socket.on("close", () => {
      const ctx = contexts.get(socket);
      if (ctx?.roomCode) {
        roomManager.getRoom(ctx.roomCode)?.removeSocket(socket);
      }
    });
  });

  return roomManager;
}

function handleMessage(
  socket: WebSocket,
  message: ClientMessage,
  roomManager: RoomManager,
  contexts: WeakMap<WebSocket, SocketContext>,
) {
  const ctx = contexts.get(socket);
  if (!ctx) return;

  switch (message.type) {
    case "create_room": {
      const pool = getApprovedWords();
      const room = roomManager.createRoom(message.teamNames, pool);
      const firstTeam = room.getTeams()[0];
      room.addPlayer({ id: ctx.playerId, name: message.playerName, teamId: firstTeam.id, socket });
      ctx.roomCode = room.code;
      room.broadcast();
      return;
    }
    case "join_room": {
      const room = roomManager.getRoom(message.roomCode);
      if (!room) return sendError(socket, "Room not found");
      if (!room.hasTeam(message.teamId)) return sendError(socket, "Unknown team");

      room.addPlayer({ id: ctx.playerId, name: message.playerName, teamId: message.teamId, socket });
      ctx.roomCode = room.code;
      room.broadcast();
      return;
    }
    case "start_turn":
      return withRoom(ctx, roomManager, socket, (room) => room.startTurn());
    case "mark_guessed":
      return withRoom(ctx, roomManager, socket, (room) => room.markGuessed());
    case "mark_skipped":
      return withRoom(ctx, roomManager, socket, (room) => room.markSkipped());
    case "end_turn":
      return withRoom(ctx, roomManager, socket, (room) => room.endTurn());
  }
}

function withRoom(
  ctx: SocketContext,
  roomManager: RoomManager,
  socket: WebSocket,
  fn: (room: NonNullable<ReturnType<RoomManager["getRoom"]>>) => void,
) {
  if (!ctx.roomCode) return sendError(socket, "Not in a room");
  const room = roomManager.getRoom(ctx.roomCode);
  if (!room) return sendError(socket, "Room not found");
  fn(room);
}

function sendError(socket: WebSocket, text: string) {
  const message: ServerMessage = { type: "error", message: text };
  socket.send(JSON.stringify(message));
}
