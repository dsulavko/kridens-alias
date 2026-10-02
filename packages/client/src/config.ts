export const SERVER_HTTP_URL = import.meta.env.VITE_SERVER_HTTP_URL ?? "http://localhost:8787";
export const SERVER_WS_URL = import.meta.env.VITE_SERVER_WS_URL ?? "ws://localhost:8787";

/** Shared by the single-device setup form and the multiplayer host rules panel. */
export const TURN_DURATION_OPTIONS_SEC = [15, 30, 45, 60, 90, 120, 180];
