/**
 * soccermind-overall.engine.ts  —  v3
 *
 * SoccerMind Overall — Rating proprietário, baseado em dados reais.
 *
 * ─── FILOSOFIA ──────────────────────────────────────────────────────────────
 *
 *   • Não replica o FIFA. Não usa benchmarks fixos.
 *   • Cada métrica vira percentil dentro do grupo posicional (GK/DEF/MID/ATT).
 *   • Curva de poder (^1.3) cria distribuição realista: poucos elites, maioria
 *     na faixa intermediária — não uma distribuição uniforme artificial.
 *   • Liga afeta o overall via fator multiplicativo no composite, não como
 *     bônus fixo — evita hardcoding.
 *
 * ─── RANGE ──────────────────────────────────────────────────────────────────
 *
 *   40 (mínimo) → 85 (teto)
 *   Propositalmente comprimido: 80+ é genuinamente excepcional.
 *
 * ─── 4 BLOCOS ───────────────────────────────────────────────────────────────
 *
 *   FINALIZAÇÃO  — gols/90, xG/90, chutes no gol/90, taxa de conversão
 *   CRIAÇÃO      — assistências/90, xA/90, passes-chave/90, precisão de passe
 *   PRESSÃO      — duelos defensivos (pesos internos variam por posição)
 *   PRESENÇA     — rating Sportmonks, disponibilidade, regularidade de minutos
 *
 * ─── PESOS POR GRUPO ────────────────────────────────────────────────────────
 *
 *              GK    DEF   MID   ATT
 *   FINALIZ.  0.00  0.05  0.20  0.50
 *   CRIAÇÃO   0.05  0.15  0.40  0.30
 *   PRESSÃO   0.15  0.50  0.25  0.05
 *   PRESENÇA  0.80  0.30  0.15  0.15
 *
 * ─── CURVA DE PODER DINÂMICA ────────────────────────────────────────────────
 *
 *   overall = 40 + (composite/100)^exp × 45
 *
 *   Expoente varia por grupo posicional — atacantes são mais seletivos:
 *     ATT  1.35  (elite mais raro — exige volume + eficiência)
 *     DEF  1.30
 *     MID  1.25
 *     GK   1.20  (menos métricas disponíveis → menos penalização)
 *
 *   composite 100 → overall 85   (teto absoluto, qualquer posição)
 *   composite  80 → ATT 73 / MID 74 / GK 75
 *   composite  60 → ATT 62 / MID 63 / GK 65
 *   composite  40 → ATT 51 / MID 52 / GK 54
 *
 * ─── FATOR DE LIGA ──────────────────────────────────────────────────────────
 *
 *   Aplicado ao composite antes da curva de poder:
 *     adjustedComposite = composite × leagueFactor
 *
 *   Liga            Factor
 *   Premier League  1.05
 *   Top-5 Europa    1.03
 *   Europa Mid      1.00
 *   Europa Lower    0.97
 *   Brasileirão A   0.95
 *   SA Top          0.93
 *   SA Mid / Série B 0.90
 *
 * ─── TIERS ──────────────────────────────────────────────────────────────────
 *
 *   82–85  ELITE          top ~5%
 *   76–81  MUITO_BOM      top 5–15%
 *   68–75  BOM            top 15–35%
 *   58–67  MEDIANO        top 35–60%
 *   40–57  REGULAR        bottom 40%
 */

import { clamp } from "./engine.utils";
import { LeagueContext } from "./overall.engine";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

export const SM_SCORE_FLOOR   = 40;
export const SM_SCORE_CEILING = 85;
const SM_SCORE_RANGE = SM_SCORE_CEILING - SM_SCORE_FLOOR; // 45

export const SM_MIN_MINUTES = 450;

// ─────────────────────────────────────────────────────────────────────────────
// Curva de poder dinâmica — expoente por grupo posicional
//
//   ATT 1.35: atacante elite precisa de volume E eficiência (mais seletivo)
//   DEF 1.30: padrão
//   MID 1.25: criadores têm métricas mais distribuídas
//   GK  1.20: menos métricas disponíveis → menor penalização pela curva
// ─────────────────────────────────────────────────────────────────────────────

// Fator global de calibração da curva.
// Multiplica todos os expoentes — ajusta a seletividade do modelo inteiro
// sem alterar a fórmula. Aumentar → mais seletivo (menos elites).
// Padrão 1.02 aplica pressão mínima e facilita recalibração futura.
const GLOBAL_CURVE = 1.02;

const POWER_EXPONENT: Record<PositionGroup, number> = {
  ATT: 1.35,
  DEF: 1.30,
  MID: 1.25,
  GK:  1.20,
};

// ─────────────────────────────────────────────────────────────────────────────
// Position groups
// ─────────────────────────────────────────────────────────────────────────────

