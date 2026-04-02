import type { NormalizedPlayerStats } from "../types";
import type { RawStats } from "../../integrations/sportmonks/pipeline/normalize-stats";

// ---------------------------------------------------------------------------
// Transforms the internal RawStats (from Sportmonks pipeline) into the
// canonical NormalizedPlayerStats used by the analysis-engine.
// ---------------------------------------------------------------------------

function safe(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * Convert Sportmonks-pipeline RawStats into the engine's NormalizedPlayerStats.
 */
export function normalizeFromRaw(
  raw: RawStats,
  meta: {
    playerId: string;
    playerName: string;
    teamId: string | null;
    teamName: string | null;
    position: string | null;
    age: number | null;
    season?: string;
  },
): NormalizedPlayerStats {
  const apps = Math.max(raw.appearances, 1);
  const season = meta.season ?? "2024/25";

  return {
    playerId: meta.playerId,
    playerName: meta.playerName,
    teamId: meta.teamId,
    teamName: meta.teamName,
    position: meta.position,
    age: meta.age,
    season,

    goals: raw.goals,
    assists: raw.assists,
    shots: raw.shotsTotal,
    shotsOnTarget: raw.shotsOnTarget,
    keyPasses: raw.keyPasses,
    passes: raw.passesTotal,
    passAccuracy: raw.passAccuracyPct,

    xG: round2(raw.xG),
    xA: round2(raw.xA),

    tackles: raw.tackles,
    interceptions: raw.interceptions,
    pressures: raw.pressures,

    minutesPlayed: raw.minutesPlayed,
    appearances: raw.appearances,
    rating: raw.rating,

    goalsPerGame: round2(safe(raw.goals, apps)),
    assistsPerGame: round2(safe(raw.assists, apps)),
    xGPerGame: round2(safe(raw.xG, apps)),
    xAPerGame: round2(safe(raw.xA, apps)),
    keyPassesPerGame: round2(safe(raw.keyPasses, apps)),
  };
}

/**
 * Build NormalizedPlayerStats directly from a plain stats object.
 * Useful for mock data and manual overrides.
 */
export function normalizeFromPlain(
  plain: {
    goals: number;
    assists: number;
    shots: number;
    shotsOnTarget: number;
    keyPasses: number;
    passes: number;
    passAccuracy: number;
    xG: number;
    xA: number;
    tackles: number;
    interceptions: number;
    pressures: number;
    minutesPlayed: number;
    appearances: number;
    rating: number;
  },
  meta: {
    playerId: string;
    playerName: string;
    teamId: string | null;
    teamName: string | null;
    position: string | null;
    age: number | null;
    season?: string;
  },
): NormalizedPlayerStats {
  const apps = Math.max(plain.appearances, 1);

  return {
    ...plain,
    playerId: meta.playerId,
    playerName: meta.playerName,
    teamId: meta.teamId,
    teamName: meta.teamName,
    position: meta.position,
    age: meta.age,
    season: meta.season ?? "2024/25",
    goalsPerGame: round2(safe(plain.goals, apps)),
    assistsPerGame: round2(safe(plain.assists, apps)),
    xGPerGame: round2(safe(plain.xG, apps)),
    xAPerGame: round2(safe(plain.xA, apps)),
    keyPassesPerGame: round2(safe(plain.keyPasses, apps)),
  };
}
