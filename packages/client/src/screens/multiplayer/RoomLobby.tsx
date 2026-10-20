import { useEffect, useState } from "react";
import {
  pickRandomTeamNames,
  scaledDeckConfig,
  type PlayerInfo,
  type RoomRules,
  type TeamReorderDirection,
  type TeamState,
} from "@kridens/core";
import { SERVER_HTTP_URL, TURN_DURATION_OPTIONS_SEC } from "../../config";
import Modal from "../../components/Modal";
import CopyLinkButton from "../../components/CopyLinkButton";

const MAX_TEAMS = 10;
const PLAYER_DRAG_TYPE = "application/x-player-id";
const REQUIRED_FIELD_MESSAGE = "Заполните это поле";

interface CollectionOption {
  id: number;
  name: string;
  wordCount: number;
}

interface RoomLobbyProps {
  roomCode: string;
  teams: TeamState[];
  players: PlayerInfo[];
  rules: RoomRules;
  hostId: string;
  isHost: boolean;
  savedRoomGuid: string | null;
  onUpdateRules: (rules: RoomRules) => void;
  onAssignPlayer: (playerId: string, teamId: string) => void;
  onReorderTeamPlayer: (playerId: string, direction: TeamReorderDirection) => void;
  onRemoveFromTeam: (playerId: string) => void;
  onKickPlayer: (playerId: string) => void;
  onShuffleTeams: () => void;
  onStartGame: () => void;
  onSaveRoom: () => void;
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
  savedRoomGuid,
  onUpdateRules,
  onAssignPlayer,
  onReorderTeamPlayer,
  onRemoveFromTeam,
  onKickPlayer,
  onShuffleTeams,
  onStartGame,
  onSaveRoom,
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
  const [showWordToOthers, setShowWordToOthers] = useState(rules.showWordToOthers);
  const [collectionId, setCollectionId] = useState<number | null>(rules.collectionId ?? null);
  const [collections, setCollections] = useState<CollectionOption[]>([]);

  useEffect(() => {
    fetch(`${SERVER_HTTP_URL}/api/words`)
      .then((res) => res.json())
      .then((words: unknown[]) => setPoolSize(words.length))
      .catch(() => setPoolSize(null));
    fetch(`${SERVER_HTTP_URL}/api/collections`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: CollectionOption[]) => setCollections(data))
      .catch(() => setCollections([]));
  }, []);

  // No "all words" sentinel in the dropdown — it's just collections, defaulting to the real
  // "Все слова" collection (or the first available one, if that's been renamed/removed).
  useEffect(() => {
    if (collectionId !== null) return;
    const available = collections.filter((c) => c.wordCount > 0);
    const defaultCollection = available.find((c) => c.name === "Все слова") ?? available[0];
    if (defaultCollection) setCollectionId(defaultCollection.id);
  }, [collections, collectionId]);

  const selectedCollection = collections.find((c) => c.id === collectionId) ?? null;
  const maxDeckSize = Math.min(30, selectedCollection ? selectedCollection.wordCount : poolSize ?? rules.deckConfig.count);

  useEffect(() => {
    setDeckSize((size) => Math.min(size, maxDeckSize));
  }, [maxDeckSize]);

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
    if (selectedCollection?.wordCount === 0) return;
    onUpdateRules({
      ...rules,
      deckConfig: scaledDeckConfig(clamp(deckSize, 4, maxDeckSize)),
      limitWordsPerTurn,
      turnDurationMs: clamp(turnDurationSec, 15, 180) * 1000,
      winScore: Math.max(5, winScore),
      limitScore,
      allowSkip,
      showWordToOthers,
      collectionId,
    });
    onStartGame();
  }

  return (
    <div className="screen">
      <div className="room-header-row">
        {isHost ? (
          <button className="exit" onClick={() => setConfirmingClose(true)}>
            Закрыть комнату
          </button>
        ) : (
          <button className="exit" onClick={onExit}>
            Выйти
          </button>
        )}
        {isHost &&
          (savedRoomGuid ? (
            <CopyLinkButton
              url={`${window.location.origin}${window.location.pathname}?saved=${savedRoomGuid}`}
              label="💾 Скопировать ссылку"
            />
          ) : (
            <button type="button" className="ghost-btn" onClick={onSaveRoom}>
              💾 Сохранить комнату
            </button>
          ))}
      </div>
      {confirmingClose && (
        <Modal>
          <p>Вы уверены что хотите закрыть комнату? Все несохранённые данные будут потеряны.</p>
          <div className="actions">
            <button onClick={() => setConfirmingClose(false)}>Отмена</button>
            <button className="danger" onClick={onCloseRoom}>
              Закрыть комнату
            </button>
          </div>
        </Modal>
      )}
      <div className="room-header-row">
        <h2>Комната {roomCode}</h2>
        <CopyLinkButton url={`${window.location.origin}${window.location.pathname}?room=${roomCode}`} label="🔗 Поделиться" />
      </div>

      <section>
        <h3>Игроки</h3>
        <ul className="player-chip-list">
          {players.map((p) => (
            <PlayerChip
              key={p.id}
              player={p}
              isHost={p.id === hostId}
              draggable={isHost}
              onKick={isHost && p.id !== hostId ? () => onKickPlayer(p.id) : undefined}
            />
          ))}
          {players.length === 0 && <li className="muted">Пока никого</li>}
        </ul>
        {isHost && players.some((p) => p.teamId === null) && (
          <p className="muted">Без команды: эти игроки не участвуют в ходах, пока не будут добавлены в команду.</p>
        )}
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
              onReorderTeamPlayer={onReorderTeamPlayer}
              onRemoveFromTeam={onRemoveFromTeam}
              onKickPlayer={onKickPlayer}
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
          showWordToOthers={showWordToOthers}
          onShowWordToOthersChange={setShowWordToOthers}
          collections={collections}
          collectionId={collectionId}
          onCollectionIdChange={setCollectionId}
        />
      ) : (
        <ReadOnlyRules rules={rules} collectionName={collections.find((c) => c.id === rules.collectionId)?.name ?? null} />
      )}

      {isHost ? (
        <button className="primary" onClick={handleStartGame} disabled={selectedCollection?.wordCount === 0}>
          Начать игру
        </button>
      ) : (
        <p>Ожидаем хоста…</p>
      )}
    </div>
  );
}

