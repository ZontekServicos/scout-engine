/**
 * player-trend.engine.ts
 *
 * Computes a player's performance trend from their PlayerSeason history.
 *
 * Algorithm
 * ─────────────────────────────────────────────────────────────────────────────
 *   1. Sort seasons by seasonYear ascending.
 *   2. Run weighted linear regression on overall values — more recent seasons
 *      carry higher weight (weight = 1 + recencyBoost * (index / n)).
 *   3. Derive trendScore (0-100, 50 = stable), overallDelta, direction.
 *
 * trendScore interpretation
 *   80-100  Strong rise    (+3+ pts/year)
 *   60-79   Moderate rise  (+1.5 to +3)
 *   40-59   Stable         (±1.5)
 *   20-39   Moderate drop  (-1.5 to -3)
 *   0-19    Strong decline (-3+)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type TrendDirection = "rising" | "stable" | "declining";

export interface SeasonPoint {
  seasonYear: number;
  seasonLabel: string | null;
  overall: number | null;
  goals: number | null;
  assists: number | null;
  minutes: number | null;
  rating: number | null;
  marketValue: number | null;
  leagueName: string | null;
  teamName: string | null;
}

export interface PlayerTrend {
  direction:    TrendDirection;
  overallDelta: number;   // last season overall − first season overall
  slopePerYear: number;   // weighted regression slope (overall pts / year)
  trendScore:   number;   // 0-100  (50 = flat)
  seasonCount:  number;
  seasons:      SeasonPoint[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Slope needed to classify as rising/declining (overall pts/year). */
const SLOPE_THRESHOLD = 1.5;

/**
 * Clamp slope to [-6, +6] before converting to 0-100 so extreme outliers
 * (e.g. mock players created with static overall) don't saturate the score.
 */
const SLOPE_MAX = 6;

const RECENCY_BOOST = 1.5;  // most-recent season weight multiplier vs oldest

// ─── Core function ────────────────────────────────────────────────────────────

/**
 * Compute trend from an array of SeasonPoints.
 * Points that have null overall are ignored in regression but kept in output.
 */
export function computePlayerTrend(seasons: SeasonPoint[]): PlayerTrend {
  const sorted = [...seasons].sort((a, b) => a.seasonYear - b.seasonYear);

  const withOverall = sorted.filter((s) => s.overall != null) as (SeasonPoint & { overall: number })[];

  if (withOverall.length < 2) {
    return {
      direction:    "stable",
      overallDelta: 0,
      slopePerYear: 0,
      trendScore:   50,
      seasonCount:  sorted.length,
      seasons:      sorted,
    };
  }

  // Weighted linear regression: y = overall, x = seasonYear
  const n = withOverall.length;
  const weights = withOverall.map((_, i) => 1 + RECENCY_BOOST * (i / (n - 1)));

  const W  = weights.reduce((a, w) => a + w, 0);
  const Wx = withOverall.reduce((a, s, i) => a + weights[i] * s.seasonYear, 0);
  const Wy = withOverall.reduce((a, s, i) => a + weights[i] * s.overall, 0);
  const Wx2 = withOverall.reduce((a, s, i) => a + weights[i] * s.seasonYear ** 2, 0);
  const Wxy = withOverall.reduce((a, s, i) => a + weights[i] * s.seasonYear * s.overall, 0);

  const denom = W * Wx2 - Wx ** 2;
  const slope = denom === 0 ? 0 : (W * Wxy - Wx * Wy) / denom;

  const clamped = Math.max(-SLOPE_MAX, Math.min(SLOPE_MAX, slope));

  // Map [-SLOPE_MAX, +SLOPE_MAX] → [0, 100] linearly
  const trendScore = Math.round(((clamped + SLOPE_MAX) / (2 * SLOPE_MAX)) * 100);

  const overallDelta = withOverall[n - 1].overall - withOverall[0].overall;

  const direction: TrendDirection =
    slope >= SLOPE_THRESHOLD  ? "rising"   :
    slope <= -SLOPE_THRESHOLD ? "declining" :
    "stable";

  return {
    direction,
    overallDelta,
    slopePerYear: Math.round(slope * 10) / 10,
    trendScore,
    seasonCount: sorted.length,
    seasons:     sorted,
  };
}
