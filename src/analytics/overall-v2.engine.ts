/**
 * overall-v2.engine.ts
 *
 * Overall SoccerMind v2 — calculado, contextualizado e dinâmico.
 *
 * Fórmula:
 *   Overall = MacroSkill×0.50 + Performance×0.25 + Consistency×0.15 + Context×0.10
 *
 * Pilares:
 *   1. MacroSkill   (50%) — blocos pace/shooting/.../physical do Player
 *   2. Performance  (25%) — stats per-90 do PlayerStats vs benchmarks globais
 *   3. Consistency  (15%) — regularidade (minutos/partidas na temporada)
 *   4. Context      (10%) — tier da liga (LEAGUE_VOLUME_SCALE)
 *
 * Tiers:
 *   88–100 WORLD_CLASS  · 82–87 ELITE  · 76–81 PREMIUM
 *   68–75  STANDARD     · 50–67 PROSPECT · 0–49 DEVELOPING
 */

import { extractMacroSkills, calculateMacroSkillScore, MacroSkills } from "./macroskill.engine";
import { calculatePerformanceScore }                                  from "./performance.engine";
import { LeagueContext, LEAGUE_VOLUME_SCALE }                         from "./overall.engine";
import { clamp }                                                       from "./engine.utils";

// ---------------------------------------------------------------------------
// Re-export so callers do not need to import from overall.engine directly
// ---------------------------------------------------------------------------

export { LeagueContext, LEAGUE_VOLUME_SCALE };

// ---------------------------------------------------------------------------
// League name → LeagueContext lookup
// ---------------------------------------------------------------------------

const LEAGUE_CONTEXT_MAP: Record<string, LeagueContext> = {
  "premier league":             "DEFAULT",
  "la liga":                    "DEFAULT",
  "serie a":                    "DEFAULT",
  "bundesliga":                 "DEFAULT",
  "ligue 1":                    "DEFAULT",
  "champions league":           "DEFAULT",
  "uefa champions league":      "DEFAULT",
  "eredivisie":                 "EUR_MID",
  "liga portugal":              "EUR_MID",
  "scottish premiership":       "EUR_MID",
  "belgian pro league":         "EUR_LOWER",
  "super lig":                  "EUR_LOWER",
  "brasileirao serie a":        "SERIE_A",
  "serie a brazil":             "SERIE_A",
  "liga profesional de futbol": "SA_TOP",
  "liga argentina":             "SA_TOP",
  "liga mx":                    "SA_TOP",
};

export function resolveLeagueContext(leagueName: string | null | undefined): LeagueContext {
  if (!leagueName) return "DEFAULT";
  const key = leagueName.toLowerCase().trim()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, ""); // strip diacritics
  return LEAGUE_CONTEXT_MAP[key] ?? "DEFAULT";
}

// ---------------------------------------------------------------------------
// Input / Output types
// ---------------------------------------------------------------------------

export interface OverallV2PlayerInput {
  id:              string;
  positions:       string[];
  age:             number;
  league?:         string | null;
  overallPace?:      number | null;
  overallShooting?:  number | null;
  overallPassing?:   number | null;
  overallDribbling?: number | null;
  overallDefending?: number | null;
  overallPhysical?:  number | null;
}

export interface OverallV2StatsInput {
  goals?:         number | null;
  assists?:       number | null;
  xG?:            number | null;
  xA?:            number | null;
  passAccuracy?:  number | null;
  tackles?:       number | null;
  interceptions?: number | null;
  rating?:        number | null;
  minutes?:       number | null;
  appearances?:   number | null;
}

export interface DnaV2 {
  impact:       number;
  intelligence: number;
  defensiveIQ:  number;
  consistency:  number;
  potential:    number;
}

export interface OverallV2Result {
  overall:          number;
  tier:             string;
  reliable:         boolean;
  macroSkills:      MacroSkills;
  macroSkillScore:  number;
  performanceScore: number;
  consistencyScore: number;
  contextScore:     number;
  breakdown: {
    macro:       number;
    performance: number;
    consistency: number;
    context:     number;
  };
  dna:           DnaV2;
  leagueContext: LeagueContext;
  leagueScale:   number;
  position:      string;
}

// ---------------------------------------------------------------------------
// Tier labels
// ---------------------------------------------------------------------------

export type OverallTier =
  | "WORLD_CLASS" | "ELITE" | "PREMIUM"
  | "STANDARD"   | "PROSPECT" | "DEVELOPING";

