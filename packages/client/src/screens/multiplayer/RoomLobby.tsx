import { useEffect, useState } from "react";
import { pickRandomTeamNames, scaledDeckConfig, type PlayerInfo, type RoomRules, type TeamState } from "@kridens/core";
import { SERVER_HTTP_URL } from "../../config";
import ShareRoomLink from "./ShareRoomLink";

const MAX_TEAMS = 10;
const PLAYER_DRAG_TYPE = "application/x-player-id";
const REQUIRED_FIELD_MESSAGE = "Заполните это поле";

interface RoomLobbyProps {
  roomCode: string;
  teams: TeamState[];
  players: PlayerInfo[];
  rules: RoomRules;
  hostId: string;
  isHost: boolean;
  onUpdateRules: (rules: RoomRules) => void;
  onAssignPlayer: (playerId: string, teamId: string) => void;
  onShuffleTeams: () => void;
  onStartGame: () => void;
  onExit: () => void;
  onCloseRoom: () => void;
}

export default function RoomLobby({
  roomCode,
  teams,
  players,
  rules,
  hostId,
  isHost,
  onUpdateRules,
  onAssignPlayer,
  onShuffleTeams,
  onStartGame,
  onExit,
  onCloseRoom,
}: RoomLobbyProps) {
  const [confirmingClose, setConfirmingClose] = useState(false);
  const [poolSize, setPoolSize] = useState<number | null>(null);
  const [deckSize, setDeckSize] = useState(rules.deckConfig.count);
  const [limitWordsPerTurn, setLimitWordsPerTurn] = useState(rules.limitWordsPerTurn);
  const [turnDurationSec, setTurnDurationSec] = useState(rules.turnDurationMs / 1000);
  const [winScore, setWinScore] = useState(rules.winScore);
  const [limitScore, setLimitScore] = useState(rules.limitScore);
  const [allowSkip, setAllowSkip] = useState(rules.allowSkip);

  useEffect(() => {
    fetch(`${SERVER_HTTP_URL}/api/words`)
      .then((res) => res.json())
      .then((words: unknown[]) => setPoolSize(words.length))
      .catch(() => setPoolSize(null));
  }, []);

  const maxDeckSize = Math.min(30, poolSize ?? rules.deckConfig.count);

  function renameTeam(index: number, name: string) {
    onUpdateRules({ ...rules, teamNames: rules.teamNames.map((n, i) => (i === index ? name : n)) });
  }

  function addTeam() {
    if (rules.teamNames.length >= MAX_TEAMS) return;
    const [nextCityName] = pickRandomTeamNames(1, rules.teamNames);
    const name = nextCityName ?? `Команда ${rules.teamNames.length + 1}`;
    onUpdateRules({ ...rules, teamNames: [...rules.teamNames, name] });
  }

  function removeTeam(index: number) {
    if (rules.teamNames.length <= 2) return;
    onUpdateRules({ ...rules, teamNames: rules.teamNames.filter((_, i) => i !== index) });
  }

  function handleStartGame() {
    onUpdateRules({
      ...rules,
      deckConfig: scaledDeckConfig(clamp(deckSize, 4, maxDeckSize)),
      limitWordsPerTurn,
      turnDurationMs: clamp(turnDurationSec, 15, 180) * 1000,
      winScore: Math.max(5, winScore),
      limitScore,
      allowSkip,
    });
    onStartGame();
  }

  return (
    <div className="screen">
      {isHost ? (
        <button className="exit" onClick={() => setConfirmingClose(true)}>
          Закрыть комнату
        </button>
      ) : (
        <button className="exit" onClick={onExit}>
          Выйти
        </button>
      )}
      {confirmingClose && (
        <div className="modal-overlay">
          <div className="modal">
            <p>Вы уверены что хотите закрыть комнату? Все несохранённые данные будут потеряны.</p>
            <div className="actions">
              <button onClick={() => setConfirmingClose(false)}>Отмена</button>
              <button className="danger" onClick={onCloseRoom}>
                Закрыть комнату
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="room-header-row">
        <h2>Комната {roomCode}</h2>
        <ShareRoomLink roomCode={roomCode} />
      </div>

      <section>
        <h3>Игроки</h3>
        <ul className="player-chip-list">
          {players.map((p) => (
            <PlayerChip key={p.id} player={p} isHost={p.id === hostId} draggable={isHost} />
          ))}
          {players.length === 0 && <li className="muted">Пока никого</li>}
        </ul>
      </section>

      <section>
        <div className="section-header-row">
          <h3>Команды</h3>
          {isHost && (
            <button type="button" className="ghost-btn" onClick={onShuffleTeams} disabled={players.length === 0}>
              🔀 Перемешать
            </button>
          )}
        </div>
        <div className="team-drop-grid">
          {teams.map((team, i) => (
            <TeamDropZone
              key={team.id}
              team={team}
              players={players.filter((p) => p.teamId === team.id)}
              allPlayers={players}
              hostId={hostId}
              isHost={isHost}
              canRemove={teams.length > 2}
              onAssignPlayer={onAssignPlayer}
              onRename={(name) => renameTeam(i, name)}
              onRemove={() => removeTeam(i)}
            />
          ))}
        </div>
        {isHost && teams.length < MAX_TEAMS && (
          <button type="button" onClick={addTeam}>
            + Добавить команду
          </button>
        )}
      </section>

      {isHost ? (
        <HostRules
          turnDurationSec={turnDurationSec}
          onTurnDurationSecChange={setTurnDurationSec}
          limitWordsPerTurn={limitWordsPerTurn}
          onLimitWordsPerTurnChange={setLimitWordsPerTurn}
          deckSize={deckSize}
          onDeckSizeChange={setDeckSize}
          maxDeckSize={maxDeckSize}
          limitScore={limitScore}
          onLimitScoreChange={setLimitScore}
          winScore={winScore}
          onWinScoreChange={setWinScore}
          allowSkip={allowSkip}
          onAllowSkipChange={setAllowSkip}
        />
      ) : (
        <ReadOnlyRules rules={rules} />
      )}

      {isHost ? (
        <button className="primary" onClick={handleStartGame}>
          Начать игру
        </button>
      ) : (
        <p>Ожидаем хоста…</p>
      )}
    </div>
  );
}

function PlayerChip({ player, isHost, draggable }: { player: PlayerInfo; isHost: boolean; draggable: boolean }) {
  return (
    <li
      className="player-chip"
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData(PLAYER_DRAG_TYPE, player.id);
        e.dataTransfer.effectAllowed = "move";
      }}
    >
      {player.name}
      {isHost && (
        <span className="host-star" title="Хост">
          ★
        </span>
      )}
    </li>
  );
}

