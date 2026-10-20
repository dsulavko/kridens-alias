import type { WebSocket } from "ws";
import {
  buildDeck,
  markGuessed as coreMarkGuessed,
  markSkipped as coreMarkSkipped,
  endTurn as coreEndTurn,
  startTurn as coreStartTurn,
  defaultRoomRules,
  hasWinner,
  scaledDeckConfig,
  type RoomRules,
  type ServerMessage,
  type TeamReorderDirection,
  type TeamState,
  type TurnState,
  type Word,
} from "@kridens/core";
import {
  addSavedRoomUsedWordIds,
  clearSavedRoomUsedWordIds,
  createSavedRoom,
  incrementSavedRoomGamesPlayed,
  updateSavedRoomRules,
} from "../db/savedRoomsRepo.js";

export interface RoomOptions {
  /** Set when this room is being recreated from a saved-room link. */
  savedRoomGuid?: string | null;
  /** The saved room's rules snapshot, applied instead of `defaultRoomRules()`. */
  initialRules?: RoomRules;
  /** Every word already played under that GUID in a previous live session, excluded from this one's deck until exhausted. */
  initialUsedWordIds?: Set<number>;
}

/** How long a room waits, after its host's socket drops, before warning everyone else that it's
 * about to close — long enough to survive a brief network blip, a page reload, or the host just
 * being away for a bit, short enough that a host who's genuinely gone (closed the tab, created a
 * different room instead of coming back) doesn't leave a room other people can sit in forever
 * with no one able to start/run the game. */
const HOST_ABANDON_WARNING_MS = 10 * 60_000;
/** Once the warning fires, how long the countdown shown to everyone else runs before the room
 * is actually torn down — the host reconnecting at any point before zero cancels both. */
const HOST_ABANDON_COUNTDOWN_MS = 120_000;

interface Player {
  id: string;
  name: string;
  /** Null means "in the room but not on any team" — see Room.removeFromTeam. */
  teamId: string | null;
  /** Null while disconnected — the seat (team assignment, turn-order slot, score) is kept so a
   * dropped connection can reclaim it via `reconnectPlayer` instead of losing its place. */
  socket: WebSocket | null;
  connected: boolean;
}

/**
 * Holds the live state for a single game room: teams, players, sockets and
 * the current turn. Rooms are in-memory only — they're ephemeral by nature,
 * unlike the word dictionary, which is persisted.
 */
export class Room {
  readonly code: string;
  readonly hostId: string;
  private rules: RoomRules;
  private teams: TeamState[];
  private players: Player[] = [];
  private usedWordIds: Set<number>;
  private turn: TurnState | null = null;
  private turnOrder: Array<{ playerId: string; teamId: string }> = [];
  private turnOrderIndex = 0;
  private turnTimeout: NodeJS.Timeout | null = null;
  private started = false;
  private winnerId: string | null = null;
  private savedRoomGuid: string | null;
  private hostAbandonTimeout: NodeJS.Timeout | null = null;
  /** Unix ms timestamp the countdown shown to everyone ends at — set once the warning stage
   * fires, cleared the moment the host reconnects. See armHostAbandonWarning. */
  private hostAbandonDeadline: number | null = null;
  /** Set by RoomManager right after construction — called once this room has closed itself
   * because its host is gone for good (abandon grace period elapsed, or the host explicitly
   * left), so the manager can drop it from its registry the same way an explicit `close_room`
   * does. */
  onAbandoned: (() => void) | null = null;

  constructor(code: string, hostId: string, private wordPool: Word[], options: RoomOptions = {}) {
    this.code = code;
    this.hostId = hostId;
    this.rules = options.initialRules ?? defaultRoomRules();
    this.teams = buildTeams(this.rules.teamNames);
    this.savedRoomGuid = options.savedRoomGuid ?? null;
    this.usedWordIds = new Set(options.initialUsedWordIds ?? []);
  }

  getRules(): RoomRules {
    return this.rules;
  }

  /** Mirrors the guard `updateRules` itself applies — exposed so the WS layer can decide whether
   * to resolve (and apply) a changed `collectionId`'s word pool *before* calling `updateRules`,
   * without that lookup ever running for a request that's going to be rejected anyway. */
  canUpdateRules(requesterId: string): boolean {
    return requesterId === this.hostId && !this.started;
  }

