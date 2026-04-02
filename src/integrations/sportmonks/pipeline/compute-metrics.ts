import type { RawStats } from "./normalize-stats";

// ---------------------------------------------------------------------------
// Context passed alongside raw stats
// ---------------------------------------------------------------------------
export interface PlayerContext {
  position: string | null;
  age: number | null;
}

// ---------------------------------------------------------------------------
// Per-game rates derived from raw stats
// ---------------------------------------------------------------------------
export interface PerGameRates {
  goals: number;
  assists: number;
  xG: number;
  xA: number;
  xGChain: number;
  xGBuildup: number;
  keyPasses: number;
  progressivePasses: number;
  progressiveCarries: number;
  shotsTotal: number;
  shotsOnTarget: number;
  tackles: number;
  interceptions: number;
  pressures: number;
  pressuresSuccess: number;
  recoveries: number;
  duelsWon: number;
  aerialDuelsWon: number;
  distanceCovered: number;
  sprints: number;
  foulsCommitted: number;
}

// ---------------------------------------------------------------------------
// Derived scores (all 0–100)
// ---------------------------------------------------------------------------
export interface DerivedScores {
  /** Goals + assists contribution weighted by xG/xA efficiency */
  attackingImpact: number;

  /** Passing quality, progressive distribution, build-up involvement */
  buildUpScore: number;

  /** Dribbles, carries, transition speed, vertical progression */
  transitionScore: number;

  /** Tackles, interceptions, pressures, recoveries per game */
  defensiveActivity: number;

  /** Decision quality: pass accuracy, shot accuracy, duel success */
  decisionScore: number;

  /** xG overperformance, shot conversion, dribble success rate */
  efficiencyScore: number;

  /** Rating stability proxy, minutes regularity, discipline */
  consistencyScore: number;

  /** Position-aware role fit combining all block scores */
  tacticalFitScore: number;

  /** Offensive involvement: xG chain + buildup + key passes */
  involvementScore: number;
}

// ---------------------------------------------------------------------------
// Block overalls — used by build-profile.ts
// ---------------------------------------------------------------------------
export interface BlockScores {
  technical: number;
  physical: number;
  tactical: number;
  riskScore: number;    // 0–100, higher = more risky
  projectionScore: number;
}

// ---------------------------------------------------------------------------
// Full computed metrics exported to build-profile
// ---------------------------------------------------------------------------
export interface ComputedMetrics {
  raw: RawStats;
  context: PlayerContext;
  perGame: PerGameRates;
  derived: DerivedScores;
  blocks: BlockScores;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
function clamp(v: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, v));
}

