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

interface Player {
  id: string;
  name: string;
  teamId: string;
  socket: WebSocket;
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

  constructor(code: string, hostId: string, private wordPool: Word[], options: RoomOptions = {}) {
    this.code = code;
    this.hostId = hostId;
    this.rules = options.initialRules ?? defaultRoomRules();
    this.teams = buildTeams(this.rules.teamNames);
    this.savedRoomGuid = options.savedRoomGuid ?? null;
    this.usedWordIds = new Set(options.initialUsedWordIds ?? []);
  }

  addPlayer(player: Player) {
    this.players.push(player);
  }

  /** Self-service: a joined (non-host) player leaving the room before it starts. */
  removePlayer(playerId: string) {
    this.players = this.players.filter((p) => p.id !== playerId);
    this.broadcast();
  }

  removeSocket(socket: WebSocket) {
    this.players = this.players.filter((p) => p.socket !== socket);
  }

  /** Host-only: tell everyone the room is gone before the manager tears it down. */
  close(requesterId: string): boolean {
    if (requesterId !== this.hostId) return false;
    const message: ServerMessage = { type: "room_closed" };
    for (const player of this.players) {
      if (player.socket.readyState !== player.socket.OPEN) continue;
      player.socket.send(JSON.stringify(message));
    }
    return true;
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
      if (!validTeamIds.has(player.teamId)) player.teamId = this.teams[0].id;
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

  /** The player who just explained hands off to whoever's next in the turn order. */
  nextTurn(requesterId: string) {
    if (!this.turn || this.turn.phase !== "ended" || requesterId !== this.getActivePlayerId()) return;
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
      if (player.socket.readyState !== player.socket.OPEN) continue;
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
        players: this.players.map((p) => ({ id: p.id, name: p.name, teamId: p.teamId })),
        hostId: this.hostId,
        yourId: player.id,
        rules: this.rules,
        started: this.started,
        activePlayerId,
        turn: shouldHideWord && this.turn ? { ...this.turn, deck: [] } : this.turn,
        winnerId: this.winnerId,
        savedRoomGuid: this.savedRoomGuid,
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
  players: Array<{ id: string; teamId: string }>,
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
