/**
 * performance.engine.ts
 *
 * Performance Score — Pilar 2 do Overall SoccerMind v2 (peso 25%).
 *
 * Converte PlayerStats em um score 0–100 usando benchmarks per-90
 * ajustados pelo contexto da liga (leagueScale).
 *
 * Benchmarks de elite global (European top-5, 2024-25):
 *   goals/90   avg 0.35  elite 1.10
 *   assists/90 avg 0.25  elite 0.80
 *   xG/90      avg 0.30  elite 0.90
 *   xA/90      avg 0.22  elite 0.70
 *   tackles/90 avg 2.5   elite 7.0
 *   interc/90  avg 1.0   elite 3.5
 *   passAcc%   avg 78    elite 92
 *   rating     avg 6.5   elite 8.0
 */

import { clamp } from "./engine.utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PerformanceInput {
  goals:         number;
  assists:       number;
  xG:            number;
  xA:            number;
  passAccuracy:  number;   // 0–100
  tackles:       number;
  interceptions: number;
  rating:        number;   // 0–10 Sportmonks scale
  minutes:       number;
  appearances:   number;
  position:      string;
  leagueScale:   number;   // 0.72–1.00 from LEAGUE_VOLUME_SCALE
}

// ---------------------------------------------------------------------------
// Per-position weights (must sum to 1.0)
// ---------------------------------------------------------------------------

interface PerfWeights {
  goals:      number;
  assists:    number;
  xG:         number;
  xA:         number;
  passing:    number;
  tackles:    number;
  intercepts: number;
  rating:     number;
}

const PERF_WEIGHTS: Record<string, PerfWeights> = {
  GK:  { goals: 0.00, assists: 0.02, xG: 0.00, xA: 0.01, passing: 0.10, tackles: 0.05, intercepts: 0.05, rating: 0.30 },
  SW:  { goals: 0.03, assists: 0.05, xG: 0.03, xA: 0.04, passing: 0.12, tackles: 0.20, intercepts: 0.20, rating: 0.20 },
  CB:  { goals: 0.03, assists: 0.05, xG: 0.03, xA: 0.03, passing: 0.12, tackles: 0.25, intercepts: 0.22, rating: 0.20 },
  FB:  { goals: 0.05, assists: 0.10, xG: 0.04, xA: 0.08, passing: 0.15, tackles: 0.18, intercepts: 0.15, rating: 0.20 },
  WB:  { goals: 0.06, assists: 0.12, xG: 0.05, xA: 0.09, passing: 0.13, tackles: 0.15, intercepts: 0.13, rating: 0.20 },
  CDM: { goals: 0.04, assists: 0.08, xG: 0.04, xA: 0.07, passing: 0.15, tackles: 0.18, intercepts: 0.18, rating: 0.20 },
  CM:  { goals: 0.08, assists: 0.12, xG: 0.07, xA: 0.09, passing: 0.15, tackles: 0.10, intercepts: 0.10, rating: 0.20 },
  MEZ: { goals: 0.10, assists: 0.13, xG: 0.08, xA: 0.10, passing: 0.14, tackles: 0.08, intercepts: 0.08, rating: 0.20 },
  WM:  { goals: 0.10, assists: 0.13, xG: 0.08, xA: 0.10, passing: 0.12, tackles: 0.10, intercepts: 0.10, rating: 0.20 },
  CAM: { goals: 0.12, assists: 0.18, xG: 0.09, xA: 0.12, passing: 0.12, tackles: 0.04, intercepts: 0.04, rating: 0.20 },
  W:   { goals: 0.15, assists: 0.16, xG: 0.10, xA: 0.11, passing: 0.08, tackles: 0.03, intercepts: 0.03, rating: 0.20 },
  SS:  { goals: 0.18, assists: 0.15, xG: 0.12, xA: 0.10, passing: 0.07, tackles: 0.03, intercepts: 0.03, rating: 0.20 },
  CF:  { goals: 0.22, assists: 0.14, xG: 0.14, xA: 0.09, passing: 0.06, tackles: 0.02, intercepts: 0.02, rating: 0.20 },
  ST:  { goals: 0.28, assists: 0.12, xG: 0.16, xA: 0.08, passing: 0.04, tackles: 0.02, intercepts: 0.02, rating: 0.20 },
};

const DEFAULT_PERF_WEIGHTS = PERF_WEIGHTS["CM"];

function getWeights(position: string): PerfWeights {
  let _classify: ((raw: string | null | undefined) => string) | null = null;
  if (!_classify) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    _classify = require("./overall.engine").classifyPosition;
  }
  const group = _classify!(position);
  return PERF_WEIGHTS[group] ?? DEFAULT_PERF_WEIGHTS;
}

// ---------------------------------------------------------------------------
// Benchmark scoring helper
// ---------------------------------------------------------------------------

function scoreMetric(
  value: number,
  avg: number,
  elite: number,
  leagueScale = 1.0,
  lowerIsBetter = false,
): number {
  const a = avg   * leagueScale;
  const e = elite * leagueScale;

  if (lowerIsBetter) {
    if (value <= e)         return 99;
    if (value >= a * 2.5)   return 10;
    const r = (a * 2.5 - value) / (a * 2.5 - e);
    return Math.round(clamp(r * 99, 10, 99));
  }

  if (value <= 0)           return 10;
  if (value >= e)           return 99;
  const floor = a * 0.25;
  if (value <= floor)       return 10;
  if (value < a) {
    const r = (value - floor) / (a - floor);
    return Math.round(clamp(10 + r * 40, 10, 50));
  }
  const r = (value - a) / (e - a);
  return Math.round(clamp(50 + r * 49, 50, 99));
}

function per90(stat: number, minutes: number): number {
  if (minutes < 1) return 0;
  return (stat / minutes) * 90;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Calculates a 0–100 performance score from PlayerStats.
 *
 * Returns 0 if the player has fewer than 90 minutes played.
 */
export function calculatePerformanceScore(input: PerformanceInput): number {
  if (input.minutes < 90) return 0;

  const ls  = input.leagueScale;
  const min = input.minutes;
  const w   = getWeights(input.position);

  const goalsScore   = scoreMetric(per90(input.goals,         min), 0.35, 1.10, ls);
  const assistsScore = scoreMetric(per90(input.assists,       min), 0.25, 0.80, ls);
  const xGScore      = scoreMetric(per90(input.xG,            min), 0.30, 0.90, ls);
  const xAScore      = scoreMetric(per90(input.xA,            min), 0.22, 0.70, ls);
  const passScore    = scoreMetric(input.passAccuracy,         78,   92);  // % — no league scale
  const tacklesScore = scoreMetric(per90(input.tackles,       min), 2.5,  7.0,  ls);
  const intercScore  = scoreMetric(per90(input.interceptions, min), 1.0,  3.5,  ls);
  const ratingScore  = scoreMetric(input.rating,               6.5,  8.0);  // 0–10 Sportmonks

  const raw =
    goalsScore   * w.goals      +
    assistsScore * w.assists    +
    xGScore      * w.xG         +
    xAScore      * w.xA         +
    passScore    * w.passing    +
    tacklesScore * w.tackles    +
    intercScore  * w.intercepts +
    ratingScore  * w.rating;

  // Soft penalty for limited playing time
  const minutesFactor =
    min < 300  ? 0.70 :
    min < 600  ? 0.85 :
    min < 900  ? 0.93 :
                 1.00;

  return clamp(raw * minutesFactor, 0, 100);
}
