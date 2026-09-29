import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientMessage, ServerMessage, TeamState, TurnState } from "@kridens/core";
import { SERVER_WS_URL } from "../config";

interface RoomConnectionState {
  status: "connecting" | "open" | "closed";
  roomCode: string | null;
  teams: TeamState[];
  turn: TurnState | null;
  error: string | null;
}

/** Server is the source of truth for room/turn state — this hook only renders what it broadcasts. */
export function useRoomConnection() {
  const socketRef = useRef<WebSocket | null>(null);
  const [state, setState] = useState<RoomConnectionState>({
    status: "connecting",
    roomCode: null,
    teams: [],
    turn: null,
    error: null,
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
          turn: message.turn,
          error: null,
        }));
      } else if (message.type === "error") {
        setState((s) => ({ ...s, error: message.message }));
      }
    };

    return () => socket.close();
  }, []);

  const send = useCallback((message: ClientMessage) => {
    socketRef.current?.send(JSON.stringify(message));
  }, []);

  return { ...state, send };
}