  /** Called from the WS layer when `updateRules` is about to apply a changed `collectionId` — DB
   * access (resolving a collection to its word list) stays there, same as the initial pool fetch
   * on `create_room`. Resets exhaustion tracking too: the old set's ids belong to a different
   * pool and would otherwise wrongly exclude same-id words newly in scope. */
  setWordPool(pool: Word[]) {
    this.wordPool = pool;
    this.usedWordIds.clear();
  }

  addPlayer(player: Omit<Player, "connected">) {
    this.players.push({ ...player, connected: true });
  }

  hasPlayer(playerId: string): boolean {
    return this.players.some((p) => p.id === playerId);
  }

  /** Self-service: a joined (non-host) player leaving the room before it starts. */
  removePlayer(playerId: string) {
    this.players = this.players.filter((p) => p.id !== playerId);
    this.broadcast();
  }

  /** A socket dropped (network blip, backgrounded tab, navigating away to create/join a
   * different room, etc). The seat is kept — team, score and turn-order slot all stay put — so
   * `reconnectPlayer` can restore the same socket's player on their next connection instead of
   * them rejoining as a brand-new player at the back of the queue. Only `removePlayer`/
   * `leave_room` drops a seat for good.
   *
   * If the disconnected player is the host, this starts the abandonment sequence: a room with no
   * host can still be joined and sat in by others (its lobby/game controls are all host-only),
   * but no one can ever actually run it, so without this it would otherwise exist forever. */
  removeSocket(socket: WebSocket) {
    const player = this.players.find((p) => p.socket === socket);
    if (!player) return;
    player.socket = null;
    player.connected = false;
    if (player.id === this.hostId) this.armHostAbandonWarning();
    this.broadcast();
  }

  /** Reclaims an existing seat (by the stable client-chosen id) for a freshly opened socket.
   * Returns false if there's no such seat — the caller falls back to treating this as a normal
   * `join_room`/`create_room`. */
  reconnectPlayer(playerId: string, socket: WebSocket): boolean {
    const player = this.players.find((p) => p.id === playerId);
    if (!player) return false;
    player.socket = socket;
    player.connected = true;
    if (playerId === this.hostId) this.disarmHostAbandonTimer();
    this.broadcast();
    return true;
  }

  /** Host-only: tell everyone the room is gone before the manager tears it down. */
  close(requesterId: string): boolean {
    if (requesterId !== this.hostId) return false;
    this.disarmHostAbandonTimer();
    this.sendRoomClosed();
    return true;
  }

  private sendRoomClosed() {
    const message: ServerMessage = { type: "room_closed" };
    for (const player of this.players) {
      if (!player.socket || player.socket.readyState !== player.socket.OPEN) continue;
      player.socket.send(JSON.stringify(message));
    }
  }

  /** Stage 1: the host has been gone for `HOST_ABANDON_WARNING_MS` with no reconnect. Starts the
   * visible countdown (broadcast via `hostAbandonDeadline` in `room_state`) and schedules the
   * actual teardown at the end of it. */
  private armHostAbandonWarning() {
    this.disarmHostAbandonTimer();
    this.hostAbandonTimeout = setTimeout(() => {
      const host = this.players.find((p) => p.id === this.hostId);
      if (host?.connected) return;
      this.hostAbandonDeadline = Date.now() + HOST_ABANDON_COUNTDOWN_MS;
      this.armHostAbandonCountdown();
      this.broadcast();
    }, HOST_ABANDON_WARNING_MS);
  }

  /** Stage 2: the warning countdown has run out with still no reconnect — close the room for
   * real, same as an explicit `close_room`. */
  private armHostAbandonCountdown() {
    this.hostAbandonTimeout = setTimeout(() => {
      const host = this.players.find((p) => p.id === this.hostId);
      if (host?.connected) return;
      this.sendRoomClosed();
      this.onAbandoned?.();
    }, HOST_ABANDON_COUNTDOWN_MS);
  }

  private disarmHostAbandonTimer() {
    if (this.hostAbandonTimeout) {
      clearTimeout(this.hostAbandonTimeout);
      this.hostAbandonTimeout = null;
    }
    this.hostAbandonDeadline = null;
  }

