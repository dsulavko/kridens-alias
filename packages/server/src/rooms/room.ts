import type { WebSocket } from "ws";
import {
  buildDeck,
  markGuessed as coreMarkGuessed,
  markSkipped as coreMarkSkipped,
  endTurn as coreEndTurn,
  startTurn as coreStartTurn,
  DEFAULT_DECK_CONFIG,
  DEFAULT_TURN_DURATION_MS,
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
  private teams: TeamState[];
  private players: Player[] = [];
  private usedWordIds = new Set<number>();
  private turn: TurnState | null = null;
  private currentTeamIndex = 0;
  private turnTimeout: NodeJS.Timeout | null = null;

  constructor(code: string, teamNames: string[], private wordPool: Word[]) {
    this.code = code;
    this.teams = teamNames.map((name, i) => ({ id: `team-${i}`, name, score: 0 }));
  }

  addPlayer(player: Player) {
    this.players.push(player);
  }

  removeSocket(socket: WebSocket) {
    this.players = this.players.filter((p) => p.socket !== socket);
  }

  startTurn() {
    this.clearTimer();

    const team = this.teams[this.currentTeamIndex];
    const available = this.wordPool.filter((w) => !this.usedWordIds.has(w.id));

    if (available.length < DEFAULT_DECK_CONFIG.count) {
      this.usedWordIds.clear();
    }

    const pool = this.wordPool.filter((w) => !this.usedWordIds.has(w.id));
    const deck = buildDeck(pool, DEFAULT_DECK_CONFIG);
    for (const word of deck) this.usedWordIds.add(word.id);

    this.turn = coreStartTurn(team.id, deck, DEFAULT_TURN_DURATION_MS, Date.now());
    // Server owns the clock — clients only render it, so the turn ends here even if no one taps a button.
    this.turnTimeout = setTimeout(() => {
      if (this.turn?.phase === "in_progress") this.endTurn();
    }, DEFAULT_TURN_DURATION_MS);
    this.broadcast();
  }

  markGuessed() {
    if (!this.turn) return;
    const team = this.teams.find((t) => t.id === this.turn!.teamId);
    if (team) team.score += 1;
    this.turn = coreMarkGuessed(this.turn);
    this.advanceTeamIfEnded();
    this.broadcast();
  }

  markSkipped() {
    if (!this.turn) return;
    this.turn = coreMarkSkipped(this.turn);
    this.advanceTeamIfEnded();
    this.broadcast();
  }

  endTurn() {
    if (!this.turn) return;
    this.turn = coreEndTurn(this.turn);
    this.advanceTeamIfEnded();
    this.broadcast();
  }

  private advanceTeamIfEnded() {
    if (this.turn?.phase === "ended") {
      this.clearTimer();
      this.currentTeamIndex = (this.currentTeamIndex + 1) % this.teams.length;
    }
  }

  private clearTimer() {
    if (this.turnTimeout) {
      clearTimeout(this.turnTimeout);
      this.turnTimeout = null;
    }
  }

  broadcast() {
    const message: ServerMessage = {
      type: "room_state",
      roomCode: this.code,
      teams: this.teams,
      turn: this.turn,
    };
    const payload = JSON.stringify(message);
    for (const player of this.players) {
      if (player.socket.readyState === player.socket.OPEN) {
        player.socket.send(payload);
      }
    }
  }

  hasTeam(teamId: string): boolean {
    return this.teams.some((t) => t.id === teamId);
  }

  getTeams(): TeamState[] {
    return this.teams;
  }
}
