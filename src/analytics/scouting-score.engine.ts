/**
 * scouting-score.engine.ts
 *
 * Composite score for identifying promising players (hidden gems, smart ranking).
 *
 * FORMULA  (0-100)
 * ─────────────────────────────────────────────────────────────────────────────
 *   overallScore  40%  — current overall normalised to 40-85 range
 *   trendScore    30%  — from player-trend.engine (0-100, 50=stable)
 *   valueScore    20%  — quality per million € of market value
 *   ceilingScore  10%  — (potential gap) × youth factor
 *
 * Labels
 *   ELITE_PROSPECT  — total >= 75 + rising
 *   RISING_STAR     — rising + age <= 23
 *   VALUE_PICK      — high valueScore + not declining
 *   STABLE          — direction stable
 *   DECLINING       — direction declining or total < 35
 */

import type { PlayerTrend } from "./player-trend.engine";

// ─── Types ────────────────────────────────────────────────────────────────────

export type ScoutingLabel =
  | "ELITE_PROSPECT"
  | "RISING_STAR"
  | "VALUE_PICK"
  | "STABLE"
  | "DECLINING";

export interface ScoutingScoreInput {
  overall:     number | null;
  potential:   number | null;
  marketValue: number | null;  // raw euros
  age:         number | null;
  trend:       PlayerTrend | null;
}

export interface ScoutingScoreBreakdown {
  overallScore:  number;  // 0-100 component (before weight)
  trendScore:    number;  // 0-100 component
  valueScore:    number;  // 0-100 component
  ceilingScore:  number;  // 0-100 component
}

export interface ScoutingScore {
  total:     number;
  label:     ScoutingLabel;
  breakdown: ScoutingScoreBreakdown;
}

// ─── Weights ─────────────────────────────────────────────────────────────────

const W_OVERALL  = 0.40;
const W_TREND    = 0.30;
const W_VALUE    = 0.20;
const W_CEILING  = 0.10;

// ─── Normalisation helpers ────────────────────────────────────────────────────

/** Maps overall [40, 85] → [0, 100]. Values outside range are clamped. */
function normaliseOverall(overall: number): number {
  return Math.max(0, Math.min(100, ((overall - 40) / 45) * 100));
}

/**
 * Value efficiency: overall / (marketValue in M€).
 * Elite reference: overall 80 for 10M€ = 8 pts/M€ → score 100.
 * Minimum reference: anything below 1 pt/M€ → score 0.
 */
function normaliseValueScore(overall: number, marketValueEuros: number): number {
  const mvM = marketValueEuros / 1_000_000;
  if (mvM <= 0) return 0;
  const ratio = overall / mvM;
  return Math.max(0, Math.min(100, (ratio / 8) * 100));
}

/**
 * Ceiling score: rewards young players with large potential gap.
 * youthFactor: age 16 → 1.0, age 24 → 0.5, age 30+ → 0
 * gap = (potential - overall), clamped 0-20
 */
function normaliseCeilingScore(overall: number, potential: number, age: number): number {
  const gap = Math.max(0, Math.min(20, potential - overall));
  const youth = Math.max(0, 1 - (age - 16) / 14);
  return Math.round((gap / 20) * youth * 100);
}

// ─── Main function ────────────────────────────────────────────────────────────

export function computeScoutingScore(input: ScoutingScoreInput): ScoutingScore {
  const { overall, potential, marketValue, age, trend } = input;

  // ── Component scores ───────────────────────────────────────────────────────

  const overallScore = overall != null
    ? Math.round(normaliseOverall(overall))
    : 50;

  const trendScore = trend?.trendScore ?? 50;

  const valueScore = overall != null && marketValue != null && marketValue > 0
    ? Math.round(normaliseValueScore(overall, marketValue))
    : 0;

  const ceilingScore = overall != null && potential != null && age != null
    ? normaliseCeilingScore(overall, potential, age)
    : 0;

  // ── Composite ─────────────────────────────────────────────────────────────

  const total = Math.round(
    overallScore * W_OVERALL +
    trendScore   * W_TREND   +
    valueScore   * W_VALUE   +
    ceilingScore * W_CEILING,
  );

  // ── Label ─────────────────────────────────────────────────────────────────

  const direction = trend?.direction ?? "stable";

  let label: ScoutingLabel;

  if (total >= 75 && direction === "rising") {
    label = "ELITE_PROSPECT";
  } else if (direction === "rising" && (age ?? 99) <= 23) {
    label = "RISING_STAR";
  } else if (valueScore >= 60 && direction !== "declining") {
    label = "VALUE_PICK";
  } else if (direction === "declining" || total < 35) {
    label = "DECLINING";
  } else {
    label = "STABLE";
  }

  return {
    total,
    label,
    breakdown: { overallScore, trendScore, valueScore, ceilingScore },
  };
}
