/** Category names are admin-managed (see the admin console's Categories page), not a fixed set. */
export type Category = string;

export type WordStatus = "approved" | "pending" | "rejected";

/** Weight scale: 1 (common/easy) .. 5 (rare/hard). */
export type Weight = 1 | 2 | 3 | 4 | 5;

export interface Word {
  id: number;
  text: string;
  category: Category;
  weight: Weight;
}

/** Full row shape for the admin console — includes moderation/metadata fields the game client never sees.
 * Unlike the game-facing `Word`, a word can be tagged with several categories here. */
export interface AdminWord {
  id: number;
  text: string;
  categories: Category[];
  weight: Weight;
  status: WordStatus;
  sourceFreq: number | null;
  createdAt: number;
  source: string | null;
}

export interface CategoryInfo {
  id: number;
  name: string;
  wordCount: number;
}

export type CollectionType = "static" | "dynamic";

/** Dynamic collections match words by these fields instead of an explicit word_collections link
 * (and, unconditionally, only words with `status: "approved"`). Each field is a multiselect: an
 * unset/empty field matches any value, a non-empty one matches a word whose value is any of the
 * listed options (OR within a field, AND across fields). */
export interface CollectionFilter {
  category?: Category[] | null;
  source?: string[] | null;
  weight?: Weight[] | null;
}

export interface CollectionInfo {
  id: number;
  name: string;
  wordCount: number;
  createdAt: number;
  type: CollectionType;
  /** Non-null only for dynamic collections. */
  filter: CollectionFilter | null;
}

/** Admin console's view of a host-saved room — see Room.saveRoom() for how these accumulate. */
export interface SavedRoomInfo {
  guid: string;
  createdAt: number;
  gamesPlayed: number;
  wordCount: number;
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
  /** Host-only: freezes the clock and blocks guess/skip actions until resumed. */
  paused: boolean;
  /** Unix ms timestamp when the pause began, so the server can shift startedAt forward on resume. */
  pausedAt: number | null;
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
  /** When false, only the explaining player sees the current word; others just see the timer. */
  showWordToOthers: boolean;
  /** Restricts the word pool to one collection; null/absent means every approved word. Cycles
   * back to the start once exhausted, same as the unrestricted pool already does. */
  collectionId?: number | null;
}

export interface PlayerInfo {
  id: string;
  name: string;
  /** Null means "in the room but not on any team" — see Room.removeFromTeam. Such a player sits
   * out of the turn order entirely until the host assigns them (or the game) a team. */
  teamId: string | null;
  /** False while this player's socket is disconnected but their seat is held open for
   * reconnection (e.g. a dropped connection mid-game) — see Room.removeSocket/reconnectPlayer. */
  connected: boolean;
}

export type TeamReorderDirection = "up" | "down";

export type ClientMessage =
  | { type: "create_room"; playerName: string; clientId: string; savedRoomGuid?: string }
  | { type: "join_room"; roomCode: string; playerName: string; clientId: string }
  /** Sent automatically by the client after a dropped connection (or a page reload that kept
   * `clientId` in sessionStorage) to reclaim an existing seat instead of joining as a new player. */
  | { type: "rejoin_room"; roomCode: string; clientId: string }
  | { type: "update_rules"; rules: RoomRules }
  | { type: "assign_player"; playerId: string; teamId: string }
  /** Host-only, lobby-only: swaps a player with their same-team neighbor above/below — the
   * resulting team order is what `start_game` turns into the turn order. */
  | { type: "reorder_team_player"; playerId: string; direction: TeamReorderDirection }
  /** Host-only: takes a player off their team without removing them from the room — they're
   * still present (e.g. to reassign later) but sit out of the turn order until reassigned. */
  | { type: "remove_from_team"; playerId: string }
  /** Host-only: removes a player from the room entirely (e.g. they're stuck disconnected and
   * won't come back). Unlike `remove_from_team`, this also drops their turn-order slot and, if
   * they were mid-turn when kicked, ends that turn immediately. */
  | { type: "kick_player"; playerId: string }
  | { type: "shuffle_teams" }
  | { type: "start_game" }
  | { type: "save_room" }
  | { type: "start_turn" }
  | { type: "mark_guessed" }
  | { type: "mark_skipped" }
  | { type: "end_turn" }
  | { type: "pause_turn" }
  | { type: "resume_turn" }
  | { type: "toggle_word"; wordId: number }
  | { type: "next_turn" }
  /** Host-only: advances past a disconnected player whose turn is stuck between turns (they
   * never tapped "Начать ход" / "Передать ход"). See Room.skipDisconnectedTurn. */
  | { type: "skip_disconnected_turn" }
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
      /** False when the active player's socket is currently disconnected — lets clients show a
       * "waiting for reconnection" state instead of a stuck blank name, and lets the host see
       * when `skip_disconnected_turn` is available. */
      activePlayerConnected: boolean;
      turn: TurnState | null;
      winnerId: string | null;
      /** Set once the host saves the room — a link built from it recreates a room whose word
       * pool excludes everything already played under this GUID, across however many separate
       * live sessions. Null until saved; `save_room` is a one-shot action, so it never changes
       * back. */
      savedRoomGuid: string | null;
      /** Unix ms timestamp when this room will be force-closed because its host has been
       * disconnected too long — null whenever the host is connected (or still within the initial
       * grace period, before the countdown starts). Clients compute their own remaining-seconds
       * display from this against their local clock, the same way the turn timer does, rather
       * than trust a server-pushed countdown number that could desync from message delivery
       * delays. Cleared the moment the host reconnects. */
      hostAbandonDeadline: number | null;
    }
  | { type: "error"; message: string }
  | { type: "room_closed" }
  /** Sent to a player's own socket right before the host's `kick_player` removes them from the
   * room — distinct from `room_closed` (whole room gone) since everyone else keeps playing. */
  | { type: "kicked" };
