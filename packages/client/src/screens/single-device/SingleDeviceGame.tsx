import { useEffect, useRef, useState } from "react";
import {
  buildDeck,
  currentWord,
  endTurn,
  hasWinner,
  isTimeUp,
  markGuessed,
  markSkipped,
  startTurn,
  type TeamState,
  type TurnState,
  type Word,
} from "@kridens/core";
import { SERVER_HTTP_URL } from "../../config";
import { beep, vibrate } from "../../utils/feedback";
import GameSetup, { type SingleDeviceConfig } from "./GameSetup";
import TurnRecap from "./TurnRecap";
import GameOver from "./GameOver";

interface SingleDeviceGameProps {
  onExit: () => void;
}

type Stage = "setup" | "ready" | "playing" | "recap" | "gameover";
type Mark = "guessed" | "skipped";

/** No server needed: same buildDeck/turnEngine as multiplayer, run entirely on the client. */
export default function SingleDeviceGame({ onExit }: SingleDeviceGameProps) {
  const [pool, setPool] = useState<Word[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage>("setup");
  const [config, setConfig] = useState<SingleDeviceConfig | null>(null);
  const [teams, setTeams] = useState<TeamState[]>([]);
  const [currentTeamIndex, setCurrentTeamIndex] = useState(0);
  const [turn, setTurn] = useState<TurnState | null>(null);
  const [now, setNow] = useState(Date.now());
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const usedWordIds = useRef<Set<number>>(new Set());

  useEffect(() => {
    fetch(`${SERVER_HTTP_URL}/api/words`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<Word[]>;
      })
      .then(setPool)
      .catch((err) => setLoadError(String(err)));
  }, []);

  useEffect(() => {
    if (turn?.phase !== "in_progress") return;
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, [turn?.phase]);

  useEffect(() => {
    if (turn?.phase === "in_progress" && isTimeUp(turn, now)) {
      vibrate(200);
      beep();
      setTurn(endTurn(turn));
    }
  }, [now, turn]);

  useEffect(() => {
    if (stage === "playing" && turn?.phase === "ended") {
      setStage("recap");
    }
  }, [stage, turn?.phase]);

  const activeTeam = teams[currentTeamIndex];
  const word = turn ? currentWord(turn) : null;
  const secondsLeft = turn?.startedAt
    ? Math.max(0, Math.ceil((turn.turnDurationMs - (now - turn.startedAt)) / 1000))
    : null;

  function handleGameSetupStart(newConfig: SingleDeviceConfig) {
    setConfig(newConfig);
    setTeams(newConfig.teamNames.map((name, i) => ({ id: `team-${i}`, name, score: 0 })));
    setCurrentTeamIndex(0);
    setStage("ready");
  }

  function handleStartTurn() {
    if (!pool || !config) return;
    let available = pool.filter((w) => !usedWordIds.current.has(w.id));
    if (available.length < config.deckConfig.count) {
      usedWordIds.current.clear();
      available = pool;
    }
    const deck = buildDeck(available, config.deckConfig);
    deck.forEach((w) => usedWordIds.current.add(w.id));
    setTurn(startTurn(activeTeam.id, deck, config.turnDurationMs, Date.now()));
    setStage("playing");
  }

  function handleGuessed() {
    if (!turn) return;
    setTurn(markGuessed(turn));
  }

  function handleSkipped() {
    if (!turn) return;
    setTurn(markSkipped(turn));
  }

  function handleRecapConfirm(marks: Record<number, Mark>) {
    if (!turn || !config) return;
    const guessedCount = Object.values(marks).filter((m) => m === "guessed").length;
    const updatedTeams = teams.map((t) => (t.id === activeTeam.id ? { ...t, score: t.score + guessedCount } : t));
    setTeams(updatedTeams);

    const winner = hasWinner(updatedTeams, config.winScore);
    setTurn(null);
    if (winner) {
      setWinnerId(winner.id);
      setStage("gameover");
    } else {
      setCurrentTeamIndex((i) => (i + 1) % teams.length);
      setStage("ready");
    }
  }

  function handlePlayAgain() {
    setTeams((ts) => ts.map((t) => ({ ...t, score: 0 })));
    setCurrentTeamIndex(0);
    setWinnerId(null);
    setStage("ready");
  }

  function handleNewSetup() {
    setWinnerId(null);
    setStage("setup");
  }

  if (loadError) {
    return (
      <div className="screen">
        <p className="error">Не удалось загрузить словарь: {loadError}</p>
        <button onClick={onExit}>Назад</button>
      </div>
    );
  }

  if (!pool) {
    return <div className="screen">Загрузка словаря…</div>;
  }

  if (stage === "setup") {
    return (
      <GameSetup
        maxDeckSize={Math.min(30, pool.length)}
        initialConfig={config ?? undefined}
        onStart={handleGameSetupStart}
        onExit={onExit}
      />
    );
  }

  if (stage === "recap" && turn) {
    const words = turn.deck.slice(0, turn.currentIndex);
    const initialMarks: Record<number, Mark> = {};
    for (const id of turn.guessedWordIds) initialMarks[id] = "guessed";
    for (const id of turn.skippedWordIds) initialMarks[id] = "skipped";
    return <TurnRecap teamName={activeTeam.name} words={words} initialMarks={initialMarks} onConfirm={handleRecapConfirm} />;
  }

  if (stage === "gameover" && winnerId) {
    return (
      <GameOver
        teams={teams}
        winnerId={winnerId}
        onPlayAgain={handlePlayAgain}
        onNewSetup={handleNewSetup}
        onExit={onExit}
      />
    );
  }

  return (
    <div className="screen">
      <button className="exit" onClick={onExit}>
        ← Назад
      </button>
      <h2>Ход: {activeTeam.name}</h2>
      <Scoreboard teams={teams} />

      {stage === "ready" && (
        <button className="primary" onClick={handleStartTurn}>
          Начать ход
        </button>
      )}

      {stage === "playing" && turn?.phase === "in_progress" && (
        <div className="turn">
          <div className="timer">{secondsLeft}s</div>
          <div className="word" key={turn.currentIndex}>
            {word?.text}
          </div>
          <div className="actions">
            {config?.allowSkip && <button onClick={handleSkipped}>Пропустить</button>}
            <button className="primary" onClick={handleGuessed}>
              Угадано
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Scoreboard({ teams }: { teams: TeamState[] }) {
  return (
    <ul className="scoreboard">
      {teams.map((t) => (
        <li key={t.id}>
          {t.name}: {t.score}
        </li>
      ))}
    </ul>
  );
}
