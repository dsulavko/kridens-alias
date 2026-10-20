import { useState } from "react";
import Home from "./screens/Home";
import SingleDeviceGame from "./screens/single-device/SingleDeviceGame";
import MultiplayerGame from "./screens/multiplayer/MultiplayerGame";
import AdminConsole from "./screens/admin/AdminConsole";
import "./App.css";

type Mode = "home" | "single" | "multiplayer";

function roomCodeFromUrl(): string | null {
  const code = new URLSearchParams(window.location.search).get("room");
  return code ? code.toUpperCase() : null;
}

/** A saved-room link (`?saved=<guid>`) is for the host to recreate a room that resumes a
 * persisted rules/word-history snapshot — distinct from `?room=` (join a currently-live room). */
function savedRoomGuidFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get("saved");
}

/** Set by useRoomConnection whenever we're confirmed to be seated in a room — checked here so
 * that a full page reload mid-game (iOS Safari discarding a backgrounded tab, not just dropping
 * its socket) still lands back in the game via `rejoin_room` instead of bouncing to the home
 * screen and forcing a fresh join. */
function hasStoredActiveRoom(): boolean {
  try {
    return Boolean(sessionStorage.getItem("kridens-active-room"));
  } catch {
    return false;
  }
}

function App() {
  const [initialJoinCode] = useState(roomCodeFromUrl);
  const [initialSavedRoomGuid] = useState(savedRoomGuidFromUrl);
  const [mode, setMode] = useState<Mode>(
    initialJoinCode || initialSavedRoomGuid || hasStoredActiveRoom() ? "multiplayer" : "home",
  );

  if (window.location.pathname === "/admin") return <AdminConsole />;

  if (mode === "single") return <SingleDeviceGame onExit={() => setMode("home")} />;
  if (mode === "multiplayer") {
    return (
      <MultiplayerGame
        initialJoinCode={initialJoinCode}
        initialSavedRoomGuid={initialSavedRoomGuid}
        onExit={() => setMode("home")}
      />
    );
  }
  return <Home onSelect={setMode} />;
}

export default App;
