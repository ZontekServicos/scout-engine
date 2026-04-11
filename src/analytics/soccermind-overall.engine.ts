/**
 * soccermind-overall.engine.ts
 *
 * SoccerMind Overall — Rating proprietário baseado em dados reais do Sportmonks.
 *
 * ─── FILOSOFIA ──────────────────────────────────────────────────────────────
 *
 *   Não replica o FIFA. Não usa benchmarks fixos.
 *   Cada métrica é normalizada como PERCENTIL dentro da população
 *   do mesmo grupo posicional (GK / DEF / MID / ATT).
 *
 *   Resultado: distribuição saudável e uniforme por construção —
 *   sempre haverá jogadores em todos os tiers.
 *
 * ─── RANGE ──────────────────────────────────────────────────────────────────
 *
 *   40 (pior) → 85 (melhor)
 *   Propositalmente comprimido: não existe "99 perfeito".
 *   Um jogador com 80+ é genuinamente excepcional.
 *
 * ─── 4 BLOCOS ───────────────────────────────────────────────────────────────
 *
 *   FINALIZAÇÃO  — goals/90, xG/90, shotsOnTarget/90, conversion_rate
 *   CRIAÇÃO      — assists/90, xA/90, keyPasses/90, passAccuracy
 *   PRESSÃO      — tackles/90, interceptions/90, aerialDuelsWon/90
 *   PRESENÇA     — rating (Sportmonks), availability, minutes_regularity
 *
 * ─── PESOS POR GRUPO ────────────────────────────────────────────────────────
 *
 *              GK    DEF   MID   ATT
 *   FINALIZ.  0.00  0.05  0.20  0.50
 *   CRIAÇÃO   0.05  0.15  0.40  0.30
 *   PRESSÃO   0.15  0.50  0.25  0.05
 *   PRESENÇA  0.80  0.30  0.15  0.15
 *
 * ─── NORMALIZAÇÃO ───────────────────────────────────────────────────────────
 *
 *   Cada métrica é convertida em percentil 0–100 dentro do grupo posicional
 *   usando os dados populacionais passados como parâmetro (PopulationStats).
 *
 *   Isso garante:
 *     • Distribuição uniforme por definição
 *     • Comparação justa entre posições
 *     • Sem inflação ou deflação por liga
 *
 *   Um pequeno ajuste contextual (±2.5pt) é aplicado ao final para
 *   reconhecer diferenças de nível entre ligas.
 *
 * ─── TIERS ──────────────────────────────────────────────────────────────────
 *
 *   82–85  ELITE          top ~7%
 *   76–81  MUITO BOM      top 7–20%
 *   68–75  BOM            top 20–38%
 *   58–67  MEDIANO        top 38–60%
 *   40–57  REGULAR        bottom 40%
 */

import { clamp } from "./engine.utils";
import { LeagueContext, LEAGUE_VOLUME_SCALE } from "./overall.engine";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

export const SM_SCORE_FLOOR   = 40;
export const SM_SCORE_CEILING = 85;
const SM_SCORE_RANGE = SM_SCORE_CEILING - SM_SCORE_FLOOR; // 45

/** Minimum minutes to be included in population stats calculation. */
export const SM_MIN_MINUTES = 450;

// ─────────────────────────────────────────────────────────────────────────────
// Position groups
// ─────────────────────────────────────────────────────────────────────────────

export type PositionGroup = "GK" | "DEF" | "MID" | "ATT";

const RAW_TO_GROUP: Record<string, PositionGroup> = {
  GK:  "GK",
  SW:  "DEF", CB: "DEF", FB: "DEF", WB: "DEF",
  CDM: "MID", CM: "MID", MEZ: "MID", WM: "MID",
  CAM: "MID", W:  "MID",
  SS:  "ATT", CF: "ATT", ST: "ATT",
};

export function resolvePositionGroup(rawPositions: string[]): PositionGroup {
  for (const p of rawPositions) {
    const upper = p.toUpperCase().trim();
    if (RAW_TO_GROUP[upper]) return RAW_TO_GROUP[upper];
  }
  return "MID"; // safe default
}