function TeamDropZone({
  team,
  players,
  allPlayers,
  hostId,
  isHost,
  canRemove,
  onAssignPlayer,
  onRename,
  onRemove,
}: {
  team: TeamState;
  players: PlayerInfo[];
  allPlayers: PlayerInfo[];
  hostId: string;
  isHost: boolean;
  canRemove: boolean;
  onAssignPlayer: (playerId: string, teamId: string) => void;
  onRename: (name: string) => void;
  onRemove: () => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(team.name);
  const [invalid, setInvalid] = useState(false);
  const addablePlayers = allPlayers.filter((p) => p.teamId !== team.id);

  function save() {
    const trimmed = draft.trim();
    if (trimmed) onRename(trimmed);
    setEditing(false);
  }

  return (
    <div
      className={`team-drop${dragOver ? " drag-over" : ""}`}
      onDragOver={(e) => {
        if (!isHost) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        if (!isHost) return;
        e.preventDefault();
        setDragOver(false);
        const playerId = e.dataTransfer.getData(PLAYER_DRAG_TYPE);
        if (playerId) onAssignPlayer(playerId, team.id);
      }}
    >
      {editing ? (
        <form
          className="team-drop-rename"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <input
            className={invalid ? "field-invalid" : undefined}
            value={draft}
            onChange={(e) => {
              e.target.setCustomValidity("");
              setInvalid(false);
              setDraft(e.target.value);
            }}
            onInvalid={(e) => {
              e.currentTarget.setCustomValidity(REQUIRED_FIELD_MESSAGE);
              setInvalid(true);
            }}
            autoFocus
            required
            maxLength={50}
          />
          <button type="submit" className="icon-btn" aria-label="Сохранить название">
            ✓
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Отменить"
            onClick={() => {
              setDraft(team.name);
              setInvalid(false);
              setEditing(false);
            }}
          >
            ×
          </button>
        </form>
      ) : (
        <div className="team-drop-header">
          <strong>{team.name}</strong>
          {isHost && (
            <div className="team-drop-header-actions">
              <button
                type="button"
                className="icon-btn"
                aria-label="Редактировать название"
                onClick={() => {
                  setDraft(team.name);
                  setInvalid(false);
                  setEditing(true);
                }}
              >
                ✎
              </button>
              {canRemove && (
                <button type="button" className="icon-btn" aria-label="Удалить команду" onClick={onRemove}>
                  ×
                </button>
              )}
            </div>
          )}
        </div>
      )}
      <ul>
        {players.map((p) => (
          <PlayerChip key={p.id} player={p} isHost={p.id === hostId} draggable={isHost} />
        ))}
        {players.length === 0 && <li className="muted">Пока никого</li>}
      </ul>
      {isHost && addablePlayers.length > 0 && (
        <select
          className="add-player-select"
          value=""
          onChange={(e) => {
            if (e.target.value) onAssignPlayer(e.target.value, team.id);
          }}
        >
          <option value="" disabled>
            + Добавить игрока
          </option>
          {addablePlayers.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

function HostRules({
  turnDurationSec,
  onTurnDurationSecChange,
  limitWordsPerTurn,
  onLimitWordsPerTurnChange,
  deckSize,
  onDeckSizeChange,
  maxDeckSize,
  limitScore,
  onLimitScoreChange,
  winScore,
  onWinScoreChange,
  allowSkip,
  onAllowSkipChange,
}: {
  turnDurationSec: number;
  onTurnDurationSecChange: (value: number) => void;
  limitWordsPerTurn: boolean;
  onLimitWordsPerTurnChange: (value: boolean) => void;
  deckSize: number;
  onDeckSizeChange: (value: number) => void;
  maxDeckSize: number;
  limitScore: boolean;
  onLimitScoreChange: (value: boolean) => void;
  winScore: number;
  onWinScoreChange: (value: number) => void;
  allowSkip: boolean;
  onAllowSkipChange: (value: boolean) => void;
}) {
  return (
    <section className="setup-form">
      <h3>Правила</h3>
      <label>
        Длительность хода, сек
        <input
          type="number"
          min={15}
          max={180}
          value={turnDurationSec}
          onChange={(e) => onTurnDurationSecChange(Number(e.target.value))}
        />
      </label>
      <label className="checkbox-row inline-field-row">
        <input
          type="checkbox"
          checked={limitWordsPerTurn}
          onChange={(e) => onLimitWordsPerTurnChange(e.target.checked)}
        />
        Максимум слов в ходе (макс. {maxDeckSize})
        <input
          type="number"
          min={4}
          max={maxDeckSize}
          value={deckSize}
          disabled={!limitWordsPerTurn}
          onChange={(e) => onDeckSizeChange(Number(e.target.value))}
        />
      </label>
      <label className="checkbox-row inline-field-row">
        <input type="checkbox" checked={limitScore} onChange={(e) => onLimitScoreChange(e.target.checked)} />
        Очков до победы
        <input
          type="number"
          min={5}
          value={winScore}
          disabled={!limitScore}
          onChange={(e) => onWinScoreChange(Number(e.target.value))}
        />
      </label>
      <label className="checkbox-row">
        <input type="checkbox" checked={allowSkip} onChange={(e) => onAllowSkipChange(e.target.checked)} />
        Можно пропускать слова
      </label>
    </section>
  );
}

function ReadOnlyRules({ rules }: { rules: RoomRules }) {
  return (
    <section>
      <h3>Правила</h3>
      <p>Слов в ходе: {rules.limitWordsPerTurn ? rules.deckConfig.count : "не ограничено"}</p>
      <p>Длительность хода: {rules.turnDurationMs / 1000} сек</p>
      <p>Очков до победы: {rules.limitScore ? rules.winScore : "не ограничено"}</p>
      <p>Пропуск слов: {rules.allowSkip ? "разрешён" : "запрещён"}</p>
    </section>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
