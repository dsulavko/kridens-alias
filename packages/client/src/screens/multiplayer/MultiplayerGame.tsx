import { useEffect, useState } from "react";
import { currentWord } from "@kridens/core";
import { useRoomConnection } from "../../ws/useRoomConnection";

interface MultiplayerGameProps {
  onExit: () => void;
}

/** Server owns the deck and the turn clock — this component only renders what it broadcasts. */
export default function MultiplayerGame({ onExit }: MultiplayerGameProps) {
  const { status, roomCode, teams, turn, error, send } = useRoomConnection();
  const [playerName, setPlayerName] = useState("Игрок");
  const [teamNamesInput, setTeamNamesInput] = useState(["Команда 1", "Команда 2"]);
  const [joinCode, setJoinCode] = useState("");
  const [joinTeamIndex, setJoinTeamIndex] = useState(0);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (turn?.phase !== "in_progress") return;
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, [turn?.phase]);

  if (!roomCode) {
    return (
      <div className="screen">
        <button className="exit" onClick={onExit}>
          ← Назад
        </button>
        <h2>Мультиплеер</h2>
        {status !== "open" && <p>Подключение к серверу…</p>}
        {error && <p className="error">{error}</p>}

        <section>
          <h3>Создать комнату</h3>
          <input value={playerName} onChange={(e) => setPlayerName(e.target.value)} placeholder="Ваше имя" />
          {teamNamesInput.map((name, i) => (
            <input
              key={i}
              value={name}
              onChange={(e) =>
                setTeamNamesInput((names) => names.map((n, idx) => (idx === i ? e.target.value : n)))
              }
            />
          ))}
          <button
            className="primary"
            disabled={status !== "open"}
            onClick={() => send({ type: "create_room", playerName, teamNames: teamNamesInput })}
          >
            Создать
          </button>
        </section>

        <section>
          <h3>Присоединиться</h3>
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="Код комнаты"
          />
          <select value={joinTeamIndex} onChange={(e) => setJoinTeamIndex(Number(e.target.value))}>
            <option value={0}>Команда 1</option>
            <option value={1}>Команда 2</option>
          </select>
          <button
            className="primary"
            disabled={status !== "open"}
            onClick={() =>
              send({ type: "join_room", roomCode: joinCode, playerName, teamId: `team-${joinTeamIndex}` })
            }
          >
            Войти
          </button>
        </section>
      </div>
    );
  }

  const word = turn ? currentWord(turn) : null;
  const secondsLeft = turn?.startedAt
    ? Math.max(0, Math.ceil((turn.turnDurationMs - (now - turn.startedAt)) / 1000))
    : null;

  return (
    <div className="screen">
      <button className="exit" onClick={onExit}>
        ← Назад
      </button>
      <h2>Комната {roomCode}</h2>
      <ul className="scoreboard">
        {teams.map((t) => (
          <li key={t.id}>
            {t.name}: {t.score}
          </li>
        ))}
      </ul>

      {(!turn || turn.phase === "ended") && (
        <button className="primary" onClick={() => send({ type: "start_turn" })}>
          Начать ход
        </button>
      )}

      {turn?.phase === "in_progress" && (
        <div className="turn">
          <div className="timer">{secondsLeft}s</div>
          <div className="word" key={turn.currentIndex}>
            {word?.text}
          </div>
          <div className="actions">
            <button onClick={() => send({ type: "mark_skipped" })}>Пропустить</button>
            <button className="primary" onClick={() => send({ type: "mark_guessed" })}>
              Угадано
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
