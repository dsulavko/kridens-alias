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

function App() {
  const [initialJoinCode] = useState(roomCodeFromUrl);
  const [initialSavedRoomGuid] = useState(savedRoomGuidFromUrl);
  const [mode, setMode] = useState<Mode>(initialJoinCode || initialSavedRoomGuid ? "multiplayer" : "home");

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