export function getTier(overall: number): OverallTier {
  if (overall >= 88) return "WORLD_CLASS";
  if (overall >= 82) return "ELITE";
  if (overall >= 76) return "PREMIUM";
  if (overall >= 68) return "STANDARD";
  if (overall >= 50) return "PROSPECT";
  return "DEVELOPING";
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const MIN_MINUTES = 450;

function primaryPosition(positions: string[]): string {
  return positions?.[0]?.toUpperCase()?.trim() ?? "CM";
}

function calcConsistencyScore(stats: OverallV2StatsInput): number {
  const minutes     = stats.minutes     ?? 0;
  const appearances = stats.appearances ?? 0;
  if (appearances === 0) return 0;
  const avgMinPerApp = minutes / appearances;
  const minuteRate   = clamp(avgMinPerApp / 90, 0, 1);
  const appRate      = clamp(appearances  / 34, 0, 1);
  return clamp((minuteRate * 0.50 + appRate * 0.50) * 100, 0, 100);
}

function calcDna(
  macros:      MacroSkills,
  stats:       OverallV2StatsInput | null,
  overall:     number,
  age:         number,
  leagueScale: number,
): DnaV2 {
  const minutes = stats?.minutes ?? 0;

  const impactBase = macros.shooting * 0.35 + macros.physical * 0.15;
  const impactPerf =
    minutes >= 90 && stats
      ? clamp(
          ((stats.goals ?? 0) / Math.max(minutes, 1)) * 90 * 40 +
          ((stats.xG    ?? 0) / Math.max(minutes, 1)) * 90 * 30,
          0, 50,
        )
      : 0;

  const ageFactor =
    age <= 21 ? 1.15 :
    age <= 23 ? 1.08 :
    age <= 25 ? 1.03 :
    age <= 28 ? 1.00 :
    age <= 30 ? 0.95 : 0.88;

  return {
    impact:       clamp(impactBase * 0.70 + impactPerf * 0.30 * leagueScale, 0, 100),
    intelligence: clamp(macros.passing * 0.55 + macros.dribbling * 0.30 + (stats?.passAccuracy ?? 50) * 0.15, 0, 100),
    defensiveIQ:  clamp(
      macros.defending * 0.55 + macros.physical * 0.20 +
      clamp(((stats?.tackles ?? 0) + (stats?.interceptions ?? 0)) / Math.max(minutes, 1) * 90 * 3, 0, 30),
      0, 100),
    consistency:  stats ? calcConsistencyScore(stats) : 50,
    potential:    clamp(overall * ageFactor, 1, 100),
  };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function calculateOverallV2(
  player: OverallV2PlayerInput,
  stats:  OverallV2StatsInput | null,
): OverallV2Result {
  const position    = primaryPosition(player.positions);
  const leagueCtx   = resolveLeagueContext(player.league);
  const leagueScale = LEAGUE_VOLUME_SCALE[leagueCtx];

  // Pilar 1 — MacroSkill (50%)
  const macros     = extractMacroSkills(player);
  const macroScore = calculateMacroSkillScore(macros, position);

  // Pilar 2 — Performance (25%)
  const perfScore = stats
    ? calculatePerformanceScore({
        goals:         stats.goals         ?? 0,
        assists:       stats.assists       ?? 0,
        xG:            stats.xG            ?? 0,
        xA:            stats.xA            ?? 0,
        passAccuracy:  stats.passAccuracy  ?? 0,
        tackles:       stats.tackles       ?? 0,
        interceptions: stats.interceptions ?? 0,
        rating:        stats.rating        ?? 0,
        minutes:       stats.minutes       ?? 0,
        appearances:   stats.appearances   ?? 0,
        position,
        leagueScale,
      })
    : macroScore * 0.80;

  // Pilar 3 — Consistency (15%)
  const consistencyScore = stats ? calcConsistencyScore(stats) : 50;

  // Pilar 4 — Context (10%)
  const contextScore = clamp(leagueScale * 100, 0, 100);

  const overall = clamp(
    Math.round(
      macroScore       * 0.50 +
      perfScore        * 0.25 +
      consistencyScore * 0.15 +
      contextScore     * 0.10,
    ),
    0, 100,
  );

  const reliable = (stats?.minutes ?? 0) >= MIN_MINUTES;
  const dna      = calcDna(macros, stats, overall, player.age, leagueScale);

  return {
    overall,
    tier:             getTier(overall),
    reliable,
    macroSkills:      macros,
    macroSkillScore:  Math.round(macroScore),
    performanceScore: Math.round(perfScore),
    consistencyScore: Math.round(consistencyScore),
    contextScore:     Math.round(contextScore),
    breakdown: {
      macro:       Math.round(macroScore       * 0.50),
      performance: Math.round(perfScore        * 0.25),
      consistency: Math.round(consistencyScore * 0.15),
      context:     Math.round(contextScore     * 0.10),
    },
    dna: {
      impact:       Math.round(dna.impact),
      intelligence: Math.round(dna.intelligence),
      defensiveIQ:  Math.round(dna.defensiveIQ),
      consistency:  Math.round(dna.consistency),
      potential:    Math.round(dna.potential),
    },
    leagueContext: leagueCtx,
    leagueScale,
    position,
  };
}