  /** Host-only, and only before the game has started — teams/deck/timer are locked in once play begins. */
  updateRules(rules: RoomRules, requesterId: string) {
    if (requesterId !== this.hostId || this.started) return;
    this.rules = rules;
    // Keep the saved snapshot in sync with further edits in the same lobby, so whatever the
    // host actually starts the game with is what a later "reopen" link restores — not just
    // whatever happened to be set at the moment they clicked "save".
    if (this.savedRoomGuid) updateSavedRoomRules(this.savedRoomGuid, rules);
    this.teams = buildTeams(rules.teamNames);
    const validTeamIds = new Set(this.teams.map((t) => t.id));
    for (const player of this.players) {
      // A player taken off their team (teamId null) stays off it across a rules edit — only an
      // actually-stale team reference (the team itself was removed/renamed) gets reset.
      if (player.teamId !== null && !validTeamIds.has(player.teamId)) player.teamId = this.teams[0].id;
    }
    this.broadcast();
  }

  /** Host-only, and only before the game has started — reassigning mid-game would desync scores. */
  assignPlayer(playerId: string, teamId: string, requesterId: string) {
    if (requesterId !== this.hostId || this.started) return;
    if (!this.hasTeam(teamId)) return;
    const player = this.players.find((p) => p.id === playerId);
    if (!player) return;
    player.teamId = teamId;
    this.broadcast();
  }

  /** Host-only, lobby-only: takes a player off their team without removing them from the room.
   * They stay listed under "Игроки" and can be dragged onto a team again later, but don't
   * contribute to the turn order (built fresh from each team's roster) until then. */
  removeFromTeam(playerId: string, requesterId: string) {
    if (requesterId !== this.hostId || this.started) return;
    const player = this.players.find((p) => p.id === playerId);
    if (!player) return;
    player.teamId = null;
    this.broadcast();
  }

  /** Host-only, lobby-only: moves a player one slot up/down within their own team's roster —
   * this ordering is exactly what `buildTurnOrder` turns into turn order on `start_game`. A
   * no-op if they're already at that end of the roster, or not on a team at all. */
  reorderTeamPlayer(playerId: string, direction: TeamReorderDirection, requesterId: string) {
    if (requesterId !== this.hostId || this.started) return;
    const player = this.players.find((p) => p.id === playerId);
    if (!player || player.teamId === null) return;
    const roster = this.players.filter((p) => p.teamId === player.teamId);
    const index = roster.indexOf(player);
    const swapWith = direction === "up" ? index - 1 : index + 1;
    if (swapWith < 0 || swapWith >= roster.length) return;
    const neighbor = roster[swapWith];
    const a = this.players.indexOf(player);
    const b = this.players.indexOf(neighbor);
    [this.players[a], this.players[b]] = [this.players[b], this.players[a]];
    this.broadcast();
  }

  /** Host-only: removes a player from the room entirely — e.g. they're stuck disconnected and
   * won't reconnect. Tells their own socket first (so they see why they got bounced) before the
   * rest of the room learns they're gone. If they were the active player, whatever turn/recap
   * was running for them is torn down and the slot that held them is dropped, so the turn order
   * naturally advances to whoever was next — same outcome as `skipDisconnectedTurn`, just forced
   * instead of waiting on a reconnect. */
  kickPlayer(playerId: string, requesterId: string) {
    if (requesterId !== this.hostId || playerId === this.hostId) return;
    const player = this.players.find((p) => p.id === playerId);
    if (!player) return;
    if (player.socket && player.socket.readyState === player.socket.OPEN) {
      const message: ServerMessage = { type: "kicked" };
      player.socket.send(JSON.stringify(message));
    }
    const wasActive = this.getActivePlayerId() === playerId;
    this.players = this.players.filter((p) => p.id !== playerId);
    if (this.started) {
      const removedIndex = this.turnOrder.findIndex((entry) => entry.playerId === playerId);
      this.turnOrder = this.turnOrder.filter((entry) => entry.playerId !== playerId);
      // Removing an earlier slot shifts every later one down by one — correct the index so it
      // keeps pointing at the same (still-present) active player it did before the removal.
      // When the removed slot *was* the active one, no correction is needed: the next player
      // has shifted into that same index already.
      if (removedIndex !== -1 && removedIndex < this.turnOrderIndex) this.turnOrderIndex -= 1;
      if (this.turnOrder.length > 0) this.turnOrderIndex %= this.turnOrder.length;
      else this.turnOrderIndex = 0;
      if (wasActive && this.turn) {
        this.turn = null;
        this.clearTimer();
      }
    }
    this.broadcast();
  }

  /** Host-only, and only before the game has started. Evenly round-robins players across teams in random order. */
  shuffleTeams(requesterId: string) {
    if (requesterId !== this.hostId || this.started) return;
    const shuffled = [...this.players];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    shuffled.forEach((player, i) => {
      player.teamId = this.teams[i % this.teams.length].id;
    });
    this.broadcast();
  }