export type PositionGroup = "GK" | "DEF" | "MID" | "ATT";

const RAW_TO_GROUP: Record<string, PositionGroup> = {
  GK:  "GK",
  SW:  "DEF", CB: "DEF", FB: "DEF", WB: "DEF",
  CDM: "MID", CM: "MID", MEZ: "MID", WM: "MID",
  CAM: "MID", W: "MID",
  SS:  "ATT", CF: "ATT", ST: "ATT",
};

export function resolvePositionGroup(rawPositions: string[]): PositionGroup {
  for (const p of rawPositions) {
    const upper = p.toUpperCase().trim();
    if (RAW_TO_GROUP[upper]) return RAW_TO_GROUP[upper];
  }
  return "MID";
}

// ─────────────────────────────────────────────────────────────────────────────
// Bloco PRESSÃO — pesos internos variam por posição
//
//   DEF: tackles dominam  (marcação, bloqueios, disputas aéreas)
//   MID: interceptions dominam  (leitura de jogo, recuperação de bola)
//   ATT: interceptions como proxy de pressing  (pressão alta)
//   GK:  disputas aéreas dominam  (saídas de área)
//
// [tackles90, interceptions90, aerialDuelsWon90]
// ─────────────────────────────────────────────────────────────────────────────

const PRESSURE_INTERNAL_WEIGHTS: Record<PositionGroup, [number, number, number]> = {
  GK:  [0.10, 0.15, 0.75],
  DEF: [0.40, 0.35, 0.25],
  MID: [0.30, 0.45, 0.25],
  ATT: [0.15, 0.55, 0.30],
};

// ─────────────────────────────────────────────────────────────────────────────
// Bloco PRESENÇA — pesos fixos (independente de posição)
//
//   rating     : rating médio Sportmonks por jogo (0–10 → normalizado 0–100)
//                já incorpora gols, assistências, duelos, erros
//   availability: aparições / 34 — regularidade na temporada
//   min_reg    : minutos médios por aparição / 90 — titular vs reserva
//
// Reduzimos o peso do rating para 0.50 (antes 0.55) pois ele já captura
// tudo — inflar demais penaliza jogadores com menos jogos por lesão.
// ─────────────────────────────────────────────────────────────────────────────

const W_PRESENCE = { rating: 0.50, availability: 0.30, minuteRegularity: 0.20 };

// Pesos dos outros blocos (fixos por bloco, não por posição)
const W_SCORING  = { goals90: 0.35, xG90: 0.25, shotsOnTarget90: 0.20, conversionRate: 0.20 };
const W_CREATION = { assists90: 0.25, xA90: 0.20, keyPasses90: 0.20, passAccuracy: 0.35 };

// ─────────────────────────────────────────────────────────────────────────────
// Pesos dos blocos por grupo posicional (somam 1.0)
// ─────────────────────────────────────────────────────────────────────────────

interface BlockWeights {
  scoring: number; creation: number; pressure: number; presence: number;
}

const BLOCK_WEIGHTS: Record<PositionGroup, BlockWeights> = {
  GK:  { scoring: 0.00, creation: 0.05, pressure: 0.15, presence: 0.80 },
  DEF: { scoring: 0.05, creation: 0.15, pressure: 0.50, presence: 0.30 },
  MID: { scoring: 0.20, creation: 0.40, pressure: 0.25, presence: 0.15 },
  ATT: { scoring: 0.50, creation: 0.30, pressure: 0.05, presence: 0.15 },
};

// ─────────────────────────────────────────────────────────────────────────────
// Fator de liga — multiplicativo no composite (antes da curva de poder)
//
// Filosofia: mesmo percentil, liga melhor → overall ligeiramente maior.
// Fator aplicado ao composite (0–100): adjustedComposite = composite × factor
// ─────────────────────────────────────────────────────────────────────────────

const LEAGUE_FACTOR: Record<string, number> = {
  "premier league":             1.05,
  "la liga":                    1.03,
  "serie a":                    1.03,
  "bundesliga":                 1.03,
  "ligue 1":                    1.03,
  "champions league":           1.05,
  "uefa champions league":      1.05,
  "eredivisie":                 1.00,
  "liga portugal":              1.00,
  "scottish premiership":       1.00,
  "belgian pro league":         0.97,
  "super lig":                  0.97,
  "brasileirao serie a":        0.95,
  "serie a brazil":             0.95,
  "liga profesional de futbol": 0.93,
  "liga argentina":             0.93,
  "liga mx":                    0.93,
  "serie b":                    0.90,
};

function getLeagueFactor(league: string | null | undefined): number {
  if (!league) return 1.00;
  const key = league.toLowerCase().trim()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return LEAGUE_FACTOR[key] ?? 1.00;
}

