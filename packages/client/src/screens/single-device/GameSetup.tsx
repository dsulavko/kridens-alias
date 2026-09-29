import { useState } from "react";
import { scaledDeckConfig, type DeckConfig } from "@kridens/core";

const MAX_TEAMS = 10;

export interface SingleDeviceConfig {
  teamNames: string[];
  deckConfig: DeckConfig;
  turnDurationMs: number;
  winScore: number;
  allowSkip: boolean;
}

interface GameSetupProps {
  maxDeckSize: number;
  initialConfig?: SingleDeviceConfig;
  onStart: (config: SingleDeviceConfig) => void;
  onExit: () => void;
}

export default function GameSetup({ maxDeckSize, initialConfig, onStart, onExit }: GameSetupProps) {
  const [teamNames, setTeamNames] = useState<string[]>(initialConfig?.teamNames ?? ["Команда 1", "Команда 2"]);
  const [deckSize, setDeckSize] = useState(initialConfig?.deckConfig.count ?? Math.min(10, maxDeckSize));
  const [turnDurationSec, setTurnDurationSec] = useState((initialConfig?.turnDurationMs ?? 60_000) / 1000);
  const [winScore, setWinScore] = useState(initialConfig?.winScore ?? 20);
  const [allowSkip, setAllowSkip] = useState(initialConfig?.allowSkip ?? true);

  function updateTeamName(index: number, name: string) {
    setTeamNames((names) => names.map((n, i) => (i === index ? name : n)));
  }

  function addTeam() {
    setTeamNames((names) => (names.length >= MAX_TEAMS ? names : [...names, `Команда ${names.length + 1}`]));
  }

  function removeTeam(index: number) {
    setTeamNames((names) => names.filter((_, i) => i !== index));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onStart({
      teamNames,
      deckConfig: scaledDeckConfig(clamp(deckSize, 4, maxDeckSize)),
      turnDurationMs: clamp(turnDurationSec, 15, 180) * 1000,
      winScore: Math.max(5, winScore),
      allowSkip,
    });
  }

  return (
    <form className="screen setup-form" onSubmit={handleSubmit}>
      <button type="button" className="exit" onClick={onExit}>
        ← Назад
      </button>
      <h2>Настройка игры</h2>

      <section>
        <h3>Команды</h3>
        {teamNames.map((name, i) => (
          <div className="team-row" key={i}>
            <input value={name} onChange={(e) => updateTeamName(i, e.target.value)} required />
            {teamNames.length > 2 && (
              <button type="button" className="icon-btn" onClick={() => removeTeam(i)} aria-label="Удалить команду">
                ×
              </button>
            )}
          </div>
        ))}
        {teamNames.length < MAX_TEAMS && (
          <button type="button" onClick={addTeam}>
            + Добавить команду
          </button>
        )}
      </section>

      <section>
        <h3>Правила</h3>
        <label>
          Слов в ходе (макс. {maxDeckSize})
          <input
            type="number"
            min={4}
            max={maxDeckSize}
            value={deckSize}
            onChange={(e) => setDeckSize(Number(e.target.value))}
          />
        </label>
        <label>
          Длительность хода, сек
          <input
            type="number"
            min={15}
            max={180}
            value={turnDurationSec}
            onChange={(e) => setTurnDurationSec(Number(e.target.value))}
          />
        </label>
        <label>
          Очков до победы
          <input type="number" min={5} value={winScore} onChange={(e) => setWinScore(Number(e.target.value))} />
        </label>
        <label className="checkbox-row">
          <input type="checkbox" checked={allowSkip} onChange={(e) => setAllowSkip(e.target.checked)} />
          Можно пропускать слова
        </label>
      </section>

      <button type="submit" className="primary">
        Начать игру
      </button>
    </form>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