  /**
   * Host-only, lobby-only, one-shot: snapshots the current rules under a fresh GUID and starts
   * persisting word usage against it, so a room later created from the resulting link restores
   * these rules and never repeats a word this one already played. Once set, the GUID never
   * changes — there's no way to re-save under a different one.
   */
  saveRoom(requesterId: string) {
    if (requesterId !== this.hostId || this.started || this.savedRoomGuid) return;
    this.savedRoomGuid = crypto.randomUUID();
    createSavedRoom(this.savedRoomGuid, this.rules);
    this.broadcast();
  }

  /** Host-only. Leaves the lobby and picks the turn order, but doesn't start the first turn — the active player still has to tap "Начать ход". */
  startGame(requesterId: string) {
    if (this.started || requesterId !== this.hostId) return;
    this.turnOrder = buildTurnOrder(this.teams, this.players);
    if (this.turnOrder.length === 0) return;
    this.started = true;
    if (this.savedRoomGuid) incrementSavedRoomGamesPlayed(this.savedRoomGuid);
    this.broadcast();
  }

  /** Host-only escape hatch for a turn stuck on a disconnected player (dropped connection,
   * backgrounded tab that never reconnects) — advances the turn order past them without
   * requiring their "Начать ход" tap. Only applies between turns, never mid-turn: a turn already
   * in progress keeps running on the server's clock regardless of the explainer's connection, and
   * ends on its own via the existing timeout. */
  skipDisconnectedTurn(requesterId: string) {
    if (requesterId !== this.hostId || this.turn || this.turnOrder.length === 0) return;
    const activePlayer = this.players.find((p) => p.id === this.getActivePlayerId());
    if (activePlayer?.connected) return;
    for (let i = 0; i < this.turnOrder.length; i++) {
      this.turnOrderIndex = (this.turnOrderIndex + 1) % this.turnOrder.length;
      const next = this.players.find((p) => p.id === this.getActivePlayerId());
      if (next?.connected) break;
    }
    this.broadcast();
  }

  startTurn(requesterId: string) {
    if (!this.started || requesterId !== this.getActivePlayerId()) return;
    this.clearTimer();

    const entry = this.turnOrder[this.turnOrderIndex];
    const team = this.teams.find((t) => t.id === entry.teamId)!;

    const wordsNeeded = this.rules.limitWordsPerTurn ? this.rules.deckConfig.count : 1;
    let available = this.wordPool.filter((w) => !this.usedWordIds.has(w.id));
    if (available.length < wordsNeeded) {
      this.usedWordIds.clear();
      if (this.savedRoomGuid) clearSavedRoomUsedWordIds(this.savedRoomGuid);
      available = this.wordPool;
    }
    const deckConfig = this.rules.limitWordsPerTurn ? this.rules.deckConfig : scaledDeckConfig(available.length);
    const deck = buildDeck(available, deckConfig);
    // Not marked used here — with "Максимум слов в ходе" off, the deck is sized to the whole
    // available pool as a buffer, but only a handful of words actually get shown before time
    // runs out. Recorded instead once the turn ends, from whichever words were actually shown.

    this.turn = coreStartTurn(team.id, deck, this.rules.turnDurationMs, Date.now());
    // Server owns the clock — clients only render it, so the turn ends here even if no one taps a button.
    this.turnTimeout = setTimeout(() => {
      if (this.turn?.phase === "in_progress") this.endTurn();
    }, this.rules.turnDurationMs);
    this.broadcast();
  }

  markGuessed(requesterId: string) {
    if (!this.turn || this.turn.paused || requesterId !== this.getActivePlayerId()) return;
    const team = this.teams.find((t) => t.id === this.turn!.teamId);
    if (team) team.score += 1;
    this.turn = coreMarkGuessed(this.turn);
    if (this.turn.phase === "ended") {
      this.clearTimer();
      this.recordPlayedWords(this.turn);
    }
    this.broadcast();
  }

  markSkipped(requesterId: string) {
    if (!this.turn || this.turn.paused || !this.rules.allowSkip || requesterId !== this.getActivePlayerId()) return;
    this.turn = coreMarkSkipped(this.turn);
    if (this.turn.phase === "ended") {
      this.clearTimer();
      this.recordPlayedWords(this.turn);
    }
    this.broadcast();
  }