// ─────────────────────────────────────────────────────────────────────────────
// Block weights (must sum to 1.0 per group)
// ─────────────────────────────────────────────────────────────────────────────

interface BlockWeights {
  scoring:  number;  // Finalização
  creation: number;  // Criação
  pressure: number;  // Pressão defensiva
  presence: number;  // Presença / impacto geral
}

const BLOCK_WEIGHTS: Record<PositionGroup, BlockWeights> = {
  GK:  { scoring: 0.00, creation: 0.05, pressure: 0.15, presence: 0.80 },
  DEF: { scoring: 0.05, creation: 0.15, pressure: 0.50, presence: 0.30 },
  MID: { scoring: 0.20, creation: 0.40, pressure: 0.25, presence: 0.15 },
  ATT: { scoring: 0.50, creation: 0.30, pressure: 0.05, presence: 0.15 },
};

// ─────────────────────────────────────────────────────────────────────────────
// Metric weights within each block
// ─────────────────────────────────────────────────────────────────────────────

// FINALIZAÇÃO: como o jogador gera/finaliza oportunidades
const W_SCORING = {
  goals90:          0.35,
  xG90:             0.25,
  shotsOnTarget90:  0.20,
  conversionRate:   0.20,
};

// CRIAÇÃO: como o jogador habilita outros ou conduz o jogo
const W_CREATION = {
  assists90:    0.25,
  xA90:         0.20,
  keyPasses90:  0.20,
  passAccuracy: 0.35,
};

// PRESSÃO: contribuição defensiva direta
const W_PRESSURE = {
  tackles90:        0.40,
  interceptions90:  0.35,
  aerialDuelsWon90: 0.25,
};

// PRESENÇA: sinal composto de qualidade e disponibilidade
const W_PRESENCE = {
  rating:          0.55,  // Sportmonks match rating (0–10)
  availability:    0.30,  // appearances / 34 × 100
  minuteRegularity:0.15,  // avg minutes per appearance / 90 × 100
};

// ─────────────────────────────────────────────────────────────────────────────
// Population distributions (passed in, pre-computed from the full DB)
// ─────────────────────────────────────────────────────────────────────────────

export interface MetricSamples {
  goals90:           number[];
  xG90:              number[];
  shotsOnTarget90:   number[];
  conversionRate:    number[];
  assists90:         number[];
  xA90:              number[];
  keyPasses90:       number[];
  passAccuracy:      number[];
  tackles90:         number[];
  interceptions90:   number[];
  aerialDuelsWon90:  number[];
  rating:            number[];
  availability:      number[];
  minuteRegularity:  number[];
}

export type PopulationStats = Record<PositionGroup, MetricSamples>;

// ─────────────────────────────────────────────────────────────────────────────
// Input / Output types
// ─────────────────────────────────────────────────────────────────────────────

export interface SmOverallInput {
  positions:    string[];
  league?:      string | null;
  goals?:       number | null;
  assists?:     number | null;
  xG?:          number | null;
  xA?:          number | null;
  keyPasses?:   number | null;
  passAccuracy?:number | null;
  tackles?:     number | null;
  interceptions?:number | null;
  shots?:       number | null;
  shotsOnTarget?:number | null;
  aerialDuelsWon?:number | null;
  rating?:      number | null;
  minutes?:     number | null;
  appearances?: number | null;
}

export interface SmOverallResult {
  overall:       number;
  tier:          SmTier;
  reliable:      boolean;
  positionGroup: PositionGroup;
  blocks: {
    scoring:  number;  // 0–100 percentile-weighted
    creation: number;
    pressure: number;
    presence: number;
  };
  metrics: {
    goals90:          number;
    assists90:        number;
    xG90:             number;
    xA90:             number;
    keyPasses90:      number;
    passAccuracy:     number;
    tackles90:        number;
    interceptions90:  number;
    shotsOnTarget90:  number;
    conversionRate:   number;
    aerialDuelsWon90: number;
    rating:           number;
    availability:     number;
    minuteRegularity: number;
  };
}

