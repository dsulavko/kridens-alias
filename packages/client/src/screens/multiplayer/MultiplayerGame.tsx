import { useEffect, useLayoutEffect, useState } from "react";
import { currentWord } from "@kridens/core";
import { SERVER_HTTP_URL } from "../../config";
import { useRoomConnection } from "../../ws/useRoomConnection";
import Modal from "../../components/Modal";
import HostMenu from "./HostMenu";
import RoomLobby from "./RoomLobby";

interface MultiplayerGameProps {
  initialJoinCode?: string | null;
  initialSavedRoomGuid?: string | null;
  onExit: () => void;
}

type LobbyMode = "choice" | "create" | "join";

/** Server owns the deck and the turn clock — this component only renders what it broadcasts. */
export default function MultiplayerGame({ initialJoinCode, initialSavedRoomGuid, onExit }: MultiplayerGameProps) {
  const {
    status,
    reconnecting,
    roomCode,
    teams,
    players,
    hostId,
    yourId,
    rules,
    started,
    activePlayerId,
    activePlayerConnected,
    turn,
    winnerId,
    savedRoomGuid,
    error,
    roomClosed,
    kicked,
    hostAbandonDeadline,
    clientId,
    send,
  } = useRoomConnection();
  const viaLink = Boolean(initialJoinCode) || Boolean(initialSavedRoomGuid);

  function handleExitRoom() {
    send({ type: "leave_room" });
    onExit();
  }

  function handleCloseRoom() {
    send({ type: "close_room" });
    onExit();
  }
  const [lobbyMode, setLobbyMode] = useState<LobbyMode>(
    initialJoinCode ? "join" : initialSavedRoomGuid ? "create" : "choice",
  );
  const [playerName, setPlayerName] = useState("");
  const [joinCode, setJoinCode] = useState(initialJoinCode ?? "");
  const [joinRoomFound, setJoinRoomFound] = useState(false);
  const [joinLookupError, setJoinLookupError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  useLayoutEffect(() => {
    if (turn?.phase !== "in_progress" || turn.paused) return;
    // Resync immediately (don't wait for the first interval tick) — otherwise a stale `now`
    // paired with the server's freshly-shifted `startedAt` briefly renders the wrong countdown
    // right after resuming from a pause.
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, [turn?.phase, turn?.paused]);

  useLayoutEffect(() => {
    if (hostAbandonDeadline === null) return;
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, [hostAbandonDeadline]);

  useEffect(() => {
    if (joinCode.length !== 4) {
      setJoinRoomFound(false);
      setJoinLookupError(null);
      return;
    }
    let cancelled = false;
    fetch(`${SERVER_HTTP_URL}/api/rooms/${joinCode}`)
      .then((res) => {
        if (!res.ok) throw new Error("not found");
      })
      .then(() => {
        if (cancelled) return;
        setJoinRoomFound(true);
        setJoinLookupError(null);
      })
      .catch(() => {
        if (cancelled) return;
        setJoinRoomFound(false);
        setJoinLookupError("Комната не найдена");
      });
    return () => {
      cancelled = true;
    };
  }, [joinCode]);

  if (roomClosed) {
    return (
      <div className="screen">
        <Modal>
          <p>Эта комната была закрыта её владельцем. Сейчас вы будете перенаправлены на главную страницу.</p>
          <button className="primary" onClick={onExit}>
            Принять
          </button>
        </Modal>
      </div>
    );
  }

  if (kicked) {
    return (
      <div className="screen">
        <Modal>
          <p>Хост удалил вас из комнаты.</p>
          <button className="primary" onClick={onExit}>
            Принять
          </button>
        </Modal>
      </div>
    );
  }

  if (!roomCode) {
    if (reconnecting) {
      return <div className="screen">🔄 Переподключение к комнате…</div>;
    }
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
              onClick={() =>
                send(
                  initialSavedRoomGuid
                    ? { type: "create_room", playerName, clientId, savedRoomGuid: initialSavedRoomGuid }
                    : { type: "create_room", playerName, clientId },
                )
              }
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
            <button
              className="primary"
              disabled={status !== "open" || !joinRoomFound || !playerName.trim()}
              onClick={() => send({ type: "join_room", roomCode: joinCode, playerName, clientId })}
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

  const reconnectingBanner = reconnecting && (
    <p className="reconnect-banner">🔄 Переподключение…</p>
  );

  const hostAbandonSecondsLeft =
    hostAbandonDeadline !== null ? Math.max(0, Math.ceil((hostAbandonDeadline - now) / 1000)) : null;
  const hostAbandonModal = hostAbandonSecondsLeft !== null && (
    <Modal>
      <p>
        Хост отключился и не возвращается. Комната будет закрыта через {hostAbandonSecondsLeft}{" "}
        {pluralizeSeconds(hostAbandonSecondsLeft)}.
      </p>
    </Modal>
  );

  if (!started) {
    return (
      <>
        {reconnectingBanner}
        {hostAbandonModal}
        <RoomLobby
          roomCode={roomCode}
          teams={teams}
          players={players}
          rules={rules}
          hostId={hostId ?? ""}
          isHost={yourId === hostId}
          savedRoomGuid={savedRoomGuid}
          onUpdateRules={(newRules) => send({ type: "update_rules", rules: newRules })}
          onAssignPlayer={(playerId, teamId) => send({ type: "assign_player", playerId, teamId })}
          onReorderTeamPlayer={(playerId, direction) => send({ type: "reorder_team_player", playerId, direction })}
          onRemoveFromTeam={(playerId) => send({ type: "remove_from_team", playerId })}
          onKickPlayer={(playerId) => send({ type: "kick_player", playerId })}
          onShuffleTeams={() => send({ type: "shuffle_teams" })}
          onStartGame={() => send({ type: "start_game" })}
          onSaveRoom={() => send({ type: "save_room" })}
          onExit={handleExitRoom}
          onCloseRoom={handleCloseRoom}
        />
      </>
    );
  }

  if (winnerId) {
    const winner = teams.find((t) => t.id === winnerId);
    const sorted = [...teams].sort((a, b) => b.score - a.score);
    const isHost = yourId === hostId;
    return (
      <div className="screen">
        {hostAbandonModal}
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

  const activePlayer = players.find((p) => p.id === activePlayerId);
  const isActive = Boolean(yourId) && yourId === activePlayerId;
  const activeTeam = teams.find((t) => t.id === activePlayer?.teamId);
  const guessers = players.filter((p) => p.teamId === activePlayer?.teamId && p.id !== activePlayerId);
  const isHost = yourId === hostId;
  const you = players.find((p) => p.id === yourId);
  // A teammate still guessing — including after time's up, right up until the explainer passes
  // the turn — shouldn't see which words are already marked guessed/skipped: they may still be
  // shouting out the last word, and seeing the recap would spoil whether it already counted.
  const isGuessingTeammate = !isActive && you?.teamId === activeTeam?.id;

  return (
    <div className="screen">
      {reconnectingBanner}
      {hostAbandonModal}
      <div className="game-header-row">
        <ul className="scoreboard">
          {teams.map((t) => (
            <li key={t.id} className={t.id === activeTeam?.id ? "scoreboard-active" : undefined}>
              {t.name}: {t.score}
            </li>
          ))}
        </ul>
        {isHost && (
          <HostMenu
            onEndGame={handleCloseRoom}
            onChangeRules={() => send({ type: "new_setup" })}
            canTogglePause={turn?.phase === "in_progress"}
            paused={Boolean(turn?.paused)}
            onPause={() => send({ type: "pause_turn" })}
            onResume={() => send({ type: "resume_turn" })}
          />
        )}
      </div>

      {!turn &&
        (isActive ? (
          <>
            <button className="primary" onClick={() => send({ type: "start_turn" })}>
              Начать ход
            </button>
            <p className="guessers">
              Команда «{activeTeam?.name}»{guessers.length > 0 ? ` угадывает: ${guessers.map((p) => p.name).join(", ")}` : " угадывает"}
            </p>
          </>
        ) : (
          <>
            <p>Ход: {activePlayer?.name ?? "…"}{!activePlayerConnected && " (нет связи)"}</p>
            {isHost && !activePlayerConnected && (
              <div className="actions">
                <button onClick={() => send({ type: "skip_disconnected_turn" })}>
                  Пропустить игрока без связи
                </button>
                {activePlayerId && (
                  <button className="danger" onClick={() => send({ type: "kick_player", playerId: activePlayerId })}>
                    Удалить из комнаты
                  </button>
                )}
              </div>
            )}
          </>
        ))}

      {turn?.phase === "ended" && (
        <div className="turn">
          {/* Guessing teammates don't get the recap at all — they may still be shouting out the
              last word right up until the explainer passes the turn, and seeing which words are
              already marked guessed/skipped would spoil whether it's already counted. Everyone
              else (the explainer themself, or anyone not on the guessing team) sees it as before. */}
          {!isGuessingTeammate && (
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
          )}
          {isActive ? (
            <button className="primary" onClick={() => send({ type: "next_turn" })}>
              Передать ход
            </button>
          ) : (
            <>
              <p>{activePlayer?.name} проверяет ход{!activePlayerConnected && " (нет связи)"}</p>
              {isHost && !activePlayerConnected && (
                <div className="actions">
                  <button onClick={() => send({ type: "next_turn" })}>Передать ход за него</button>
                  {activePlayerId && (
                    <button
                      className="danger"
                      onClick={() => send({ type: "kick_player", playerId: activePlayerId })}
                    >
                      Удалить из комнаты
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {turn?.phase === "in_progress" && isActive && (
        <div className="turn">
          <div className="timer">{turn.paused ? "⏸️" : secondsLeft}</div>
          <div className="word" key={turn.currentIndex}>
            {word?.text}
          </div>
          <div className="actions">
            {rules?.allowSkip && (
              <button disabled={turn.paused} onClick={() => send({ type: "mark_skipped" })}>
                Пропустить
              </button>
            )}
            <button className="primary" disabled={turn.paused} onClick={() => send({ type: "mark_guessed" })}>
              Угадано
            </button>
          </div>
        </div>
      )}

      {turn?.phase === "in_progress" && !isActive && (
        <div className="turn">
          <div className="timer">{turn.paused ? "⏸️" : secondsLeft}</div>
          {word ? (
            <div className="word" key={turn.currentIndex}>
              {word.text}
            </div>
          ) : (
            <p>{activePlayer?.name} объясняет слово{!activePlayerConnected && " (нет связи)"}</p>
          )}
          <p className="guessers">
            Команда «{activeTeam?.name}»{guessers.length > 0 ? ` угадывает: ${guessers.map((p) => p.name).join(", ")}` : " угадывает"}
          </p>
          {isHost && !activePlayerConnected && activePlayerId && (
            <button className="danger" onClick={() => send({ type: "kick_player", playerId: activePlayerId })}>
              Удалить из комнаты (не дожидаясь конца хода)
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function pluralizeSeconds(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "секунду";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "секунды";
  return "секунд";
}
