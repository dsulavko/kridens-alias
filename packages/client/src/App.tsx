import { useState } from "react";
import Home from "./screens/Home";
import SingleDeviceGame from "./screens/single-device/SingleDeviceGame";
import MultiplayerGame from "./screens/multiplayer/MultiplayerGame";
import "./App.css";

type Mode = "home" | "single" | "multiplayer";

function roomCodeFromUrl(): string | null {
  const code = new URLSearchParams(window.location.search).get("room");
  return code ? code.toUpperCase() : null;
}

function App() {
  const [initialJoinCode] = useState(roomCodeFromUrl);
  const [mode, setMode] = useState<Mode>(initialJoinCode ? "multiplayer" : "home");

  if (mode === "single") return <SingleDeviceGame onExit={() => setMode("home")} />;
  if (mode === "multiplayer") {
    return <MultiplayerGame initialJoinCode={initialJoinCode} onExit={() => setMode("home")} />;
  }
  return <Home onSelect={setMode} />;
}

export default App;
