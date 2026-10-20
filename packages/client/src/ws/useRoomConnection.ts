import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientMessage, PlayerInfo, RoomRules, ServerMessage, TeamState, TurnState } from "@kridens/core";
import { SERVER_WS_URL } from "../config";

const CLIENT_ID_KEY = "kridens-client-id";
const ACTIVE_ROOM_KEY = "kridens-active-room";
const RECONNECT_DELAYS_MS = [500, 1000, 2000, 4000, 8000];

/** One id per browser tab, stable across a dropped socket *and* a full page reload (e.g. iOS
 * Safari discarding a backgrounded tab) — this is what lets `rejoin_room` hand back the same
 * seat instead of the player showing up as a brand-new one at the back of the turn order. */
function getOrCreateClientId(): string {
  try {
    const existing = sessionStorage.getItem(CLIENT_ID_KEY);
    if (existing) return existing;
  } catch {
    // sessionStorage unavailable (private mode, etc) — fall through to a one-off id.
  }
  const id = crypto.randomUUID();
  try {
    sessionStorage.setItem(CLIENT_ID_KEY, id);
  } catch {
    // Nothing we can do — this tab just won't survive a reload mid-game.
  }
  return id;
}

function getStoredActiveRoom(): string | null {
  try {
    return sessionStorage.getItem(ACTIVE_ROOM_KEY);
  } catch {
    return null;
  }
}

function setStoredActiveRoom(code: string | null) {
  try {
    if (code) sessionStorage.setItem(ACTIVE_ROOM_KEY, code);
    else sessionStorage.removeItem(ACTIVE_ROOM_KEY);
  } catch {
    // Non-fatal — just means a reload won't auto-rejoin.
  }
}

interface RoomConnectionState {
  status: "connecting" | "open" | "closed";
  /** True once we've dropped a socket while still inside a room and are retrying — distinct from
   * the very first "connecting" before any room exists, so the UI can show "переподключение…"
   * instead of silently rendering stale room state. */
  reconnecting: boolean;
  roomCode: string | null;
  teams: TeamState[];
  players: PlayerInfo[];
  hostId: string | null;
  yourId: string | null;
  rules: RoomRules | null;
  started: boolean;
  activePlayerId: string | null;
  activePlayerConnected: boolean;
  turn: TurnState | null;
  winnerId: string | null;
  savedRoomGuid: string | null;
  error: string | null;
  roomClosed: boolean;
  /** True once the host has kicked this player — distinct from `roomClosed` (whole room gone),
   * since the room itself is still running for everyone else. */
  kicked: boolean;
  /** Unix ms timestamp when the room will be force-closed for an abandoned host — see
   * ServerMessage's `hostAbandonDeadline`. Null whenever there's no countdown running. */
  hostAbandonDeadline: number | null;
}

const initialState: RoomConnectionState = {
  status: "connecting",
  reconnecting: false,
  roomCode: null,
  teams: [],
  players: [],
  hostId: null,
  yourId: null,
  rules: null,
  started: false,
  activePlayerId: null,
  activePlayerConnected: true,
  turn: null,
  winnerId: null,
  savedRoomGuid: null,
  error: null,
  roomClosed: false,
  kicked: false,
  hostAbandonDeadline: null,
};

/** Server is the source of truth for room/turn state — this hook only renders what it broadcasts.
 * It also owns reconnection: a dropped socket (network blip, a backgrounded mobile tab) retries
 * with backoff and, once reopened, sends `rejoin_room` to reclaim the same seat rather than
 * silently leaving the player stuck in the turn order with a dead connection. */
export function useRoomConnection() {
  const socketRef = useRef<WebSocket | null>(null);
  const clientIdRef = useRef(getOrCreateClientId());
  /** Last room we were confirmed to be in (from `room_state`) — used both to persist across
   * reloads and to know what to `rejoin_room` into after a drop. Cleared on an intentional
   * leave/close so a reload afterwards lands on the home screen instead of retrying forever. */
  const roomCodeRef = useRef<string | null>(getStoredActiveRoom());
  const reconnectAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);
  const [state, setState] = useState<RoomConnectionState>(initialState);

  useEffect(() => {
    unmountedRef.current = false;

    function scheduleReconnect() {
      if (unmountedRef.current || !roomCodeRef.current) return;
      const delay = RECONNECT_DELAYS_MS[Math.min(reconnectAttemptRef.current, RECONNECT_DELAYS_MS.length - 1)];
      reconnectAttemptRef.current += 1;
      reconnectTimeoutRef.current = setTimeout(connect, delay);
    }

    function connect() {
      const socket = new WebSocket(SERVER_WS_URL);
      socketRef.current = socket;
      const rejoinCode = roomCodeRef.current;

      socket.onopen = () => {
        reconnectAttemptRef.current = 0;
        if (rejoinCode) {
          const message: ClientMessage = { type: "rejoin_room", roomCode: rejoinCode, clientId: clientIdRef.current };
          socket.send(JSON.stringify(message));
          setState((s) => ({ ...s, status: "open", reconnecting: true }));
        } else {
          setState((s) => ({ ...s, status: "open", reconnecting: false }));
        }
      };

      socket.onclose = () => {
        if (unmountedRef.current) return;
        setState((s) => ({ ...s, status: "closed", reconnecting: Boolean(roomCodeRef.current) }));
        scheduleReconnect();
      };

      socket.onmessage = (event) => {
        const message: ServerMessage = JSON.parse(event.data);
        if (message.type === "room_state") {
          roomCodeRef.current = message.roomCode;
          setStoredActiveRoom(message.roomCode);
          setState((s) => ({
            ...s,
            reconnecting: false,
            roomCode: message.roomCode,
            teams: message.teams,
            players: message.players,
            hostId: message.hostId,
            yourId: message.yourId,
            rules: message.rules,
            started: message.started,
            activePlayerId: message.activePlayerId,
            activePlayerConnected: message.activePlayerConnected,
            turn: message.turn,
            winnerId: message.winnerId,
            savedRoomGuid: message.savedRoomGuid,
            hostAbandonDeadline: message.hostAbandonDeadline,
            error: null,
          }));
        } else if (message.type === "error") {
          // A failed rejoin (room gone, or this clientId has no seat in it) means there's nothing
          // left to retry — fall back to the home/lobby screen instead of retrying forever.
          if (rejoinCode) {
            roomCodeRef.current = null;
            setStoredActiveRoom(null);
            setState((s) => ({ ...s, reconnecting: false, roomCode: null, error: message.message }));
          } else {
            setState((s) => ({ ...s, error: message.message }));
          }
        } else if (message.type === "room_closed") {
          roomCodeRef.current = null;
          setStoredActiveRoom(null);
          setState((s) => ({ ...s, roomClosed: true }));
        } else if (message.type === "kicked") {
          roomCodeRef.current = null;
          setStoredActiveRoom(null);
          setState((s) => ({ ...s, kicked: true }));
        }
      };
    }

    connect();

    return () => {
      unmountedRef.current = true;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      socketRef.current?.close();
    };
  }, []);

  const send = useCallback((message: ClientMessage) => {
    if (message.type === "leave_room" || message.type === "close_room") {
      roomCodeRef.current = null;
      setStoredActiveRoom(null);
    }
    socketRef.current?.send(JSON.stringify(message));
  }, []);

  return { ...state, clientId: clientIdRef.current, send };
}
