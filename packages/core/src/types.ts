export type Category = "noun" | "phrase";

export type WordStatus = "approved" | "pending" | "rejected";

/** Weight scale: 1 (common/easy) .. 5 (rare/hard). */
export type Weight = 1 | 2 | 3 | 4 | 5;

export interface Word {
  id: number;
  text: string;
  category: Category;
  weight: Weight;
}

export interface DeckConfig {
  /** How many words make up one turn's deck. */
  count: number;
  /** Target sum of weights across the deck. */
  targetWeightSum: number;
  /** Allowed deviation from targetWeightSum. */
  tolerance: number;
}

export interface TeamState {
  id: string;
  name: string;
  score: number;
}

export type TurnPhase = "idle" | "in_progress" | "ended";

export interface TurnState {
  phase: TurnPhase;
  teamId: string;
  deck: Word[];
  /** Index into deck of the word currently shown. */
  currentIndex: number;
  guessedWordIds: number[];
  skippedWordIds: number[];
  /** Unix ms timestamp when the turn started, for timer sync. */
  startedAt: number | null;
  turnDurationMs: number;
}

// --- Client <-> Server protocol -------------------------------------------

export type ClientMessage =
  | { type: "create_room"; playerName: string; teamNames: string[] }
  | { type: "join_room"; roomCode: string; playerName: string; teamId: string }
  | { type: "start_turn" }
  | { type: "mark_guessed" }
  | { type: "mark_skipped" }
  | { type: "end_turn" };

export type ServerMessage =
  | { type: "room_state"; roomCode: string; teams: TeamState[]; turn: TurnState | null }
  | { type: "error"; message: string };
