import type { Server as HttpServer } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import type { ClientMessage, ServerMessage } from "@kridens/core";
import { getApprovedWordsForCollection } from "../db/collectionsRepo.js";
import { getSavedRoomRules, getSavedRoomUsedWordIds } from "../db/savedRoomsRepo.js";
import { getApprovedWords } from "../db/wordsRepo.js";
import { RoomManager } from "../rooms/roomManager.js";
import type { RoomOptions } from "../rooms/room.js";

interface SocketContext {
  roomCode: string | null;
  /** The stable, client-chosen id for this player (kept in sessionStorage client-side so a
   * reconnect can claim the same seat via `rejoin_room`) — set once their first message
   * (create_room/join_room/rejoin_room) arrives, unlike the old per-socket random id. */
  playerId: string | null;
  /** Flipped by the pong handler, checked and reset by the heartbeat sweep below — standard `ws`
   * dead-connection detection. Without this, a connection that drops without a clean TCP
   * close (phone loses signal, wifi cuts out mid-session) can sit in limbo for a long time
   * before the OS-level timeout ever fires `close`, during which the room thinks the host (or
   * any player) is still connected. */
  alive: boolean;
}

const HEARTBEAT_INTERVAL_MS = 15_000;

export function attachWebSocketServer(httpServer: HttpServer, roomManager: RoomManager): void {
  const wss = new WebSocketServer({ server: httpServer });
  const contexts = new WeakMap<WebSocket, SocketContext>();

  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      const ctx = contexts.get(socket);
      if (!ctx) continue;
      if (!ctx.alive) {
        socket.terminate();
        continue;
      }
      ctx.alive = false;
      socket.ping();
    }
  }, HEARTBEAT_INTERVAL_MS);
  wss.on("close", () => clearInterval(heartbeat));

  wss.on("connection", (socket) => {
    contexts.set(socket, { roomCode: null, playerId: null, alive: true });
    socket.on("pong", () => {
      const ctx = contexts.get(socket);
      if (ctx) ctx.alive = true;
    });

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
      if (!isValidClientId(message.clientId)) return sendError(socket, "Malformed message");
      let pool = getApprovedWords();
      const options: RoomOptions = {};
      // A link built from a saved room — restore its rules and resume its word history, falling
      // back to an ordinary fresh room if the GUID is stale/unknown.
      if (message.savedRoomGuid) {
        const initialRules = getSavedRoomRules(message.savedRoomGuid);
        if (initialRules) {
          options.savedRoomGuid = message.savedRoomGuid;
          options.initialRules = initialRules;
          options.initialUsedWordIds = getSavedRoomUsedWordIds(message.savedRoomGuid);
          // If the pinned collection has since gone empty, fall back to the full pool rather than
          // handing the room a wordPool that would crash deck building on the first turn — there's
          // no host connected yet at this point to show an error to.
          if (initialRules.collectionId) {
            const scoped = getApprovedWordsForCollection(initialRules.collectionId);
            if (scoped.length > 0) pool = scoped;
          }
        }
      }
      const room = roomManager.createRoom(message.clientId, pool, options);
      const firstTeam = room.getTeams()[0];
      room.addPlayer({ id: message.clientId, name: message.playerName, teamId: firstTeam.id, socket });
      ctx.roomCode = room.code;
      ctx.playerId = message.clientId;
      room.broadcast();
      return;
    }
    case "join_room": {
      if (!isValidClientId(message.clientId)) return sendError(socket, "Malformed message");
      const room = roomManager.getRoom(message.roomCode);
      if (!room) return sendError(socket, "Room not found");
      if (room.hasPlayer(message.clientId)) return sendError(socket, "Already in this room");
      if (room.hasPlayerName(message.playerName)) return sendError(socket, "Это имя уже занято в комнате");

      room.addPlayer({ id: message.clientId, name: message.playerName, teamId: room.pickBalancedTeamId(), socket });
      ctx.roomCode = room.code;
      ctx.playerId = message.clientId;
      room.broadcast();
      return;
    }
    case "rejoin_room": {
      if (!isValidClientId(message.clientId)) return sendError(socket, "Malformed message");
      const room = roomManager.getRoom(message.roomCode);
      if (!room || !room.reconnectPlayer(message.clientId, socket)) {
        return sendError(socket, "Room not found");
      }
      ctx.roomCode = room.code;
      ctx.playerId = message.clientId;
      return;
    }
    case "update_rules":
      return withRoom(ctx, roomManager, socket, (room, playerId) => {
        if (!room.canUpdateRules(playerId)) return;
        if (message.rules.collectionId !== room.getRules().collectionId) {
          const pool = message.rules.collectionId
            ? getApprovedWordsForCollection(message.rules.collectionId)
            : getApprovedWords();
          // Reject the change outright rather than handing the room an empty pool — that would
          // crash deck building on the very next turn.
          if (pool.length === 0) return sendError(socket, "В выбранной коллекции нет слов");
          room.setWordPool(pool);
        }
        room.updateRules(message.rules, playerId);
      });
    case "assign_player":
      return withRoom(ctx, roomManager, socket, (room, playerId) =>
        room.assignPlayer(message.playerId, message.teamId, playerId),
      );
    case "remove_from_team":
      return withRoom(ctx, roomManager, socket, (room, playerId) =>
        room.removeFromTeam(message.playerId, playerId),
      );
    case "reorder_team_player":
      return withRoom(ctx, roomManager, socket, (room, playerId) =>
        room.reorderTeamPlayer(message.playerId, message.direction, playerId),
      );
    case "kick_player":
      return withRoom(ctx, roomManager, socket, (room, playerId) => room.kickPlayer(message.playerId, playerId));
    case "shuffle_teams":
      return withRoom(ctx, roomManager, socket, (room, playerId) => room.shuffleTeams(playerId));
    case "start_game":
      return withRoom(ctx, roomManager, socket, (room, playerId) => room.startGame(playerId));
    case "save_room":
      return withRoom(ctx, roomManager, socket, (room, playerId) => room.saveRoom(playerId));
    case "start_turn":
      return withRoom(ctx, roomManager, socket, (room, playerId) => room.startTurn(playerId));
    case "mark_guessed":
      return withRoom(ctx, roomManager, socket, (room, playerId) => room.markGuessed(playerId));
    case "mark_skipped":
      return withRoom(ctx, roomManager, socket, (room, playerId) => room.markSkipped(playerId));
    case "end_turn":
      return withRoom(ctx, roomManager, socket, (room) => room.endTurn());
    case "pause_turn":
      return withRoom(ctx, roomManager, socket, (room, playerId) => room.pauseTurn(playerId));
    case "resume_turn":
      return withRoom(ctx, roomManager, socket, (room, playerId) => room.resumeTurn(playerId));
    case "toggle_word":
      return withRoom(ctx, roomManager, socket, (room, playerId) => room.toggleWordMark(message.wordId, playerId));
    case "next_turn":
      return withRoom(ctx, roomManager, socket, (room, playerId) => room.nextTurn(playerId));
    case "skip_disconnected_turn":
      return withRoom(ctx, roomManager, socket, (room, playerId) => room.skipDisconnectedTurn(playerId));
    case "play_again":
      return withRoom(ctx, roomManager, socket, (room, playerId) => room.playAgain(playerId));
    case "new_setup":
      return withRoom(ctx, roomManager, socket, (room, playerId) => room.newSetup(playerId));
    case "leave_room":
      return withRoom(ctx, roomManager, socket, (room, playerId) => {
        // The host has no "leave" option in the UI (only "close room"), but if this ever fires
        // for them anyway, treat it as closing the room rather than leaving it headless with
        // hostId pointing at someone no longer present.
        if (playerId === room.hostId) {
          room.close(playerId);
          roomManager.deleteRoom(room.code);
        } else {
          room.removePlayer(playerId);
        }
        ctx.roomCode = null;
      });
    case "close_room":
      return withRoom(ctx, roomManager, socket, (room, playerId) => {
        if (!room.close(playerId)) return;
        roomManager.deleteRoom(room.code);
        ctx.roomCode = null;
      });
  }
}

function isValidClientId(id: unknown): id is string {
  return typeof id === "string" && id.length > 0 && id.length <= 100;
}

function withRoom(
  ctx: SocketContext,
  roomManager: RoomManager,
  socket: WebSocket,
  fn: (room: NonNullable<ReturnType<RoomManager["getRoom"]>>, playerId: string) => void,
) {
  if (!ctx.roomCode || !ctx.playerId) return sendError(socket, "Not in a room");
  const room = roomManager.getRoom(ctx.roomCode);
  if (!room) return sendError(socket, "Room not found");
  fn(room, ctx.playerId);
}

function sendError(socket: WebSocket, text: string) {
  const message: ServerMessage = { type: "error", message: text };
  socket.send(JSON.stringify(message));
}
