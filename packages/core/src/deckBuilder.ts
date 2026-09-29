import { createRng, randomSeed } from "./rng.js";
import type { DeckConfig, Word } from "./types.js";

const MAX_SWAP_ATTEMPTS = 500;

function shuffle<T>(items: T[], rng: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function sumWeights(words: Word[]): number {
  return words.reduce((sum, w) => sum + w.weight, 0);
}

function distanceToTarget(sum: number, config: DeckConfig): number {
  const diff = sum - config.targetWeightSum;
  const overTolerance = Math.abs(diff) - config.tolerance;
  return Math.max(0, overTolerance);
}

/**
 * Picks `config.count` words from `pool` whose weights sum within
 * `targetWeightSum ± tolerance`, so every deck represents comparable
 * total difficulty regardless of which individual weights it contains.
 *
 * Pure function: the caller is responsible for excluding words already
 * used earlier in the session before passing `pool` in.
 */
export function buildDeck(pool: Word[], config: DeckConfig, seed: number = randomSeed()): Word[] {
  if (pool.length < config.count) {
    throw new Error(`Word pool too small: need ${config.count}, have ${pool.length}`);
  }

  const rng = createRng(seed);
  const shuffledPool = shuffle(pool, rng);

  let deck = shuffledPool.slice(0, config.count);
  const outside = shuffledPool.slice(config.count);

  let bestDeck = deck;
  let bestDistance = distanceToTarget(sumWeights(deck), config);

  for (let attempt = 0; attempt < MAX_SWAP_ATTEMPTS && bestDistance > 0; attempt++) {
    if (outside.length === 0) break;

    const deckIdx = Math.floor(rng() * deck.length);
    const outsideIdx = Math.floor(rng() * outside.length);

    const candidate = [...deck];
    const swappedOut = candidate[deckIdx];
    candidate[deckIdx] = outside[outsideIdx];

    const candidateDistance = distanceToTarget(sumWeights(candidate), config);
    if (candidateDistance < bestDistance) {
      outside[outsideIdx] = swappedOut;
      deck = candidate;
      bestDeck = candidate;
      bestDistance = candidateDistance;
    }
  }

  return applySoftOrdering(bestDeck, rng);
}

/** Shuffles final order, nudging apart consecutive max-weight (5) words. */
function applySoftOrdering(deck: Word[], rng: () => number): Word[] {
  const ordered = shuffle(deck, rng);
  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i].weight === 5 && ordered[i - 1].weight === 5) {
      const swapWith = ordered.findIndex((w, idx) => idx > i && w.weight !== 5);
      if (swapWith !== -1) {
        [ordered[i], ordered[swapWith]] = [ordered[swapWith], ordered[i]];
      }
    }
  }
  return ordered;
}