  /** Host-only: freezes the countdown and blocks guess/skip until resumed. */
  pauseTurn(requesterId: string) {
    if (!this.turn || this.turn.phase !== "in_progress" || this.turn.paused) return;
    if (requesterId !== this.hostId) return;
    this.clearTimer();
    this.turn = { ...this.turn, paused: true, pausedAt: Date.now() };
    this.broadcast();
  }

  /** Host-only: shifts startedAt forward by the paused duration so the remaining time is preserved. */
  resumeTurn(requesterId: string) {
    if (!this.turn || this.turn.phase !== "in_progress" || !this.turn.paused) return;
    if (requesterId !== this.hostId) return;
    const pausedDurationMs = Date.now() - (this.turn.pausedAt ?? Date.now());
    const startedAt = (this.turn.startedAt ?? Date.now()) + pausedDurationMs;
    this.turn = { ...this.turn, paused: false, pausedAt: null, startedAt };

    const remainingMs = this.turn.turnDurationMs - (Date.now() - startedAt);
    this.turnTimeout = setTimeout(
      () => {
        if (this.turn?.phase === "in_progress") this.endTurn();
      },
      Math.max(0, remainingMs),
    );
    this.broadcast();
  }

  endTurn() {
    if (!this.turn) return;
    this.turn = coreEndTurn(this.turn);
    this.clearTimer();
    this.recordPlayedWords(this.turn);
    this.broadcast();
  }

  /** Marks every word actually shown this turn (guessed or skipped — including the one left
   * pending when time ran out, which `coreEndTurn` folds into `skippedWordIds`) as used, both
   * for this live session's deck exclusion and, if saved, the persisted cross-session history.
   * Idempotent, so it's safe to call from more than one phase-ended path. */
  private recordPlayedWords(turn: TurnState) {
    if (turn.phase !== "ended") return;
    const playedIds = [...turn.guessedWordIds, ...turn.skippedWordIds];
    for (const id of playedIds) this.usedWordIds.add(id);
    if (this.savedRoomGuid) addSavedRoomUsedWordIds(this.savedRoomGuid, playedIds);
  }

  /** Only the player who just explained can flip a shown word's mark while reviewing the recap. */
  toggleWordMark(wordId: number, requesterId: string) {
    if (!this.turn || this.turn.phase !== "ended" || requesterId !== this.getActivePlayerId()) return;
    const team = this.teams.find((t) => t.id === this.turn!.teamId);
    const wasGuessed = this.turn.guessedWordIds.includes(wordId);
    const wasSkipped = this.turn.skippedWordIds.includes(wordId);
    if (!wasGuessed && !wasSkipped) return;
    if (wasGuessed) {
      this.turn = {
        ...this.turn,
        guessedWordIds: this.turn.guessedWordIds.filter((id) => id !== wordId),
        skippedWordIds: [...this.turn.skippedWordIds, wordId],
      };
      if (team) team.score -= 1;
    } else {
      this.turn = {
        ...this.turn,
        skippedWordIds: this.turn.skippedWordIds.filter((id) => id !== wordId),
        guessedWordIds: [...this.turn.guessedWordIds, wordId],
      };
      if (team) team.score += 1;
    }
    this.broadcast();
  }

  /** The player who just explained hands off to whoever's next in the turn order. Also allowed
   * for the host when that player is disconnected — otherwise a dropped connection during the
   * recap screen would strand the game on it forever, since no one else can tap "Передать ход". */
  nextTurn(requesterId: string) {
    const activePlayer = this.players.find((p) => p.id === this.getActivePlayerId());
    const hostOverride = requesterId === this.hostId && activePlayer?.connected === false;
    if (!this.turn || this.turn.phase !== "ended" || (requesterId !== this.getActivePlayerId() && !hostOverride)) return;
    this.turn = null;
    const winner = this.rules.limitScore ? hasWinner(this.teams, this.rules.winScore) : null;
    if (winner) {
      this.winnerId = winner.id;
    } else if (this.turnOrder.length > 0) {
      this.turnOrderIndex = (this.turnOrderIndex + 1) % this.turnOrder.length;
    }
    this.broadcast();
  }

  /** Host-only: reset scores and restart the round-robin from the top with the same teams/turn order. */
  playAgain(requesterId: string) {
    if (requesterId !== this.hostId) return;
    this.teams = this.teams.map((t) => ({ ...t, score: 0 }));
    // A saved room's word history spans every replay, not just the live session that started
    // it — only true exhaustion (handled in startTurn) clears it.
    if (!this.savedRoomGuid) this.usedWordIds.clear();
    else incrementSavedRoomGamesPlayed(this.savedRoomGuid);
    this.turnOrderIndex = 0;
    this.turn = null;
    this.winnerId = null;
    this.clearTimer();
    this.broadcast();
  }