export type SmTier = "ELITE" | "MUITO_BOM" | "BOM" | "MEDIANO" | "REGULAR";

// ─────────────────────────────────────────────────────────────────────────────
// Percentile lookup — binary search on pre-sorted sample array
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the percentile (0–100) of `value` within a pre-sorted population.
 * Uses lower-bound search: what fraction of the population is ≤ value?
 */
export function percentileOf(value: number, sortedPop: number[]): number {
  if (sortedPop.length === 0) return 50;
  let lo = 0;
  let hi = sortedPop.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sortedPop[mid] <= value) lo = mid + 1;
    else hi = mid;
  }
  return clamp(Math.round((lo / sortedPop.length) * 100), 0, 100);
}

/** Sorts an array of numbers ascending in-place and returns it. */
export function sortedSamples(values: number[]): number[] {
  return values.slice().sort((a, b) => a - b);
}

// ─────────────────────────────────────────────────────────────────────────────
// League context bonus (±2.5 points max)
// ─────────────────────────────────────────────────────────────────────────────

const LEAGUE_BONUS: Partial<Record<LeagueContext, number>> = {
  DEFAULT:   2.5,   // top-5 Europe
  EUR_MID:   1.5,
  EUR_LOWER: 0.5,
  SERIE_A:  -0.5,
  SA_TOP:   -1.5,
  SA_MID:   -2.5,
  SERIE_B:  -2.5,
};

