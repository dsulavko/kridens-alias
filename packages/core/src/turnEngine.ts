import type { TurnState, Word } from "./types.js";

/**
 * Pure reducer for turn state. Both the single-device client and the
 * multiplayer server call these same functions, so game rules can't
 * drift between the two modes.
 */

export function startTurn(teamId: string, deck: Word[], turnDurationMs: number, now: number): TurnState {
  return {
    phase: "in_progress",
    teamId,
    deck,
    currentIndex: 0,
    guessedWordIds: [],
    skippedWordIds: [],
    startedAt: now,
    turnDurationMs,
  };
}

export function markGuessed(state: TurnState): TurnState {
  return advance(state, "guessedWordIds");
}

export function markSkipped(state: TurnState): TurnState {
  return advance(state, "skippedWordIds");
}

function advance(state: TurnState, listKey: "guessedWordIds" | "skippedWordIds"): TurnState {
  if (state.phase !== "in_progress") return state;

  const currentWord = state.deck[state.currentIndex];
  const nextIndex = state.currentIndex + 1;
  const deckExhausted = nextIndex >= state.deck.length;

  return {
    ...state,
    [listKey]: [...state[listKey], currentWord.id],
    currentIndex: nextIndex,
    phase: deckExhausted ? "ended" : state.phase,
  };
}

export function endTurn(state: TurnState): TurnState {
  if (state.phase !== "in_progress") return state;

  // The word on screen when the timer runs out was never explicitly
  // guessed or skipped. Fold it into the deck as "skipped" (unanswered)
  // by default, so it shows up in the recap and can be toggled to
  // "guessed" there, same as any other word.
  const pending = state.deck[state.currentIndex];
  const alreadyResolved =
    pending && (state.guessedWordIds.includes(pending.id) || state.skippedWordIds.includes(pending.id));

  if (!pending || alreadyResolved) {
    return { ...state, phase: "ended" };
  }

  return {
    ...state,
    phase: "ended",
    skippedWordIds: [...state.skippedWordIds, pending.id],
    currentIndex: state.currentIndex + 1,
  };
}

export function isTimeUp(state: TurnState, now: number): boolean {
  if (state.startedAt === null) return false;
  return now - state.startedAt >= state.turnDurationMs;
}

export function currentWord(state: TurnState): Word | null {
  if (state.phase !== "in_progress") return null;
  return state.deck[state.currentIndex] ?? null;
}
