import { useState } from "react";
import { scaledDeckConfig, TEAM_CODE_NAMES, type DeckConfig } from "@kridens/core";

const MAX_TEAMS = 10;

export interface SingleDeviceConfig {
  teamNames: string[];
  deckConfig: DeckConfig;
  limitWordsPerTurn: boolean;
  turnDurationMs: number;
  winScore: number;
  limitScore: boolean;
  allowSkip: boolean;
}

interface GameSetupProps {
  maxDeckSize: number;
  initialConfig?: SingleDeviceConfig;
  onStart: (config: SingleDeviceConfig) => void;
  onExit: () => void;
}

const REQUIRED_FIELD_MESSAGE = "Заполните это поле";

export default function GameSetup({ maxDeckSize, initialConfig, onStart, onExit }: GameSetupProps) {
  const [teamNames, setTeamNames] = useState<string[]>(initialConfig?.teamNames ?? TEAM_CODE_NAMES.slice(0, 2));
  const [invalidTeamIndexes, setInvalidTeamIndexes] = useState<Set<number>>(new Set());
  const [deckSize, setDeckSize] = useState(initialConfig?.deckConfig.count ?? Math.min(10, maxDeckSize));
  const [limitWordsPerTurn, setLimitWordsPerTurn] = useState(initialConfig?.limitWordsPerTurn ?? false);
  const [turnDurationSec, setTurnDurationSec] = useState((initialConfig?.turnDurationMs ?? 60_000) / 1000);
  const [winScore, setWinScore] = useState(initialConfig?.winScore ?? 20);
  const [limitScore, setLimitScore] = useState(initialConfig?.limitScore ?? false);
  const [allowSkip, setAllowSkip] = useState(initialConfig?.allowSkip ?? true);

  function updateTeamName(index: number, name: string) {
    setTeamNames((names) => names.map((n, i) => (i === index ? name : n)));
    setInvalidTeamIndexes((prev) => {
      if (!prev.has(index)) return prev;
      const next = new Set(prev);
      next.delete(index);
      return next;
    });
  }

  function addTeam() {
    setInvalidTeamIndexes(new Set());
    setTeamNames((names) => {
      if (names.length >= MAX_TEAMS) return names;
      const nextCityName = TEAM_CODE_NAMES.find((name) => !names.includes(name));
      return [...names, nextCityName ?? `Команда ${names.length + 1}`];
    });
  }

  function removeTeam(index: number) {
    setInvalidTeamIndexes(new Set());
    setTeamNames((names) => names.filter((_, i) => i !== index));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onStart({
      teamNames,
      deckConfig: scaledDeckConfig(clamp(deckSize, 4, maxDeckSize)),
      limitWordsPerTurn,
      turnDurationMs: clamp(turnDurationSec, 15, 180) * 1000,
      winScore: Math.max(5, winScore),
      limitScore,
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
            <input
              className={invalidTeamIndexes.has(i) ? "field-invalid" : undefined}
              value={name}
              onChange={(e) => {
                e.target.setCustomValidity("");
                updateTeamName(i, e.target.value);
              }}
              onInvalid={(e) => {
                e.currentTarget.setCustomValidity(REQUIRED_FIELD_MESSAGE);
                setInvalidTeamIndexes((prev) => new Set(prev).add(i));
              }}
              required
              maxLength={50}
            />
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
          Длительность хода, сек
          <input
            type="number"
            min={15}
            max={180}
            value={turnDurationSec}
            onChange={(e) => setTurnDurationSec(Number(e.target.value))}
          />
        </label>
        <label className="checkbox-row inline-field-row">
          <input
            type="checkbox"
            checked={limitWordsPerTurn}
            onChange={(e) => setLimitWordsPerTurn(e.target.checked)}
          />
          Максимум слов в ходе (макс. {maxDeckSize})
          <input
            type="number"
            min={4}
            max={maxDeckSize}
            value={deckSize}
            disabled={!limitWordsPerTurn}
            onChange={(e) => setDeckSize(Number(e.target.value))}
          />
        </label>
        <label className="checkbox-row inline-field-row">
          <input type="checkbox" checked={limitScore} onChange={(e) => setLimitScore(e.target.checked)} />
          Очков до победы
          <input
            type="number"
            min={5}
            value={winScore}
            disabled={!limitScore}
            onChange={(e) => setWinScore(Number(e.target.value))}
          />
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