function resolveLeagueContextFromName(league: string | null | undefined): LeagueContext {
  if (!league) return "DEFAULT";
  const key = league.toLowerCase().trim()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const MAP: Record<string, LeagueContext> = {
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
  return MAP[key] ?? "DEFAULT";
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-90 helper
// ─────────────────────────────────────────────────────────────────────────────

function per90(stat: number | null | undefined, minutes: number): number {
  if (!stat || minutes < 1) return 0;
  return (stat / minutes) * 90;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tier resolver
// ─────────────────────────────────────────────────────────────────────────────

export function smTier(overall: number): SmTier {
  if (overall >= 82) return "ELITE";
  if (overall >= 76) return "MUITO_BOM";
  if (overall >= 68) return "BOM";
  if (overall >= 58) return "MEDIANO";
  return "REGULAR";
}

// ─────────────────────────────────────────────────────────────────────────────
// Block scorers — weighted average of metric percentiles
// ─────────────────────────────────────────────────────────────────────────────

function scoreBlock(
  metricValues:   number[],
  metricWeights:  number[],
  sortedPops:     (number[] | undefined)[],
): number {
  let total   = 0;
  let wSum    = 0;
  for (let i = 0; i < metricValues.length; i++) {
    const pop = sortedPops[i];
    if (!pop || pop.length < 3) continue; // skip if no population data
    const w = metricWeights[i];
    total += percentileOf(metricValues[i], pop) * w;
    wSum  += w;
  }
  return wSum > 0 ? total / wSum : 50;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculates the SoccerMind Overall for a single player.
 *
 * @param input  - player data + stats
 * @param pop    - pre-computed population distributions (from computePopulationStats)
 */
export function calculateSoccerMindOverall(
  input: SmOverallInput,
  pop:   PopulationStats,
): SmOverallResult {
  const group    = resolvePositionGroup(input.positions);
  const mins     = input.minutes ?? 0;
  const reliable = mins >= SM_MIN_MINUTES;
  const apps     = input.appearances ?? 0;
  const dist     = pop[group];

  // ── Compute raw metrics ────────────────────────────────────────────────────

  const goals90          = per90(input.goals,          mins);
  const assists90        = per90(input.assists,        mins);
  const xG90             = per90(input.xG,             mins);
  const xA90             = per90(input.xA,             mins);
  const keyPasses90      = per90(input.keyPasses,      mins);
  const shotsOnTarget90  = per90(input.shotsOnTarget,  mins);
  const tackles90        = per90(input.tackles,        mins);
  const interceptions90  = per90(input.interceptions,  mins);
  const aerialDuelsWon90 = per90(input.aerialDuelsWon, mins);

  const shots           = input.shots ?? 0;
  const goals           = input.goals ?? 0;
  const conversionRate  = shots > 0 ? clamp((goals / shots) * 100, 0, 100) : 0;

  const passAccuracy    = clamp(input.passAccuracy ?? 0, 0, 100);

  const rating          = clamp(input.rating ?? 0, 0, 10);
  // Normalize rating to 0–100 for consistency
  const ratingNorm      = rating * 10;

  const availability    = clamp((apps / 34) * 100, 0, 100);
  const avgMinPerApp    = apps > 0 ? mins / apps : 0;
  const minuteRegularity = clamp((avgMinPerApp / 90) * 100, 0, 100);

  // ── Score each block via percentiles ──────────────────────────────────────

  const scoringScore = scoreBlock(
    [goals90, xG90, shotsOnTarget90, conversionRate],
    [W_SCORING.goals90, W_SCORING.xG90, W_SCORING.shotsOnTarget90, W_SCORING.conversionRate],
    [dist.goals90, dist.xG90, dist.shotsOnTarget90, dist.conversionRate],
  );

  const creationScore = scoreBlock(
    [assists90, xA90, keyPasses90, passAccuracy],
    [W_CREATION.assists90, W_CREATION.xA90, W_CREATION.keyPasses90, W_CREATION.passAccuracy],
    [dist.assists90, dist.xA90, dist.keyPasses90, dist.passAccuracy],
  );

  const pressureScore = scoreBlock(
    [tackles90, interceptions90, aerialDuelsWon90],
    [W_PRESSURE.tackles90, W_PRESSURE.interceptions90, W_PRESSURE.aerialDuelsWon90],
    [dist.tackles90, dist.interceptions90, dist.aerialDuelsWon90],
  );

  const presenceScore = scoreBlock(
    [ratingNorm, availability, minuteRegularity],
    [W_PRESENCE.rating, W_PRESENCE.availability, W_PRESENCE.minuteRegularity],
    [dist.rating, dist.availability, dist.minuteRegularity],
  );

  // ── Weighted composite ────────────────────────────────────────────────────

  const w = BLOCK_WEIGHTS[group];
  const composite =
    scoringScore  * w.scoring  +
    creationScore * w.creation +
    pressureScore * w.pressure +
    presenceScore * w.presence;

  // ── Map to 40–85 range ────────────────────────────────────────────────────

  const leagueCtx   = resolveLeagueContextFromName(input.league);
  const leagueBonus = LEAGUE_BONUS[leagueCtx] ?? 0;

  const overall = clamp(
    Math.round(SM_SCORE_FLOOR + (composite / 100) * SM_SCORE_RANGE + leagueBonus),
    SM_SCORE_FLOOR,
    SM_SCORE_CEILING,
  );

  return {
    overall,
    tier:          smTier(overall),
    reliable,
    positionGroup: group,
    blocks: {
      scoring:  Math.round(scoringScore),
      creation: Math.round(creationScore),
      pressure: Math.round(pressureScore),
      presence: Math.round(presenceScore),
    },
    metrics: {
      goals90:          +goals90.toFixed(2),
      assists90:        +assists90.toFixed(2),
      xG90:             +xG90.toFixed(2),
      xA90:             +xA90.toFixed(2),
      keyPasses90:      +keyPasses90.toFixed(2),
      passAccuracy:     +passAccuracy.toFixed(1),
      tackles90:        +tackles90.toFixed(2),
      interceptions90:  +interceptions90.toFixed(2),
      shotsOnTarget90:  +shotsOnTarget90.toFixed(2),
      conversionRate:   +conversionRate.toFixed(1),
      aerialDuelsWon90: +aerialDuelsWon90.toFixed(2),
      rating:           +rating.toFixed(2),
      availability:     +availability.toFixed(1),
      minuteRegularity: +minuteRegularity.toFixed(1),
    },
  };
}
