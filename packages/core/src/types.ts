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

/** Full row shape for the admin console — includes moderation/metadata fields the game client never sees. */
export interface AdminWord {
  id: number;
  text: string;
  category: Category;
  weight: Weight;
  status: WordStatus;
  sourceFreq: number | null;
  createdAt: number;
  source: string | null;
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

export interface RoomRules {
  teamNames: string[];
  deckConfig: DeckConfig;
  limitWordsPerTurn: boolean;
  turnDurationMs: number;
  winScore: number;
  limitScore: boolean;
  allowSkip: boolean;
}

export interface PlayerInfo {
  id: string;
  name: string;
  teamId: string;
}

export type ClientMessage =
  | { type: "create_room"; playerName: string }
  | { type: "join_room"; roomCode: string; playerName: string }
  | { type: "update_rules"; rules: RoomRules }
  | { type: "assign_player"; playerId: string; teamId: string }
  | { type: "shuffle_teams" }
  | { type: "start_turn" }
  | { type: "mark_guessed" }
  | { type: "mark_skipped" }
  | { type: "end_turn" }
  | { type: "toggle_word"; wordId: number }
  | { type: "next_turn" }
  | { type: "play_again" }
  | { type: "new_setup" }
  | { type: "leave_room" }
  | { type: "close_room" };

export type ServerMessage =
  | {
      type: "room_state";
      roomCode: string;
      teams: TeamState[];
      players: PlayerInfo[];
      hostId: string;
      yourId: string;
      rules: RoomRules;
      started: boolean;
      activePlayerId: string | null;
      turn: TurnState | null;
      winnerId: string | null;
    }
  | { type: "error"; message: string }
  | { type: "room_closed" };
