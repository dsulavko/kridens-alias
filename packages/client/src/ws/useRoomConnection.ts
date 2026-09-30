import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientMessage, PlayerInfo, RoomRules, ServerMessage, TeamState, TurnState } from "@kridens/core";
import { SERVER_WS_URL } from "../config";

interface RoomConnectionState {
  status: "connecting" | "open" | "closed";
  roomCode: string | null;
  teams: TeamState[];
  players: PlayerInfo[];
  hostId: string | null;
  yourId: string | null;
  rules: RoomRules | null;
  started: boolean;
  activePlayerId: string | null;
  turn: TurnState | null;
  winnerId: string | null;
  error: string | null;
  roomClosed: boolean;
}

/** Server is the source of truth for room/turn state — this hook only renders what it broadcasts. */
export function useRoomConnection() {
  const socketRef = useRef<WebSocket | null>(null);
  const [state, setState] = useState<RoomConnectionState>({
    status: "connecting",
    roomCode: null,
    teams: [],
    players: [],
    hostId: null,
    yourId: null,
    rules: null,
    started: false,
    activePlayerId: null,
    turn: null,
    winnerId: null,
    error: null,
    roomClosed: false,
  });

  useEffect(() => {
    const socket = new WebSocket(SERVER_WS_URL);
    socketRef.current = socket;

    socket.onopen = () => setState((s) => ({ ...s, status: "open" }));
    socket.onclose = () => setState((s) => ({ ...s, status: "closed" }));
    socket.onmessage = (event) => {
      const message: ServerMessage = JSON.parse(event.data);
      if (message.type === "room_state") {
        setState((s) => ({
          ...s,
          roomCode: message.roomCode,
          teams: message.teams,
          players: message.players,
          hostId: message.hostId,
          yourId: message.yourId,
          rules: message.rules,
          started: message.started,
          activePlayerId: message.activePlayerId,
          turn: message.turn,
          winnerId: message.winnerId,
          error: null,
        }));
      } else if (message.type === "error") {
        setState((s) => ({ ...s, error: message.message }));
      } else if (message.type === "room_closed") {
        setState((s) => ({ ...s, roomClosed: true }));
      }
    };

    return () => socket.close();
  }, []);

  const send = useCallback((message: ClientMessage) => {
    socketRef.current?.send(JSON.stringify(message));
  }, []);

  return { ...state, send };
}