function safe(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

function isForward(position: string | null): boolean {
  return /forward|striker|winger|centre.forward|cf|lw|rw|ss|second.striker/i.test(position ?? "");
}

function isMidfielder(position: string | null): boolean {
  return /midfield|cm|cam|cdm|dm|am|attacking.mid|central.mid|box.to.box/i.test(position ?? "");
}

function isDefender(position: string | null): boolean {
  return /defender|back|cb|lb|rb|wb|centre.back|full.back|wingback/i.test(position ?? "");
}

// ---------------------------------------------------------------------------
// Per-game rate computation
// ---------------------------------------------------------------------------
function computePerGame(r: RawStats): PerGameRates {
  const apps = Math.max(r.appearances, 1);
  return {
    goals: safe(r.goals, apps),
    assists: safe(r.assists, apps),
    xG: safe(r.xG, apps),
    xA: safe(r.xA, apps),
    xGChain: safe(r.xGChain, apps),
    xGBuildup: safe(r.xGBuildup, apps),
    keyPasses: safe(r.keyPasses, apps),
    progressivePasses: safe(r.progressivePasses, apps),
    progressiveCarries: safe(r.progressiveCarries, apps),
    shotsTotal: safe(r.shotsTotal, apps),
    shotsOnTarget: safe(r.shotsOnTarget, apps),
    tackles: safe(r.tackles, apps),
    interceptions: safe(r.interceptions, apps),
    pressures: safe(r.pressures, apps),
    pressuresSuccess: safe(r.pressuresSuccess, apps),
    recoveries: safe(r.recoveries, apps),
    duelsWon: safe(r.duelsWon, apps),
    aerialDuelsWon: safe(r.aerialDuelsWon, apps),
    distanceCovered: safe(r.distanceCovered, apps),
    sprints: safe(r.sprints, apps),
    foulsCommitted: safe(r.foulsCommitted, apps),
  };
}

// ---------------------------------------------------------------------------
// Derived scores
// ---------------------------------------------------------------------------
function computeAttackingImpact(r: RawStats, pg: PerGameRates): number {
  const xGEfficiency = r.xG > 0 ? clamp(safe(r.goals, r.xG) * 50) : 0;
  const xAEfficiency = r.xA > 0 ? clamp(safe(r.assists, r.xA) * 40) : 0;
  const volumeScore = clamp(pg.goals * 35 + pg.assists * 25 + pg.xG * 15 + pg.xA * 10 + pg.keyPasses * 3);
  return clamp(volumeScore * 0.6 + xGEfficiency * 0.25 + xAEfficiency * 0.15);
}

function computeBuildUpScore(r: RawStats, pg: PerGameRates): number {
  const passQuality = clamp(r.passAccuracyPct * 0.7 + 15);
  const progressionScore = clamp(pg.progressivePasses * 4 + pg.progressiveCarries * 3);
  const creationScore = clamp(pg.keyPasses * 10 + pg.xA * 20 + pg.xGBuildup * 15);
  const longRangeScore = r.longPasses > 0 ? clamp(safe(r.longPassAccuracy, 100) * 40) : 0;
  return clamp(passQuality * 0.35 + progressionScore * 0.3 + creationScore * 0.25 + longRangeScore * 0.1);
}

function computeTransitionScore(r: RawStats, pg: PerGameRates): number {
  const dribbleRate = clamp(safe(r.dribblesSuccess, Math.max(r.dribblesAttempted, 1)) * 80);
  const carryScore = clamp(pg.progressiveCarries * 5 + pg.progressivePasses * 3);
  const speedProxy = clamp(pg.sprints * 0.4 + pg.distanceCovered * 0.01);
  const breakingLines = clamp(pg.progressivePasses * 4 + pg.progressiveCarries * 4);
  return clamp(dribbleRate * 0.35 + carryScore * 0.25 + speedProxy * 0.15 + breakingLines * 0.25);
}

function computeDefensiveActivity(r: RawStats, pg: PerGameRates): number {
  const pressingIntensity = clamp(pg.pressures * 1.5 + safe(r.pressuresSuccess, Math.max(r.pressures, 1)) * 30);
  const recoveringBalls = clamp((pg.tackles + pg.interceptions + pg.recoveries) * 5);
  const aerialPresence = clamp(safe(r.aerialDuelsWon, Math.max(r.aerialDuelsTotal, 1)) * 80);
  const clearingActions = clamp(safe(r.clearances, Math.max(r.appearances, 1)) * 3 + safe(r.blocks, Math.max(r.appearances, 1)) * 5);
  return clamp(pressingIntensity * 0.3 + recoveringBalls * 0.35 + aerialPresence * 0.2 + clearingActions * 0.15);
}

function computeDecisionScore(r: RawStats, pg: PerGameRates): number {
  const passingDecision = clamp(r.passAccuracyPct * 0.6 + 20);
  const shotDecision = r.shotsTotal > 0
    ? clamp(safe(r.shotsOnTarget, r.shotsTotal) * 70 + 20)
    : 50;
  const duelDecision = clamp(safe(r.duelsWon, Math.max(r.duelsTotal, 1)) * 80 + 10);
  const disciplineProxy = clamp(100 - (pg.foulsCommitted * 15 + r.yellowCards * 5 + r.redCards * 20));
  return clamp(passingDecision * 0.35 + shotDecision * 0.25 + duelDecision * 0.25 + disciplineProxy * 0.15);
}

function computeEfficiencyScore(r: RawStats): number {
  const goalEfficiency = r.xG > 0
    ? clamp(safe(r.goals, r.xG) * 60)
    : (r.shotsTotal > 0 ? clamp(safe(r.goals, r.shotsTotal) * 200) : 40);
  const passEfficiency = clamp(r.passAccuracyPct * 0.8);
  const dribbleEfficiency = r.dribblesAttempted > 0
    ? clamp(safe(r.dribblesSuccess, r.dribblesAttempted) * 80)
    : 50;
  const pressureEfficiency = r.pressures > 0
    ? clamp(safe(r.pressuresSuccess, r.pressures) * 80)
    : 45;
  return clamp(goalEfficiency * 0.35 + passEfficiency * 0.3 + dribbleEfficiency * 0.2 + pressureEfficiency * 0.15);
}

function computeConsistencyScore(r: RawStats): number {
  const ratingScore = r.rating > 0 ? clamp(r.rating * 10) : 55;
  const minutesRatio = clamp(safe(r.minutesPlayed, Math.max(r.appearances * 90, 1)) * 100);
  const disciplineScore = clamp(100 - (r.yellowCards * 8 + r.redCards * 25));
  const availabilityScore = r.appearances > 0
    ? clamp(100 - safe(r.gamesMissed, r.appearances + r.gamesMissed) * 100)
    : 60;
  return clamp(ratingScore * 0.4 + minutesRatio * 0.3 + disciplineScore * 0.15 + availabilityScore * 0.15);
}

function computeInvolvementScore(r: RawStats, pg: PerGameRates): number {
  const chainScore = clamp(pg.xGChain * 30);
  const buildupScore = clamp(pg.xGBuildup * 25);
  const directScore = clamp(pg.keyPasses * 8 + pg.xA * 20 + pg.xG * 15);
  return clamp(chainScore * 0.35 + buildupScore * 0.3 + directScore * 0.35);
}

function computeTacticalFitScore(
  position: string | null,
  derived: Omit<DerivedScores, "tacticalFitScore">,
  blocks: Omit<BlockScores, "riskScore" | "projectionScore">,
): number {
  if (isForward(position)) {
    return clamp(
      derived.attackingImpact * 0.35 +
      derived.efficiencyScore * 0.25 +
      derived.transitionScore * 0.2 +
      derived.involvementScore * 0.1 +
      blocks.technical * 0.1,
    );
  }
  if (isMidfielder(position)) {
    return clamp(
      derived.buildUpScore * 0.3 +
      derived.decisionScore * 0.2 +
      derived.transitionScore * 0.2 +
      derived.defensiveActivity * 0.15 +
      derived.involvementScore * 0.15,
    );
  }
  if (isDefender(position)) {
    return clamp(
      derived.defensiveActivity * 0.35 +
      derived.decisionScore * 0.2 +
      derived.consistencyScore * 0.2 +
      derived.buildUpScore * 0.15 +
      blocks.physical * 0.1,
    );
  }
  // Unknown position — balanced
  return clamp(
    (derived.attackingImpact + derived.buildUpScore + derived.defensiveActivity + derived.decisionScore) / 4,
  );
}

// ---------------------------------------------------------------------------
// Block overalls
// ---------------------------------------------------------------------------
function computeBlockScores(
  r: RawStats,
  pg: PerGameRates,
  derived: Omit<DerivedScores, "tacticalFitScore">,
  ctx: PlayerContext,
): BlockScores {
  // Technical: weighted mix of attacking, build-up, efficiency
  const technical = clamp(
    derived.attackingImpact * 0.3 +
    derived.buildUpScore * 0.3 +
    derived.efficiencyScore * 0.25 +
    derived.transitionScore * 0.15,
  );

  // Physical: distance, sprints, aerial, duels
  const staminaProxy = clamp(pg.distanceCovered * 0.9);
  const sprintProxy = clamp(pg.sprints * 0.8);
  const aerialProxy = clamp(safe(r.aerialDuelsWon, Math.max(r.aerialDuelsTotal, 1)) * 100);
  const duelProxy = clamp(safe(r.duelsWon, Math.max(r.duelsTotal, 1)) * 100);
  const physical = clamp((staminaProxy + sprintProxy + aerialProxy + duelProxy) / 4);

  // Tactical: decision + tactical fit base (before position-awareness)
  const tacticalBase = clamp(derived.decisionScore * 0.4 + derived.buildUpScore * 0.3 + derived.defensiveActivity * 0.3);

  // Risk: aggregated from availability, discipline, injury history
  const disciplineRisk = clamp((r.yellowCards * 8 + r.redCards * 25) / Math.max(r.appearances, 1) * 10);
  const availabilityRisk = clamp(100 - safe(r.minutesPlayed, Math.max(r.appearances * 90, 1)) * 100);
  const injuryRisk = clamp(r.gamesMissed > 0 ? safe(r.gamesMissed, r.appearances + r.gamesMissed) * 100 : 20);
  const ageRisk = ctx.age ? clamp((ctx.age - 28) * 4 + 25) : 35;
  const riskScore = clamp((disciplineRisk + availabilityRisk + injuryRisk + ageRisk) / 4);

  // Projection: growth ceiling based on current performance and age
  const growthFactor = ctx.age ? Math.max(0, 1 - (ctx.age - 22) * 0.045) : 0.5;
  const projectionScore = clamp(technical * (1 + growthFactor * 0.25));

  return { technical: Math.round(technical), physical: Math.round(physical), tactical: Math.round(tacticalBase), riskScore: Math.round(riskScore), projectionScore: Math.round(projectionScore) };
}

// ---------------------------------------------------------------------------
// computeMetrics — main export
// ---------------------------------------------------------------------------
export function computeMetrics(raw: RawStats, context: PlayerContext): ComputedMetrics {
  const perGame = computePerGame(raw);

  const attackingImpact  = Math.round(computeAttackingImpact(raw, perGame));
  const buildUpScore     = Math.round(computeBuildUpScore(raw, perGame));
  const transitionScore  = Math.round(computeTransitionScore(raw, perGame));
  const defensiveActivity = Math.round(computeDefensiveActivity(raw, perGame));
  const decisionScore    = Math.round(computeDecisionScore(raw, perGame));
  const efficiencyScore  = Math.round(computeEfficiencyScore(raw));
  const consistencyScore = Math.round(computeConsistencyScore(raw));
  const involvementScore = Math.round(computeInvolvementScore(raw, perGame));

  const partialDerived = {
    attackingImpact,
    buildUpScore,
    transitionScore,
    defensiveActivity,
    decisionScore,
    efficiencyScore,
    consistencyScore,
    involvementScore,
  };

  const blocks = computeBlockScores(raw, perGame, partialDerived, context);

  const tacticalFitScore = Math.round(
    computeTacticalFitScore(context.position, partialDerived, blocks),
  );

  const derived: DerivedScores = { ...partialDerived, tacticalFitScore };

  return { raw, context, perGame, derived, blocks };
}
