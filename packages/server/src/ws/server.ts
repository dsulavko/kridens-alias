import type { Server as HttpServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import type { ClientMessage, ServerMessage } from "@kridens/core";
import { getApprovedWords } from "../db/wordsRepo.js";
import { RoomManager } from "../rooms/roomManager.js";

interface SocketContext {
  roomCode: string | null;
  playerId: string;
}

export function attachWebSocketServer(httpServer: HttpServer, roomManager: RoomManager): void {
  const wss = new WebSocketServer({ server: httpServer });
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
      const room = roomManager.createRoom(ctx.playerId, pool);
      const firstTeam = room.getTeams()[0];
      room.addPlayer({ id: ctx.playerId, name: message.playerName, teamId: firstTeam.id, socket });
      ctx.roomCode = room.code;
      room.broadcast();
      return;
    }
    case "join_room": {
      const room = roomManager.getRoom(message.roomCode);
      if (!room) return sendError(socket, "Room not found");
      if (room.hasPlayerName(message.playerName)) return sendError(socket, "Это имя уже занято в комнате");

      room.addPlayer({ id: ctx.playerId, name: message.playerName, teamId: room.pickBalancedTeamId(), socket });
      ctx.roomCode = room.code;
      room.broadcast();
      return;
    }
    case "update_rules":
      return withRoom(ctx, roomManager, socket, (room) => room.updateRules(message.rules, ctx.playerId));
    case "assign_player":
      return withRoom(ctx, roomManager, socket, (room) =>
        room.assignPlayer(message.playerId, message.teamId, ctx.playerId),
      );
    case "shuffle_teams":
      return withRoom(ctx, roomManager, socket, (room) => room.shuffleTeams(ctx.playerId));
    case "start_turn":
      return withRoom(ctx, roomManager, socket, (room) => room.startTurn(ctx.playerId));
    case "mark_guessed":
      return withRoom(ctx, roomManager, socket, (room) => room.markGuessed(ctx.playerId));
    case "mark_skipped":
      return withRoom(ctx, roomManager, socket, (room) => room.markSkipped(ctx.playerId));
    case "end_turn":
      return withRoom(ctx, roomManager, socket, (room) => room.endTurn());
    case "toggle_word":
      return withRoom(ctx, roomManager, socket, (room) => room.toggleWordMark(message.wordId, ctx.playerId));
    case "next_turn":
      return withRoom(ctx, roomManager, socket, (room) => room.nextTurn(ctx.playerId));
    case "play_again":
      return withRoom(ctx, roomManager, socket, (room) => room.playAgain(ctx.playerId));
    case "new_setup":
      return withRoom(ctx, roomManager, socket, (room) => room.newSetup(ctx.playerId));
    case "leave_room":
      return withRoom(ctx, roomManager, socket, (room) => {
        room.removePlayer(ctx.playerId);
        ctx.roomCode = null;
      });
    case "close_room":
      return withRoom(ctx, roomManager, socket, (room) => {
        if (!room.close(ctx.playerId)) return;
        roomManager.deleteRoom(room.code);
        ctx.roomCode = null;
      });
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
