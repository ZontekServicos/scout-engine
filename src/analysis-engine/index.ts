// ---------------------------------------------------------------------------
// analysis-engine — public API
//
// Usage:
//   import { compareNormalized, compareFromMocks, generateReport } from "./analysis-engine";
// ---------------------------------------------------------------------------

export type {
  NormalizedPlayerStats,
  PlayerComparisonOutput,
  DimensionResult,
  Winner,
} from "./types";

export { normalizeFromRaw, normalizeFromPlain } from "./normalizers/stats.normalizer";
export { mapSportmonksToNormalized } from "./mappers/sportmonks.mapper";
export { comparePlayers } from "./comparators/player.comparator";
export { generateComparisonReport, generateComparisonText } from "./report-generator/comparison.report";
export { MOCK_PLAYERS, getMockPlayer, getMockPlayersByPosition } from "./mocks/players.mock";

import { comparePlayers } from "./comparators/player.comparator";
import { generateComparisonReport } from "./report-generator/comparison.report";
import { getMockPlayer } from "./mocks/players.mock";
import type { NormalizedPlayerStats, PlayerComparisonOutput } from "./types";

/**
 * Compare two NormalizedPlayerStats and return a complete report including analysis text.
 */
export function compareNormalized(
  playerA: NormalizedPlayerStats,
  playerB: NormalizedPlayerStats,
): PlayerComparisonOutput {
  const result = comparePlayers(playerA, playerB);
  return generateComparisonReport(result);
}

/**
 * Compare two mock players by their mock IDs.
 * Throws if either player is not found in the mock dataset.
 */
export function compareFromMocks(
  idA: string,
  idB: string,
): PlayerComparisonOutput {
  const playerA = getMockPlayer(idA);
  const playerB = getMockPlayer(idB);

  if (!playerA) throw new Error(`Mock player not found: ${idA}`);
  if (!playerB) throw new Error(`Mock player not found: ${idB}`);

  return compareNormalized(playerA, playerB);
}