  /** Host-only: return to the lobby so rules/teams can be reconfigured before starting again. */
  newSetup(requesterId: string) {
    if (requesterId !== this.hostId) return;
    this.started = false;
    this.teams = this.teams.map((t) => ({ ...t, score: 0 }));
    this.turn = null;
    this.winnerId = null;
    this.turnOrder = [];
    this.turnOrderIndex = 0;
    if (!this.savedRoomGuid) this.usedWordIds.clear();
    this.clearTimer();
    this.broadcast();
  }

  private getActivePlayerId(): string | null {
    return this.turnOrder[this.turnOrderIndex]?.playerId ?? null;
  }

  private clearTimer() {
    if (this.turnTimeout) {
      clearTimeout(this.turnTimeout);
      this.turnTimeout = null;
    }
  }

  broadcast() {
    const activePlayerId = this.getActivePlayerId();
    const activeTeamId = this.turn?.teamId ?? this.turnOrder[this.turnOrderIndex]?.teamId ?? null;
    for (const player of this.players) {
      if (!player.socket || player.socket.readyState !== player.socket.OPEN) continue;
      const isGuessingTeammate =
        this.turn?.phase === "in_progress" && player.id !== activePlayerId && player.teamId === activeTeamId;
      // Teammates never see the word (they'd be guessing it). Everyone else only sees it when the host allows it.
      const shouldHideWord =
        this.turn?.phase === "in_progress" &&
        player.id !== activePlayerId &&
        (isGuessingTeammate || !this.rules.showWordToOthers);
      const message: ServerMessage = {
        type: "room_state",
        roomCode: this.code,
        teams: this.teams,
        players: this.players.map((p) => ({ id: p.id, name: p.name, teamId: p.teamId, connected: p.connected })),
        hostId: this.hostId,
        yourId: player.id,
        rules: this.rules,
        started: this.started,
        activePlayerId,
        activePlayerConnected: this.players.find((p) => p.id === activePlayerId)?.connected ?? false,
        turn: shouldHideWord && this.turn ? { ...this.turn, deck: [] } : this.turn,
        winnerId: this.winnerId,
        savedRoomGuid: this.savedRoomGuid,
        hostAbandonDeadline: this.hostAbandonDeadline,
      };
      player.socket.send(JSON.stringify(message));
    }
  }

  hasTeam(teamId: string): boolean {
    return this.teams.some((t) => t.id === teamId);
  }

  /** Joining players don't pick a team themselves — only the host assigns teams (drag-and-drop in the lobby). */
  pickBalancedTeamId(): string {
    let best = this.teams[0];
    let bestCount = this.players.filter((p) => p.teamId === best.id).length;
    for (const team of this.teams.slice(1)) {
      const count = this.players.filter((p) => p.teamId === team.id).length;
      if (count < bestCount) {
        best = team;
        bestCount = count;
      }
    }
    return best.id;
  }

  hasPlayerName(name: string): boolean {
    const normalized = name.trim().toLowerCase();
    return this.players.some((p) => p.name.trim().toLowerCase() === normalized);
  }

  getTeams(): TeamState[] {
    return this.teams;
  }
}

function buildTeams(teamNames: string[]): TeamState[] {
  return teamNames.map((name, i) => ({ id: `team-${i}`, name, score: 0 }));
}

/**
 * Flattens team rosters into a single turn order, position-major: every team's
 * 1st player, then every team's 2nd player, etc. A team with fewer players simply
 * contributes fewer entries, so the cycle still wraps correctly once it reaches the end.
 */
function buildTurnOrder(
  teams: TeamState[],
  players: Array<{ id: string; teamId: string | null }>,
): Array<{ playerId: string; teamId: string }> {
  const rosters = teams.map((team) => players.filter((p) => p.teamId === team.id));
  const maxLen = Math.max(0, ...rosters.map((r) => r.length));
  const order: Array<{ playerId: string; teamId: string }> = [];
  for (let pos = 0; pos < maxLen; pos++) {
    teams.forEach((team, i) => {
      const player = rosters[i][pos];
      if (player) order.push({ playerId: player.id, teamId: team.id });
    });
  }
  return order;
}
