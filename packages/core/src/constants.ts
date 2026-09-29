import type { DeckConfig } from "./types.js";

export const DEFAULT_DECK_CONFIG: DeckConfig = { count: 10, targetWeightSum: 30, tolerance: 3 };
export const DEFAULT_TURN_DURATION_MS = 60_000;

/** Scales targetWeightSum/tolerance from DEFAULT_DECK_CONFIG's per-word average to a custom deck size. */
export function scaledDeckConfig(count: number): DeckConfig {
  const avgWeight = DEFAULT_DECK_CONFIG.targetWeightSum / DEFAULT_DECK_CONFIG.count;
  return {
    count,
    targetWeightSum: Math.round(count * avgWeight),
    tolerance: Math.max(2, Math.round(count * 0.3)),
  };
}