function PlayerChip({
  player,
  isHost,
  draggable,
  onKick,
}: {
  player: PlayerInfo;
  isHost: boolean;
  draggable: boolean;
  /** Omitted for the host's own chip and for non-hosts — can't kick the host, and only the host
   * can kick at all. */
  onKick?: () => void;
}) {
  return (
    <li
      className={`player-chip${player.connected ? "" : " player-chip-offline"}`}
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
      {!player.connected && (
        <span className="player-offline-dot" title="Нет связи">
          ⚠️
        </span>
      )}
      {onKick && (
        <button
          type="button"
          className="icon-btn chip-remove-btn"
          aria-label={`Удалить ${player.name} из комнаты`}
          title="Удалить из комнаты"
          onClick={onKick}
        >
          ×
        </button>
      )}
    </li>
  );
}

/** A player row inside a team's roster — same look as `PlayerChip` plus reorder arrows (the
 * roster order here is exactly what `start_game` turns into turn order) and a button to take
 * them off the team without removing them from the room. */
function TeamMemberChip({
  player,
  isHost,
  draggable,
  showControls,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onRemoveFromTeam,
  onKick,
}: {
  player: PlayerInfo;
  isHost: boolean;
  draggable: boolean;
  showControls: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemoveFromTeam: () => void;
  onKick?: () => void;
}) {
  return (
    <li
      className={`player-chip${player.connected ? "" : " player-chip-offline"}`}
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
      {!player.connected && (
        <span className="player-offline-dot" title="Нет связи">
          ⚠️
        </span>
      )}
      {showControls && (
        <span className="chip-controls">
          <button
            type="button"
            className="icon-btn"
            aria-label="Сдвинуть выше"
            title="Сдвинуть выше"
            disabled={!canMoveUp}
            onClick={onMoveUp}
          >
            ↑
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Сдвинуть ниже"
            title="Сдвинуть ниже"
            disabled={!canMoveDown}
            onClick={onMoveDown}
          >
            ↓
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label={`Снять ${player.name} с команды`}
            title="Снять с команды"
            onClick={onRemoveFromTeam}
          >
            ⤵
          </button>
          {onKick && (
            <button
              type="button"
              className="icon-btn chip-remove-btn"
              aria-label={`Удалить ${player.name} из комнаты`}
              title="Удалить из комнаты"
              onClick={onKick}
            >
              ×
            </button>
          )}
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
  onReorderTeamPlayer,
  onRemoveFromTeam,
  onKickPlayer,
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
  onReorderTeamPlayer: (playerId: string, direction: TeamReorderDirection) => void;
  onRemoveFromTeam: (playerId: string) => void;
  onKickPlayer: (playerId: string) => void;
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
        {players.map((p, i) => (
          <TeamMemberChip
            key={p.id}
            player={p}
            isHost={p.id === hostId}
            draggable={isHost}
            showControls={isHost}
            canMoveUp={i > 0}
            canMoveDown={i < players.length - 1}
            onMoveUp={() => onReorderTeamPlayer(p.id, "up")}
            onMoveDown={() => onReorderTeamPlayer(p.id, "down")}
            onRemoveFromTeam={() => onRemoveFromTeam(p.id)}
            onKick={p.id !== hostId ? () => onKickPlayer(p.id) : undefined}
          />
        ))}
        {players.length === 0 && <li className="muted">Пока никого</li>}
      </ul>
      {isHost && addablePlayers.length > 0 && (
        <div className="add-player-control">
          <select
            className="add-player-select"
            aria-label="Добавить игрока в команду"
            value=""
            onChange={(e) => {
              if (e.target.value) onAssignPlayer(e.target.value, team.id);
            }}
          >
            <option value="" disabled>
              Добавить игрока
            </option>
            {addablePlayers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <span className="add-player-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="7" r="4" />
              <path d="M2 21v-2a6 6 0 0 1 10-4.47" />
              <path d="M17 11v6M14 14h6" />
            </svg>
          </span>
        </div>
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
  showWordToOthers,
  onShowWordToOthersChange,
  collections,
  collectionId,
  onCollectionIdChange,
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
  showWordToOthers: boolean;
  onShowWordToOthersChange: (value: boolean) => void;
  collections: CollectionOption[];
  collectionId: number | null;
  onCollectionIdChange: (value: number | null) => void;
}) {
  const selectedCollection = collections.find((c) => c.id === collectionId) ?? null;
  return (
    <section className="setup-form">
      <h3>Правила</h3>
      <label>
        Коллекция слов
        <select value={collectionId ?? ""} onChange={(e) => onCollectionIdChange(Number(e.target.value))}>
          {collections
            .filter((c) => c.wordCount > 0)
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.wordCount})
              </option>
            ))}
        </select>
      </label>
      {selectedCollection?.wordCount === 0 && <p className="error">В этой коллекции нет слов — выберите другую</p>}
      <label>
        Длительность хода, сек
        <select value={turnDurationSec} onChange={(e) => onTurnDurationSecChange(Number(e.target.value))}>
          {TURN_DURATION_OPTIONS_SEC.map((sec) => (
            <option key={sec} value={sec}>
              {sec}
            </option>
          ))}
        </select>
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
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={showWordToOthers}
          onChange={(e) => onShowWordToOthersChange(e.target.checked)}
        />
        Показывать задание другим игрокам
      </label>
    </section>
  );
}

function ReadOnlyRules({ rules, collectionName }: { rules: RoomRules; collectionName: string | null }) {
  return (
    <section>
      <h3>Правила</h3>
      <p>Коллекция слов: {collectionName ?? "Все слова"}</p>
      <p>Слов в ходе: {rules.limitWordsPerTurn ? rules.deckConfig.count : "не ограничено"}</p>
      <p>Длительность хода: {rules.turnDurationMs / 1000} сек</p>
      <p>Очков до победы: {rules.limitScore ? rules.winScore : "не ограничено"}</p>
      <p>Пропуск слов: {rules.allowSkip ? "разрешён" : "запрещён"}</p>
      <p>Задание другим игрокам: {rules.showWordToOthers ? "показывается" : "скрыто"}</p>
    </section>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
