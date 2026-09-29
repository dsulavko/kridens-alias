import { useState } from "react";
import Home from "./screens/Home";
import SingleDeviceGame from "./screens/single-device/SingleDeviceGame";
import MultiplayerGame from "./screens/multiplayer/MultiplayerGame";
import "./App.css";

type Mode = "home" | "single" | "multiplayer";

function App() {
  const [mode, setMode] = useState<Mode>("home");

  if (mode === "single") return <SingleDeviceGame onExit={() => setMode("home")} />;
  if (mode === "multiplayer") return <MultiplayerGame onExit={() => setMode("home")} />;
  return <Home onSelect={setMode} />;
}

export default App;
