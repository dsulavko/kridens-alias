import type { TeamState } from "./types.js";

export function hasWinner(teams: TeamState[], winScore: number): TeamState | null {
  return teams.find((t) => t.score >= winScore) ?? null;
}