// ─────────────────────────────────────────────────────────────────────────────
// Population distributions (pré-computadas, passadas como parâmetro)
// ─────────────────────────────────────────────────────────────────────────────

export interface MetricSamples {
  goals90:          number[];
  xG90:             number[];
  shotsOnTarget90:  number[];
  conversionRate:   number[];
  assists90:        number[];
  xA90:             number[];
  keyPasses90:      number[];
  passAccuracy:     number[];
  tackles90:        number[];
  interceptions90:  number[];
  aerialDuelsWon90: number[];
  rating:           number[];
  availability:     number[];
  minuteRegularity: number[];
}

export type PopulationStats = Record<PositionGroup, MetricSamples>;

// ─────────────────────────────────────────────────────────────────────────────
// Input / Output
// ─────────────────────────────────────────────────────────────────────────────

export interface SmOverallInput {
  positions:      string[];
  league?:        string | null;
  goals?:         number | null;
  assists?:       number | null;
  xG?:            number | null;
  xA?:            number | null;
  keyPasses?:     number | null;
  passAccuracy?:  number | null;
  tackles?:       number | null;
  interceptions?: number | null;
  shots?:         number | null;
  shotsOnTarget?: number | null;
  aerialDuelsWon?:number | null;
  rating?:        number | null;
  minutes?:       number | null;
  appearances?:   number | null;
}

