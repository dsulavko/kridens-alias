import { useEffect, useState } from "react";
import { currentWord } from "@kridens/core";
import { SERVER_HTTP_URL } from "../../config";
import { useRoomConnection } from "../../ws/useRoomConnection";
import RoomLobby from "./RoomLobby";

interface MultiplayerGameProps {
  initialJoinCode?: string | null;
  onExit: () => void;
}

type LobbyMode = "choice" | "create" | "join";

/** Server owns the deck and the turn clock — this component only renders what it broadcasts. */
export default function MultiplayerGame({ initialJoinCode, onExit }: MultiplayerGameProps) {
  const {
    status,
    roomCode,
    teams,
    players,
    hostId,
    yourId,
    rules,
    started,
    activePlayerId,
    turn,
    winnerId,
    error,
    send,
  } = useRoomConnection();
  const viaLink = Boolean(initialJoinCode);
  const [lobbyMode, setLobbyMode] = useState<LobbyMode>(initialJoinCode ? "join" : "choice");
  const [playerName, setPlayerName] = useState("");
  const [joinCode, setJoinCode] = useState(initialJoinCode ?? "");
  const [joinTeams, setJoinTeams] = useState<Array<{ id: string; name: string }> | null>(null);
  const [joinTeamId, setJoinTeamId] = useState("");
  const [joinLookupError, setJoinLookupError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (turn?.phase !== "in_progress") return;
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, [turn?.phase]);

  useEffect(() => {
    if (joinCode.length !== 4) {
      setJoinTeams(null);
      setJoinLookupError(null);
      return;
    }
    let cancelled = false;
    fetch(`${SERVER_HTTP_URL}/api/rooms/${joinCode}`)
      .then((res) => {
        if (!res.ok) throw new Error("not found");
        return res.json() as Promise<{ teams: Array<{ id: string; name: string }> }>;
      })
      .then((data) => {
        if (cancelled) return;
        setJoinTeams(data.teams);
        setJoinTeamId(data.teams[0]?.id ?? "");
        setJoinLookupError(null);
      })
      .catch(() => {
        if (cancelled) return;
        setJoinTeams(null);
        setJoinLookupError("Комната не найдена");
      });
    return () => {
      cancelled = true;
    };
  }, [joinCode]);

  if (!roomCode) {
    return (
      <div className="screen">
        {!viaLink && (
          <button className="exit" onClick={lobbyMode === "choice" ? onExit : () => setLobbyMode("choice")}>
            ← Назад
          </button>
        )}
        <h2>Мультиплеер</h2>
        {status !== "open" && <p>Подключение к серверу…</p>}
        {error && <p className="error">{error}</p>}

        {lobbyMode === "choice" && (
          <section>
            <button className="primary" onClick={() => setLobbyMode("create")}>
              Создать комнату
            </button>
            <button className="primary" onClick={() => setLobbyMode("join")}>
              Присоединиться к комнате
            </button>
          </section>
        )}

        {lobbyMode === "create" && (
          <section>
            <h3>Создать комнату</h3>
            <input
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Ваше имя"
              required
              maxLength={50}
            />
            <button
              className="primary"
              disabled={status !== "open" || !playerName.trim()}
              onClick={() => send({ type: "create_room", playerName })}
            >
              Продолжить
            </button>
          </section>
        )}

        {lobbyMode === "join" && (
          <section>
            <h3>Присоединиться</h3>
            <input
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Ваше имя"
              required
              maxLength={50}
            />
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="Код комнаты"
              maxLength={4}
              disabled={viaLink}
            />
            {joinLookupError && <p className="error">{joinLookupError}</p>}
            {joinTeams && (
              <select value={joinTeamId} onChange={(e) => setJoinTeamId(e.target.value)}>
                {joinTeams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}
            <button
              className="primary"
              disabled={status !== "open" || !joinTeams || !playerName.trim()}
              onClick={() => send({ type: "join_room", roomCode: joinCode, playerName, teamId: joinTeamId })}
            >
              Войти
            </button>
          </section>
        )}
      </div>
    );
  }

  if (!rules) {
    return <div className="screen">Загрузка комнаты…</div>;
  }

  if (!started) {
    return (
      <RoomLobby
        roomCode={roomCode}
        teams={teams}
        players={players}
        rules={rules}
        hostId={hostId ?? ""}
        isHost={yourId === hostId}
        onUpdateRules={(newRules) => send({ type: "update_rules", rules: newRules })}
        onAssignPlayer={(playerId, teamId) => send({ type: "assign_player", playerId, teamId })}
        onShuffleTeams={() => send({ type: "shuffle_teams" })}
        onStartGame={() => send({ type: "start_turn" })}
        onExit={onExit}
      />
    );
  }

  if (winnerId) {
    const winner = teams.find((t) => t.id === winnerId);
    const sorted = [...teams].sort((a, b) => b.score - a.score);
    const isHost = yourId === hostId;
    return (
      <div className="screen">
        <h2>🏆 Победила команда «{winner?.name}»!</h2>
        <ul className="scoreboard gameover-score">
          {sorted.map((t) => (
            <li key={t.id}>
              {t.name}: {t.score}
            </li>
          ))}
        </ul>
        {isHost ? (
          <>
            <button className="primary" onClick={() => send({ type: "play_again" })}>
              Играть снова
            </button>
            <button onClick={() => send({ type: "new_setup" })}>Новые настройки</button>
          </>
        ) : (
          <p>Ожидаем хоста…</p>
        )}
        <button className="exit" onClick={onExit}>
          В меню
        </button>
      </div>
    );
  }

  const word = turn ? currentWord(turn) : null;
  const secondsLeft = turn?.startedAt
    ? Math.max(0, Math.ceil((turn.turnDurationMs - (now - turn.startedAt)) / 1000))
    : null;

  const you = players.find((p) => p.id === yourId);
  const activePlayer = players.find((p) => p.id === activePlayerId);
  const isActive = Boolean(yourId) && yourId === activePlayerId;
  const isTeammate = !isActive && Boolean(activePlayer && you && activePlayer.teamId === you.teamId);

  return (
    <div className="screen">
      <ul className="scoreboard">
        {teams.map((t) => (
          <li key={t.id}>
            {t.name}: {t.score}
          </li>
        ))}
      </ul>

      {!turn &&
        (isActive ? (
          <button className="primary" onClick={() => send({ type: "start_turn" })}>
            Начать ход
          </button>
        ) : (
          <p>Ход: {activePlayer?.name ?? "…"}</p>
        ))}

      {turn?.phase === "ended" && (
        <div className="turn">
          <ul className="recap-list">
            {turn.deck.slice(0, turn.currentIndex).map((w) => (
              <li
                key={w.id}
                className={`recap-item ${turn.guessedWordIds.includes(w.id) ? "guessed" : "skipped"}${
                  isActive ? "" : " readonly"
                }`}
                onClick={isActive ? () => send({ type: "toggle_word", wordId: w.id }) : undefined}
              >
                {w.text}
              </li>
            ))}
          </ul>
          {isActive ? (
            <button className="primary" onClick={() => send({ type: "next_turn" })}>
              Передать ход
            </button>
          ) : (
            <p>{activePlayer?.name} проверяет ход</p>
          )}
        </div>
      )}

      {turn?.phase === "in_progress" && isActive && (
        <div className="turn">
          <div className="timer">{secondsLeft}s</div>
          <div className="word" key={turn.currentIndex}>
            {word?.text}
          </div>
          <div className="actions">
            {rules?.allowSkip && <button onClick={() => send({ type: "mark_skipped" })}>Пропустить</button>}
            <button className="primary" onClick={() => send({ type: "mark_guessed" })}>
              Угадано
            </button>
          </div>
        </div>
      )}

      {turn?.phase === "in_progress" && isTeammate && (
        <div className="turn">
          <div className="timer">{secondsLeft}s</div>
          <p>{activePlayer?.name} объясняет слово</p>
        </div>
      )}

      {turn?.phase === "in_progress" && !isActive && !isTeammate && (
        <div className="turn">
          <div className="timer">{secondsLeft}s</div>
          <div className="word" key={turn.currentIndex}>
            {word?.text}
          </div>
        </div>
      )}
    </div>
  );
}
