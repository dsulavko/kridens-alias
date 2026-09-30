import type { DeckConfig, RoomRules } from "./types.js";

export const DEFAULT_DECK_CONFIG: DeckConfig = { count: 10, targetWeightSum: 30, tolerance: 3 };
export const DEFAULT_TURN_DURATION_MS = 60_000;

/** Codename pool for team names (max team count). New teams pick the next unused name from this list. */
export const TEAM_CODE_NAMES = [
  "Токио",
  "Берлин",
  "Москва",
  "Денвер",
  "Рио",
  "Найроби",
  "Хельсинки",
  "Осло",
  "Лиссабон",
  "Стокгольм",
];

export function defaultRoomRules(teamNames: string[] = TEAM_CODE_NAMES.slice(0, 2)): RoomRules {
  return {
    teamNames,
    deckConfig: DEFAULT_DECK_CONFIG,
    limitWordsPerTurn: false,
    turnDurationMs: DEFAULT_TURN_DURATION_MS,
    winScore: 20,
    limitScore: false,
    allowSkip: true,
  };
}

/** Scales targetWeightSum/tolerance from DEFAULT_DECK_CONFIG's per-word average to a custom deck size. */
export function scaledDeckConfig(count: number): DeckConfig {
  const avgWeight = DEFAULT_DECK_CONFIG.targetWeightSum / DEFAULT_DECK_CONFIG.count;
  return {
    count,
    targetWeightSum: Math.round(count * avgWeight),
    tolerance: Math.max(2, Math.round(count * 0.3)),
  };
}