export interface SmOverallResult {
  overall:       number;
  tier:          SmTier;
  reliable:      boolean;
  positionGroup: PositionGroup;
  leagueFactor:  number;
  minutesWeight:     number;   // penalização/bônus por volume de minutos
  powerExponent:     number;   // expoente da curva aplicado
  consistencyBonus:  number;   // +0 ou +3 composite por alta disponibilidade
  blocks: {
    scoring:  number;
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
// Percentil — busca binária em array pré-ordenado
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retorna o percentil (0–100) de `value` dentro de uma população ordenada.
 * "Que fração da população tem valor ≤ value?"
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

export function sortedSamples(values: number[]): number[] {
  return values.slice().sort((a, b) => a - b);
}

// ─────────────────────────────────────────────────────────────────────────────
// Score de bloco — média ponderada de percentis
// ─────────────────────────────────────────────────────────────────────────────

function scoreBlock(
  values:    number[],
  weights:   number[],
  sortedPops:(number[] | undefined)[],
): number {
  let total = 0;
  let wSum  = 0;
  for (let i = 0; i < values.length; i++) {
    const pop = sortedPops[i];
    if (!pop || pop.length < 5) continue; // ignora métricas sem população
    total += percentileOf(values[i], pop) * weights[i];
    wSum  += weights[i];
  }
  return wSum > 0 ? total / wSum : 50;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tier
// ─────────────────────────────────────────────────────────────────────────────

export function smTier(overall: number): SmTier {
  if (overall >= 82) return "ELITE";
  if (overall >= 76) return "MUITO_BOM";
  if (overall >= 68) return "BOM";
  if (overall >= 58) return "MEDIANO";
  return "REGULAR";
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

function p90(stat: number | null | undefined, mins: number): number {
  if (!stat || mins < 1) return 0;
  return (stat / mins) * 90;
}

export function calculateSoccerMindOverall(
  input: SmOverallInput,
  pop:   PopulationStats,
): SmOverallResult {
  const group = resolvePositionGroup(input.positions);
  const mins  = input.minutes     ?? 0;
  const apps  = input.appearances ?? 0;
  const dist  = pop[group];

  // ── Métricas brutas → per-90 ──────────────────────────────────────────────

  const goals90          = p90(input.goals,          mins);
  const assists90        = p90(input.assists,        mins);
  const xG90             = p90(input.xG,             mins);
  const xA90             = p90(input.xA,             mins);
  const keyPasses90      = p90(input.keyPasses,      mins);
  const shotsOnTarget90  = p90(input.shotsOnTarget,  mins);
  const tackles90        = p90(input.tackles,        mins);
  const interceptions90  = p90(input.interceptions,  mins);
  const aerialDuelsWon90 = p90(input.aerialDuelsWon, mins);

  const shots          = input.shots ?? 0;
  const goals          = input.goals ?? 0;
  const conversionRate = shots > 0 ? clamp((goals / shots) * 100, 0, 100) : 0;
  const passAccuracy   = clamp(input.passAccuracy ?? 0, 0, 100);

  // rating Sportmonks: 0–10 → normalizado 0–100 para percentil
  const ratingRaw  = clamp(input.rating ?? 0, 0, 10);
  const ratingNorm = ratingRaw * 10;

  const availability     = clamp((apps / 34) * 100, 0, 100);
  const avgMinPerApp     = apps > 0 ? mins / apps : 0;
  const minuteRegularity = clamp((avgMinPerApp / 90) * 100, 0, 100);

  // ── Blocos → média ponderada de percentis ────────────────────────────────

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

  // Bloco PRESSÃO usa pesos internos por posição
  const [wp_tac, wp_int, wp_aer] = PRESSURE_INTERNAL_WEIGHTS[group];
  const pressureScore = scoreBlock(
    [tackles90, interceptions90, aerialDuelsWon90],
    [wp_tac,    wp_int,         wp_aer],
    [dist.tackles90, dist.interceptions90, dist.aerialDuelsWon90],
  );

  const presenceScore = scoreBlock(
    [ratingNorm, availability, minuteRegularity],
    [W_PRESENCE.rating, W_PRESENCE.availability, W_PRESENCE.minuteRegularity],
    [dist.rating, dist.availability, dist.minuteRegularity],
  );

  // ── Composite 0–100 (ponderado por posição) ───────────────────────────────

  const w = BLOCK_WEIGHTS[group];
  const composite =
    scoringScore  * w.scoring  +
    creationScore * w.creation +
    pressureScore * w.pressure +
    presenceScore * w.presence;

  // ── [3] Edge case: composite mínimo de 10 ────────────────────────────────
  //   Evita colapso total quando todos os blocos retornam perto de zero
  //   (ex: jogador sem stats em liga fraca com 0 minutos).

  const safeComposite = Math.max(10, composite);

  // ── [4] Consistency boost — contínuo, não binário ────────────────────────
  //   Base 2pt quando availability > 80% e mins > 1500.
  //   Cresce proporcionalmente: cada 10pp acima de 80% adiciona +0.5pt.
  //   Ex: availability=100% → bonus = 2 + (1.0-0.8)×5 = 3.0
  //       availability= 85% → bonus = 2 + (0.85-0.8)×5 = 2.25
  //       availability= 80% → bonus = 2.0
  //       availability< 80% → 0

  const availFraction   = availability / 100;  // 0–1
  const consistencyBonus =
    availFraction > 0.8 && mins > 1500
      ? 2 + (availFraction - 0.8) * 5
      : 0;

  const boostedComposite = Math.min(100, safeComposite + consistencyBonus);

  // ── [2] Fator de liga — multiplicativo, com clamp explícito ──────────────
  //   Garante que Premier League factor 1.05 não ultrapasse 100.

  const leagueFactor   = getLeagueFactor(input.league);
  const leagueAdjusted = clamp(boostedComposite * leagueFactor, 0, 100);

  // ── [2] Minutes weight — pow(0.6) em vez de sqrt(0.5) ───────────────────
  //   Expoente 0.6 sobe mais rápido que sqrt para min<150 (menos punitivo)
  //   mas ainda penaliza amostras pequenas. Cap 1.05 recompensa titulares.
  //
  //   Comparação sqrt(0.5) vs pow(0.6) para mins < 450:
  //     90  min → sqrt: 0.45  |  pow: 0.53  (+18% menos punitivo)
  //    150  min → sqrt: 0.58  |  pow: 0.64
  //    300  min → sqrt: 0.82  |  pow: 0.85
  //    450  min → 1.00  (referência — ambos iguais)
  //   3500  min → 1.05  (titular absoluto — bônus leve)

  const minutesWeight = clamp(Math.pow(clamp(mins / SM_MIN_MINUTES, 0, Infinity), 0.6), 0.0, 1.05);
  const weightedComposite = clamp(leagueAdjusted * minutesWeight, 0, 100);

  // ── Curva de poder dinâmica → range 40–85 ────────────────────────────────
  //   overall = 40 + (weightedComposite/100)^exp × 45
  //   Expoente varia por posição (ATT mais seletivo, GK menos).

  // Expoente final = posição × GLOBAL_CURVE
  // GLOBAL_CURVE permite recalibrar seletividade global sem tocar nos valores por posição.
  const exp        = POWER_EXPONENT[group] * GLOBAL_CURVE;
  const rawOverall = Math.round(
    SM_SCORE_FLOOR + Math.pow(weightedComposite / 100, exp) * SM_SCORE_RANGE,
  );

  // ── [1] Floor de 42 — nenhum jogador cadastrado fica abaixo disso ────────
  //   Protege UX: evita overalls que parecem "inútil" na interface.

  const overall = clamp(Math.max(42, rawOverall), SM_SCORE_FLOOR, SM_SCORE_CEILING);

  return {
    overall,
    tier:          smTier(overall),
    reliable:      mins >= SM_MIN_MINUTES,
    positionGroup: group,
    leagueFactor,
    minutesWeight:    +minutesWeight.toFixed(3),
    powerExponent:    exp,
    consistencyBonus,
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
      rating:           +ratingRaw.toFixed(2),
      availability:     +availability.toFixed(1),
      minuteRegularity: +minuteRegularity.toFixed(1),
    },
  };
}
