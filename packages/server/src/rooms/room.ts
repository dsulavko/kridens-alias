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
  private usedWordIds = new Set<number>();
  private turn: TurnState | null = null;
  private turnOrder: Array<{ playerId: string; teamId: string }> = [];
  private turnOrderIndex = 0;
  private turnTimeout: NodeJS.Timeout | null = null;
  private started = false;
  private winnerId: string | null = null;

  constructor(code: string, hostId: string, private wordPool: Word[]) {
    this.code = code;
    this.hostId = hostId;
    this.rules = defaultRoomRules();
    this.teams = buildTeams(this.rules.teamNames);
  }

  addPlayer(player: Player) {
    this.players.push(player);
  }

  removeSocket(socket: WebSocket) {
    this.players = this.players.filter((p) => p.socket !== socket);
  }

  /** Host-only, and only before the game has started — teams/deck/timer are locked in once play begins. */
  updateRules(rules: RoomRules, requesterId: string) {
    if (requesterId !== this.hostId || this.started) return;
    this.rules = rules;
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

  startTurn(requesterId: string) {
    if (!this.started) {
      if (requesterId !== this.hostId) return;
      this.turnOrder = buildTurnOrder(this.teams, this.players);
      if (this.turnOrder.length === 0) return;
      this.started = true;
    } else if (requesterId !== this.getActivePlayerId()) {
      return;
    }
    this.clearTimer();

    const entry = this.turnOrder[this.turnOrderIndex];
    const team = this.teams.find((t) => t.id === entry.teamId)!;

    const wordsNeeded = this.rules.limitWordsPerTurn ? this.rules.deckConfig.count : 1;
    let available = this.wordPool.filter((w) => !this.usedWordIds.has(w.id));
    if (available.length < wordsNeeded) {
      this.usedWordIds.clear();
      available = this.wordPool;
    }
    const deckConfig = this.rules.limitWordsPerTurn ? this.rules.deckConfig : scaledDeckConfig(available.length);
    const deck = buildDeck(available, deckConfig);
    for (const word of deck) this.usedWordIds.add(word.id);

    this.turn = coreStartTurn(team.id, deck, this.rules.turnDurationMs, Date.now());
    // Server owns the clock — clients only render it, so the turn ends here even if no one taps a button.
    this.turnTimeout = setTimeout(() => {
      if (this.turn?.phase === "in_progress") this.endTurn();
    }, this.rules.turnDurationMs);
    this.broadcast();
  }

  markGuessed(requesterId: string) {
    if (!this.turn || requesterId !== this.getActivePlayerId()) return;
    const team = this.teams.find((t) => t.id === this.turn!.teamId);
    if (team) team.score += 1;
    this.turn = coreMarkGuessed(this.turn);
    if (this.turn.phase === "ended") this.clearTimer();
    this.broadcast();
  }

  markSkipped(requesterId: string) {
    if (!this.turn || !this.rules.allowSkip || requesterId !== this.getActivePlayerId()) return;
    this.turn = coreMarkSkipped(this.turn);
    if (this.turn.phase === "ended") this.clearTimer();
    this.broadcast();
  }

  endTurn() {
    if (!this.turn) return;
    this.turn = coreEndTurn(this.turn);
    this.clearTimer();
    this.broadcast();
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
    this.usedWordIds.clear();
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
    this.usedWordIds.clear();
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
        turn: isGuessingTeammate && this.turn ? { ...this.turn, deck: [] } : this.turn,
        winnerId: this.winnerId,
      };
      player.socket.send(JSON.stringify(message));
    }
  }

  hasTeam(teamId: string): boolean {
    return this.teams.some((t) => t.id === teamId);
  }

  getTeams(): TeamState[] {
    return this.teams;
  }

  getPublicTeams(): Array<{ id: string; name: string }> {
    return this.teams.map((t) => ({ id: t.id, name: t.name }));
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
