import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { calculateCapitalEfficiency } from "./capital-efficiency.engine";
import { classifyPlayerArchetype } from "./archetype.engine";
import { calculateFinancialRisk } from "./financial-risk.engine";
import { calculateGrowthProjection } from "./growth-projection.engine";
import { buildNormalizedRiskPayload } from "./investment-risk.engine";
import { calculateLiquidityScore } from "./liquidity.engine";
import { calculateOverallRating } from "./overall.engine";
import { calculateRankingScore } from "./ranking.engine";
import { POSITION_WEIGHTS } from "./ranking.weights";
import { calculateRiskScore } from "./risk.engine";
import { getPrimaryPosition } from "../utils/positions";
import { mapPlayerRecord } from "../mappers/player.mapper";
import { withCache } from "../lib/cache";
import { buildPlayerIntelligenceProfile } from "./player-intelligence.service";

type LatestMetricsSnapshot = {
  overall: number;
  potential: number;
  pace: number;
  shooting: number;
  passing: number;
  defending: number;
  physical: number;
  dribbling: number | null;
  timestamp: Date;
};

type LatestFinancialSnapshot = {
  marketValue: number | null;
  salary: number | null;
  transferCostEstimate: number | null;
  contractYears: number | null;
  timestamp: Date;
};

type LatestRiskSnapshot = {
  structuralRisk: number;
  financialRisk: number;
  liquidityScore: number;
  compositeRisk: number;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  explanation: string | null;
  timestamp: Date;
};

type ListPlayersParams = {
  search?: string;
  positions?: string[];
  position?: string;
  nationality?: string;
  team?: string;
  league?: string;
  source?: string;
  overallMin?: number;
  overallMax?: number;
  minOverall?: number;
  potentialMin?: number;
  potentialMax?: number;
  marketValueMin?: number;
  marketValueMax?: number;
  ageMin?: number;
  ageMax?: number;
  page?: number;
  limit?: number;
};

export type PlayerSummarySource = {
  id: string;
  name: string;
  source?: string | null;
  positions: string[] | null;
  team: string | null;
  league: string | null;
  nationality: string | null;
  age: number | null;
  overall: number | null;
  potential: number | null;
  marketValue: number | null;
  imagePath: string | null;
  attributes: any;
  contractEnd?: Date | null;
  updatedAt?: Date;
  metricsSnapshots?: LatestMetricsSnapshot[];
  financialSnapshots?: LatestFinancialSnapshot[];
  riskSnapshots?: LatestRiskSnapshot[];
};

export const PLAYER_SNAPSHOT_INCLUDE = {
  metricsSnapshots: {
    orderBy: { timestamp: "desc" },
    take: 1,
  },
  financialSnapshots: {
    orderBy: { timestamp: "desc" },
    take: 1,
  },
  riskSnapshots: {
    orderBy: { timestamp: "desc" },
    take: 1,
  },
} as const;

export const PLAYER_SNAPSHOT_SELECT = {
  metricsSnapshots: {
    orderBy: { timestamp: "desc" },
    take: 1,
  },
  financialSnapshots: {
    orderBy: { timestamp: "desc" },
    take: 1,
  },
  riskSnapshots: {
    orderBy: { timestamp: "desc" },
    take: 1,
  },
} as const;

type FifaCore = {
  pace: number;
  shooting: number;
  passing: number;
  dribbling: number;
  defending: number;
  physical: number;
};

type DetailedStats = {
  crossing: number;
  finishing: number;
  headingAccuracy: number;
  shortPassing: number;
  volleys: number;
  dribbling: number;
  curve: number;
  fkAccuracy: number;
  longPassing: number;
  ballControl: number;
  acceleration: number;
  sprintSpeed: number;
  agility: number;
  reactions: number;
  balance: number;
  shotPower: number;
  jumping: number;
  stamina: number;
  strength: number;
  longShots: number;
  aggression: number;
  interceptions: number;
  attackPosition: number;
  vision: number;
  penalties: number;
  composure: number;
  defensiveAwareness: number;
  standingTackle: number;
  slidingTackle: number;
  gkDiving: number;
  gkHandling: number;
  gkKicking: number;
  gkPositioning: number;
  gkReflexes: number;
};

function clampFifaCore(value: number) {
  return Math.max(40, Math.min(99, Math.round(value)));
}

function hasFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isMissingSnapshotTableError(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2021" &&
    typeof error.message === "string" &&
    (error.message.includes("PlayerMetrics") ||
      error.message.includes("PlayerFinancials") ||
      error.message.includes("PlayerRiskSnapshot"))
  );
}

async function findPlayerWithSnapshots(id: string) {
  try {
    return await prisma.player.findUnique({
      where: { id },
      include: PLAYER_SNAPSHOT_INCLUDE,
    });
  } catch (error) {
    if (!isMissingSnapshotTableError(error)) {
      throw error;
    }

    return prisma.player.findUnique({
      where: { id },
    });
  }
}

async function findPlayersWithSnapshots(args: {
  where: Record<string, unknown>;
  skip?: number;
  take?: number;
  orderBy?: Array<Record<string, "asc" | "desc">>;
}) {
  try {
    return await prisma.player.findMany({
      ...args,
      select: {
        id: true,
        name: true,
        source: true,
        team: true,
        league: true,
        positions: true,
        age: true,
        nationality: true,
        overall: true,
        potential: true,
        marketValue: true,
        imagePath: true,
        attributes: true,
        contractEnd: true,
        updatedAt: true,
        ...PLAYER_SNAPSHOT_SELECT,
      },
    });
  } catch (error) {
    if (!isMissingSnapshotTableError(error)) {
      throw error;
    }

    return prisma.player.findMany({
      ...args,
      select: {
        id: true,
        name: true,
        source: true,
        team: true,
        league: true,
        positions: true,
        age: true,
        nationality: true,
        overall: true,
        potential: true,
        marketValue: true,
        imagePath: true,
        attributes: true,
        contractEnd: true,
        updatedAt: true,
      },
    });
  }
}

function generateAttributesFromOverall(overall: number, position: string) {
  const base = Math.round(overall);
  const clamp = (value: number) => Math.max(40, Math.min(99, Math.round(value)));

  const presets: Record<
    string,
    { pace: number; shooting: number; passing: number; dribbling: number; defending: number; physical: number }
  > = {
    GK: { pace: -18, shooting: -20, passing: -8, dribbling: -12, defending: +4, physical: +2 },
    CB: { pace: -8, shooting: -14, passing: -6, dribbling: -8, defending: +4, physical: +3 },
    LB: { pace: +2, shooting: -8, passing: -2, dribbling: -1, defending: +1, physical: +2 },
    RB: { pace: +2, shooting: -8, passing: -2, dribbling: -1, defending: +1, physical: +2 },
    LWB: { pace: +3, shooting: -7, passing: -1, dribbling: +1, defending: 0, physical: +1 },
    RWB: { pace: +3, shooting: -7, passing: -1, dribbling: +1, defending: 0, physical: +1 },
    CDM: { pace: -5, shooting: -10, passing: -3, dribbling: -5, defending: +2, physical: +1 },
    CM: { pace: -2, shooting: -3, passing: +1, dribbling: 0, defending: -1, physical: 0 },
    CAM: { pace: -1, shooting: +1, passing: +2, dribbling: +2, defending: -7, physical: -3 },
    LM: { pace: +1, shooting: -2, passing: +1, dribbling: +1, defending: -4, physical: -1 },
    RM: { pace: +1, shooting: -2, passing: +1, dribbling: +1, defending: -4, physical: -1 },
    LW: { pace: +2, shooting: 0, passing: -2, dribbling: +2, defending: -9, physical: -2 },
    RW: { pace: +2, shooting: 0, passing: -2, dribbling: +2, defending: -9, physical: -2 },
    CF: { pace: 0, shooting: +1, passing: -1, dribbling: +1, defending: -8, physical: -2 },
    ST: { pace: -1, shooting: +2, passing: -4, dribbling: 0, defending: -10, physical: -2 },
  };

  const profile = presets[position] ?? presets.CM;

  return {
    pace: clamp(base + profile.pace),
    shooting: clamp(base + profile.shooting),
    passing: clamp(base + profile.passing),
    dribbling: clamp(base + profile.dribbling),
    defending: clamp(base + profile.defending),
    physical: clamp(base + profile.physical),
  };
}

function resolveStoredFifaCore(attributes: any): FifaCore | null {
  const candidate = attributes?.core && typeof attributes.core === "object" ? attributes.core : attributes;

  if (
    !hasFiniteNumber(candidate?.pace) ||
    !hasFiniteNumber(candidate?.shooting) ||
    !hasFiniteNumber(candidate?.passing) ||
    !hasFiniteNumber(candidate?.dribbling) ||
    !hasFiniteNumber(candidate?.defending) ||
    !hasFiniteNumber(candidate?.physical)
  ) {
    return null;
  }

  return {
    pace: clampFifaCore(candidate.pace),
    shooting: clampFifaCore(candidate.shooting),
    passing: clampFifaCore(candidate.passing),
    dribbling: clampFifaCore(candidate.dribbling),
    defending: clampFifaCore(candidate.defending),
    physical: clampFifaCore(candidate.physical),
  };
}

function resolveFifa(attributes: any, position: string) {
  const storedCore = resolveStoredFifaCore(attributes);
  if (storedCore) {
    return storedCore;
  }

  const fallbackOverall = Number(attributes?.overall);
  if (Number.isFinite(fallbackOverall) && fallbackOverall > 0) {
    return generateAttributesFromOverall(fallbackOverall, position);
  }

  return generateAttributesFromOverall(60, position);
}

function buildCategoryIndex(fifa: any) {
  return {
    attacking: fifa.shooting ?? 50,
    skill: fifa.dribbling ?? 50,
    movement: fifa.pace ?? 50,
    power: fifa.physical ?? 50,
    mentality: 60,
    defending: fifa.defending ?? 50,
  };
}

function resolvePlayerPosition(player: { positions?: string[] | null }) {
  const primaryPosition = getPrimaryPosition(player as any);
  return POSITION_WEIGHTS[primaryPosition] ? primaryPosition : "CM";
}

function getLatestMetricsSnapshot(player: PlayerSummarySource) {
  return player.metricsSnapshots?.[0] ?? null;
}

function getLatestFinancialSnapshot(player: PlayerSummarySource) {
  return player.financialSnapshots?.[0] ?? null;
}

function getLatestRiskSnapshot(player: PlayerSummarySource) {
  return player.riskSnapshots?.[0] ?? null;
}

function isSnapshotFresh(player: PlayerSummarySource, snapshot: { timestamp: Date } | null) {
  if (!snapshot) {
    return false;
  }

  if (!player.updatedAt) {
    return true;
  }

  return snapshot.timestamp >= player.updatedAt;
}

function hasFreshSnapshots(player: PlayerSummarySource) {
  const latestMetrics = getLatestMetricsSnapshot(player);
  const latestFinancial = getLatestFinancialSnapshot(player);
  const latestRisk = getLatestRiskSnapshot(player);

  return (
    isSnapshotFresh(player, latestMetrics) &&
    isSnapshotFresh(player, latestFinancial) &&
    isSnapshotFresh(player, latestRisk)
  );
}

function normalizeContractYears(contractEnd?: Date | null) {
  if (!contractEnd) {
    return null;
  }

  const now = new Date();
  const diffMs = contractEnd.getTime() - now.getTime();
  if (diffMs <= 0) {
    return 0;
  }

  return Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24 * 365)));
}

function resolveTransferCostEstimate(marketValue: number | null, liquidityScore: number) {
  if (!marketValue || marketValue <= 0) {
    return null;
  }

  const liquidityPremium = liquidityScore >= 8 ? 1.15 : liquidityScore >= 6 ? 1.08 : 1.02;
  return Number((marketValue * liquidityPremium).toFixed(2));
}

function flattenDetailedStats(detailedStats: ReturnType<typeof calculateOverallRating>["fifaStyle"]["detailedStats"]) {
  return {
    crossing: detailedStats.attacking.crossing,
    finishing: detailedStats.attacking.finishing,
    headingAccuracy: detailedStats.attacking.headingAccuracy,
    shortPassing: detailedStats.attacking.shortPassing,
    volleys: detailedStats.attacking.volleys,
    dribbling: detailedStats.skill.dribbling,
    curve: detailedStats.skill.curve,
    fkAccuracy: detailedStats.skill.fkAccuracy,
    longPassing: detailedStats.skill.longPassing,
    ballControl: detailedStats.skill.ballControl,
    acceleration: detailedStats.movement.acceleration,
    sprintSpeed: detailedStats.movement.sprintSpeed,
    agility: detailedStats.movement.agility,
    reactions: detailedStats.movement.reactions,
    balance: detailedStats.movement.balance,
    shotPower: detailedStats.power.shotPower,
    jumping: detailedStats.power.jumping,
    stamina: detailedStats.power.stamina,
    strength: detailedStats.power.strength,
    longShots: detailedStats.power.longShots,
    aggression: detailedStats.mentality.aggression,
    interceptions: detailedStats.mentality.interceptions,
    attackPosition: detailedStats.mentality.attackPosition,
    vision: detailedStats.mentality.vision,
    penalties: detailedStats.mentality.penalties,
    composure: detailedStats.mentality.composure,
    defensiveAwareness: detailedStats.defending.defensiveAwareness,
    standingTackle: detailedStats.defending.standingTackle,
    slidingTackle: detailedStats.defending.slidingTackle,
    gkDiving: detailedStats.goalkeeping.diving,
    gkHandling: detailedStats.goalkeeping.handling,
    gkKicking: detailedStats.goalkeeping.kicking,
    gkPositioning: detailedStats.goalkeeping.positioning,
    gkReflexes: detailedStats.goalkeeping.reflexes,
  };
}

function resolveStoredDetailedStats(attributes: any): DetailedStats | null {
  const candidate = attributes && typeof attributes === "object" ? attributes : null;
  if (!candidate) return null;

  const values: DetailedStats = {
    crossing: Number(candidate.crossing),
    finishing: Number(candidate.finishing),
    headingAccuracy: Number(candidate.headingAccuracy),
    shortPassing: Number(candidate.shortPassing),
    volleys: Number(candidate.volleys),
    dribbling: Number(candidate.dribbling),
    curve: Number(candidate.curve),
    fkAccuracy: Number(candidate.fkAccuracy),
    longPassing: Number(candidate.longPassing),
    ballControl: Number(candidate.ballControl),
    acceleration: Number(candidate.acceleration),
    sprintSpeed: Number(candidate.sprintSpeed),
    agility: Number(candidate.agility),
    reactions: Number(candidate.reactions),
    balance: Number(candidate.balance),
    shotPower: Number(candidate.shotPower),
    jumping: Number(candidate.jumping),
    stamina: Number(candidate.stamina),
    strength: Number(candidate.strength),
    longShots: Number(candidate.longShots),
    aggression: Number(candidate.aggression),
    interceptions: Number(candidate.interceptions),
    attackPosition: Number(candidate.attackPosition),
    vision: Number(candidate.vision),
    penalties: Number(candidate.penalties),
    composure: Number(candidate.composure),
    defensiveAwareness: Number(candidate.defensiveAwareness),
    standingTackle: Number(candidate.standingTackle),
    slidingTackle: Number(candidate.slidingTackle),
    gkDiving: Number(candidate.gkDiving),
    gkHandling: Number(candidate.gkHandling),
    gkKicking: Number(candidate.gkKicking),
    gkPositioning: Number(candidate.gkPositioning),
    gkReflexes: Number(candidate.gkReflexes),
  };

  const validCount = Object.values(values).filter((value) => Number.isFinite(value)).length;
  return validCount >= 10 ? values : null;
}

function resolvePotential(overall: number) {
  return Math.max(overall, Math.min(99, overall + 5));
}

function resolveTier(overall: number) {
  if (overall >= 85) return "ELITE";
  if (overall >= 80) return "A";
  if (overall >= 75) return "B";
  if (overall >= 70) return "C";
  return "DEVELOPMENT";
}

function buildRiskAnalytics(params: {
  age: number;
  position: string;
  performanceScore: number;
  categoryIndex: ReturnType<typeof buildCategoryIndex>;
  overall: number;
  potential: number;
}) {
  const risk = calculateRiskScore({
    age: params.age,
    position: params.position,
    performanceScore: params.performanceScore,
    averagePositionScore: params.performanceScore,
    categoryIndex: params.categoryIndex,
  });
  const classification: "SAFE" | "MODERATE" | "HIGH_RISK" =
    risk.totalRisk >= 55 ? "HIGH_RISK" : risk.totalRisk >= 25 ? "MODERATE" : "SAFE";

  const antiFlop = {
    flopProbability: risk.totalRisk,
    safetyIndex: 100 - risk.totalRisk,
    confidenceScore: 80,
    classification,
    decisionHint: "PROCEED" as const,
    keyDrivers: [] as string[],
    breakdown: {
      structural: risk.breakdown.structural,
      competitive: risk.breakdown.competitive,
      ageCurve: risk.breakdown.age,
      medical: 0,
      uncertainty: 0,
    },
  };

  const liquidity = calculateLiquidityScore({
    age: params.age,
    performanceScore: params.performanceScore,
    averagePositionScore: params.performanceScore,
    risk,
    antiFlop,
  });

  const financialRisk = calculateFinancialRisk({
    structuralRisk: risk.totalRisk,
    flopProbability: risk.totalRisk,
    liquidityScore: liquidity.liquidityScore,
    age: params.age,
    overall: params.overall,
  });

  const normalizedRisk = buildNormalizedRiskPayload({
    age: params.age,
    overall: params.overall,
    potential: params.potential,
    structuralRisk: risk,
    financialRisk,
    liquidity,
  });

  const capitalEfficiency = calculateCapitalEfficiency({
    performanceScore: params.performanceScore,
    flopProbability: risk.totalRisk,
    liquidityScore: liquidity.liquidityScore,
    financialRiskIndex: financialRisk.riskIndex,
  });

  return {
    risk,
    antiFlop,
    liquidity,
    financialRisk,
    normalizedRisk,
    capitalEfficiency,
  };
}

export function buildPlayerSummary(player: PlayerSummarySource) {
  const playerPosition = resolvePlayerPosition(player);
  const weights = POSITION_WEIGHTS[playerPosition];
  const rawAttributes = player.attributes ?? {};
  const latestMetrics = getLatestMetricsSnapshot(player);
  const latestFinancial = getLatestFinancialSnapshot(player);
  const latestRisk = getLatestRiskSnapshot(player);
  const snapshotFifa = latestMetrics
    ? {
        pace: latestMetrics.pace,
        shooting: latestMetrics.shooting,
        passing: latestMetrics.passing,
        dribbling: latestMetrics.dribbling ?? latestMetrics.passing,
        defending: latestMetrics.defending,
        physical: latestMetrics.physical,
      }
    : null;
  const fifa = snapshotFifa ?? resolveFifa(rawAttributes, playerPosition);
  const categoryIndex = buildCategoryIndex(fifa);
  const performanceScore = calculateRankingScore(fifa, weights);
  const persistedOverall = latestMetrics
    ? clampFifaCore(latestMetrics.overall)
    : hasFiniteNumber(player.overall)
      ? clampFifaCore(player.overall)
      : null;
  const persistedPotential = latestMetrics
    ? clampFifaCore(latestMetrics.potential)
    : hasFiniteNumber(player.potential)
      ? clampFifaCore(player.potential)
      : null;
  const storedDetailedStats = resolveStoredDetailedStats(rawAttributes);
  const shouldReusePersistedProfile =
    fifa !== null &&
    persistedOverall !== null &&
    storedDetailedStats !== null;

  const computedOverall = shouldReusePersistedProfile
    ? null
    : calculateOverallRating({
        position: playerPosition,
        performanceScore,
        categoryIndex,
        macroOverall: Object.values(categoryIndex).reduce((total, value) => total + value, 0) / 6,
        fifaAttributes: fifa,
        rawAttributes,
      });

  const finalOverall = persistedOverall ?? computedOverall?.overall ?? 60;
  const potential = persistedPotential ?? resolvePotential(finalOverall);
  const detailedStats =
    storedDetailedStats ??
    (computedOverall
      ? flattenDetailedStats(computedOverall.fifaStyle.detailedStats)
      : {
          crossing: fifa.passing,
          finishing: fifa.shooting,
          headingAccuracy: fifa.physical,
          shortPassing: fifa.passing,
          volleys: fifa.shooting,
          dribbling: fifa.dribbling,
          curve: fifa.passing,
          fkAccuracy: fifa.passing,
          longPassing: fifa.passing,
          ballControl: fifa.dribbling,
          acceleration: fifa.pace,
          sprintSpeed: fifa.pace,
          agility: fifa.dribbling,
          reactions: finalOverall,
          balance: fifa.dribbling,
          shotPower: fifa.shooting,
          jumping: fifa.physical,
          stamina: fifa.physical,
          strength: fifa.physical,
          longShots: fifa.shooting,
          aggression: fifa.defending,
          interceptions: fifa.defending,
          attackPosition: fifa.shooting,
          vision: fifa.passing,
          penalties: fifa.shooting,
          composure: finalOverall,
          defensiveAwareness: fifa.defending,
          standingTackle: fifa.defending,
          slidingTackle: fifa.defending,
          gkDiving: playerPosition === "GK" ? finalOverall : 40,
          gkHandling: playerPosition === "GK" ? finalOverall : 40,
          gkKicking: playerPosition === "GK" ? finalOverall : 40,
          gkPositioning: playerPosition === "GK" ? finalOverall : 40,
          gkReflexes: playerPosition === "GK" ? finalOverall : 40,
        });
  const overall = {
    ...(computedOverall ?? {
      tier: resolveTier(finalOverall),
      positionRank: `${resolveTier(finalOverall)} Tier ${playerPosition}`,
      fifaStyle: {
        overall: finalOverall,
        core: fifa,
        categories: categoryIndex,
        detailedStats: null,
      },
    }),
    overall: finalOverall,
    tier: resolveTier(finalOverall),
    positionRank: `${resolveTier(finalOverall)} Tier ${playerPosition}`,
    fifaStyle: {
      ...(computedOverall?.fifaStyle ?? {}),
      overall: finalOverall,
      core: fifa,
    },
  };

  const profile = mapPlayerRecord({
    id: player.id,
    name: player.name,
    positions: player.positions ?? [playerPosition],
    team: player.team ?? null,
    league: player.league ?? null,
    nationality: player.nationality ?? "Unknown",
    age: player.age ?? 0,
    overall: finalOverall,
    potential,
    marketValue: latestFinancial?.marketValue ?? player.marketValue ?? null,
    imagePath: player.imagePath ?? null,
    attributes: {
      ...overall.fifaStyle.core,
      ...detailedStats,
    },
  });

  const analytics = buildRiskAnalytics({
    age: player.age ?? 25,
    position: playerPosition,
    performanceScore,
    categoryIndex,
    overall: finalOverall,
    potential,
  });

  return {
    player: {
      ...profile,
      capitalEfficiency: analytics.capitalEfficiency.index,
      riskLevel: latestRisk?.riskLevel ?? analytics.normalizedRisk.risk.level,
      risk: latestRisk
        ? {
            score: latestRisk.compositeRisk,
            level: latestRisk.riskLevel,
            explanation:
              latestRisk.explanation ??
              analytics.normalizedRisk.risk.explanation,
          }
        : analytics.normalizedRisk.risk,
      structuralRisk: latestRisk
        ? {
            score: latestRisk.structuralRisk,
            level: latestRisk.riskLevel,
            breakdown:
              latestRisk.explanation ??
              analytics.normalizedRisk.structuralRisk.breakdown,
          }
        : analytics.normalizedRisk.structuralRisk,
      antiFlopIndex: {
        flopProbability: analytics.antiFlop.flopProbability,
        safetyIndex: analytics.antiFlop.safetyIndex,
        classification: analytics.antiFlop.classification,
      },
      liquidity: latestRisk
        ? {
            ...analytics.normalizedRisk.liquidity,
            score: latestRisk.liquidityScore,
          }
        : analytics.normalizedRisk.liquidity,
      financialRisk: latestRisk
        ? {
            ...analytics.normalizedRisk.financialRisk,
            index: latestRisk.financialRisk,
          }
        : analytics.normalizedRisk.financialRisk,
    },
    position: playerPosition,
    overall,
    potential,
    fifa,
    categoryIndex,
    performanceScore,
    detailedStats,
    analytics,
  };
}

function resolveSnapshotTimestamp(player: PlayerSummarySource, reference = new Date()) {
  if (player.updatedAt && player.updatedAt.getTime() <= reference.getTime()) {
    return player.updatedAt;
  }

  return reference;
}

export function buildAnalyticalSnapshotBatch(
  player: PlayerSummarySource,
  options: {
    includeMetricsSnapshot?: boolean;
    includeFinancialSnapshot?: boolean;
    includeRiskSnapshot?: boolean;
    timestamp?: Date;
  } = {},
) {
  const latestMetrics = getLatestMetricsSnapshot(player);
  const latestFinancial = getLatestFinancialSnapshot(player);
  const latestRisk = getLatestRiskSnapshot(player);
  const includeMetricsSnapshot = options.includeMetricsSnapshot ?? !isSnapshotFresh(player, latestMetrics);
  const includeFinancialSnapshot = options.includeFinancialSnapshot ?? !isSnapshotFresh(player, latestFinancial);
  const includeRiskSnapshot = options.includeRiskSnapshot ?? !isSnapshotFresh(player, latestRisk);

  if (!includeMetricsSnapshot && !includeFinancialSnapshot && !includeRiskSnapshot) {
    return null;
  }

  const summary = buildPlayerSummary({
    ...player,
    metricsSnapshots: includeMetricsSnapshot ? [] : player.metricsSnapshots,
    financialSnapshots: includeFinancialSnapshot ? [] : player.financialSnapshots,
    riskSnapshots: includeRiskSnapshot ? [] : player.riskSnapshots,
  });

  const timestamp = options.timestamp ?? resolveSnapshotTimestamp(player);
  const contractYears = normalizeContractYears(player.contractEnd);
  const marketValue = latestFinancial?.marketValue ?? player.marketValue ?? null;
  const transferCostEstimate = resolveTransferCostEstimate(marketValue, summary.player.liquidity.score);

  return {
    summary,
    metrics: includeMetricsSnapshot
      ? {
          playerId: player.id,
          overall: summary.overall.overall,
          potential: summary.potential,
          pace: summary.fifa.pace,
          shooting: summary.fifa.shooting,
          passing: summary.fifa.passing,
          defending: summary.fifa.defending,
          physical: summary.fifa.physical,
          dribbling: summary.fifa.dribbling,
          timestamp,
        }
      : null,
    financials: includeFinancialSnapshot
      ? {
          playerId: player.id,
          marketValue,
          salary: latestFinancial?.salary ?? null,
          transferCostEstimate: latestFinancial?.transferCostEstimate ?? transferCostEstimate,
          contractYears: latestFinancial?.contractYears ?? contractYears,
          timestamp,
        }
      : null,
    risk: includeRiskSnapshot
      ? {
          playerId: player.id,
          structuralRisk: summary.player.structuralRisk.score,
          financialRisk: summary.player.financialRisk.index,
          liquidityScore: summary.player.liquidity.score,
          compositeRisk: summary.player.risk.score,
          riskLevel: summary.player.risk.level,
          explanation: summary.player.risk.explanation,
          timestamp,
        }
      : null,
  };
}

export async function persistAnalyticalSnapshots(player: PlayerSummarySource) {
  if (hasFreshSnapshots(player)) {
    return {
      created: {
        metrics: 0,
        financials: 0,
        riskSnapshots: 0,
      },
    };
  }

  const batch = buildAnalyticalSnapshotBatch(player);
  if (!batch) {
    return {
      created: {
        metrics: 0,
        financials: 0,
        riskSnapshots: 0,
      },
    };
  }

  const operations = [];
  if (batch.metrics) {
    operations.push(prisma.playerMetrics.create({ data: batch.metrics }));
  }
  if (batch.financials) {
    operations.push(prisma.playerFinancials.create({ data: batch.financials }));
  }
  if (batch.risk) {
    operations.push(prisma.playerRiskSnapshot.create({ data: batch.risk }));
  }

  try {
    if (operations.length > 0) {
      await prisma.$transaction(operations);
    }
  } catch (error) {
    if (!isMissingSnapshotTableError(error)) {
      throw error;
    }
  }

  return {
    created: {
      metrics: batch.metrics ? 1 : 0,
      financials: batch.financials ? 1 : 0,
      riskSnapshots: batch.risk ? 1 : 0,
    },
  };
}

function buildProjectionFromProfile(profile: {
  age?: number | null;
  position?: string | null;
  overall?: number | null;
}) {
  return calculateGrowthProjection({
    age: profile.age ?? 25,
    position: profile.position ?? "CM",
    currentOverall: profile.overall ?? 60,
    performanceHistory: [profile.overall ?? 60],
    physicalLoad: 55,
    performanceStability: 60,
  });
}

export async function getPlayerProfile(id: string) {
  const player = await findPlayerWithSnapshots(id);
  if (!player) throw new Error("Player not found");
  await persistAnalyticalSnapshots(player as PlayerSummarySource);
  const refreshedPlayer = (await findPlayerWithSnapshots(id)) ?? player;
  const summary = buildPlayerSummary(refreshedPlayer as PlayerSummarySource);
  const { risk, liquidity, financialRisk, capitalEfficiency, normalizedRisk } = summary.analytics;

  const raw = (refreshedPlayer.attributes as any) ?? {};
  const technical = raw.skill ?? {
    dribbling: summary.detailedStats.dribbling,
    ballControl: summary.detailedStats.ballControl,
    shortPassing: summary.detailedStats.shortPassing,
    longPassing: summary.detailedStats.longPassing,
  };

  const physical = raw.power ?? {
    strength: summary.detailedStats.strength,
    stamina: summary.detailedStats.stamina,
    acceleration: summary.detailedStats.acceleration,
    sprintSpeed: summary.detailedStats.sprintSpeed,
  };

  const mental = raw.mentality ?? {
    vision: raw.vision ?? summary.detailedStats.vision,
    composure: raw.composure ?? summary.detailedStats.composure,
    aggression: raw.aggression ?? summary.detailedStats.aggression,
    positioning: raw.positioning ?? summary.detailedStats.attackPosition,
  };
  const storedArchetype =
    refreshedPlayer.archetype && typeof refreshedPlayer.archetype === "object"
      ? (refreshedPlayer.archetype as Record<string, unknown>)
      : null;
  const computedArchetype = classifyPlayerArchetype(summary.fifa);
  const archetype = {
    label:
      (typeof storedArchetype?.role === "string" && storedArchetype.role.trim()) ||
      (typeof storedArchetype?.archetype === "string" && storedArchetype.archetype.trim()) ||
      computedArchetype.archetype,
    confidence:
      typeof storedArchetype?.confidence === "number" && Number.isFinite(storedArchetype.confidence)
        ? storedArchetype.confidence
        : computedArchetype.confidence,
  };

  const baseProfile = {
    player: summary.player,
    attributes: summary.fifa,
    technical,
    physical,
    mental,

    // Campos legados para manter compatibilidade retroativa.
    id: refreshedPlayer.id,
    playerKey: refreshedPlayer.id,
    name: refreshedPlayer.name,
    nomeJogador: refreshedPlayer.name,
    age: refreshedPlayer.age ?? null,
    position: summary.position,
    team: refreshedPlayer.team ?? null,
    league: refreshedPlayer.league ?? null,
    marketValue: summary.player.marketValue ?? null,
    contractEnd: refreshedPlayer.contractEnd ? String(refreshedPlayer.contractEnd) : null,
    overall: summary.overall.overall,
    tier: summary.overall.tier,
    positionRank: summary.overall.positionRank,
    fifaStyle: summary.overall.fifaStyle,
    potential: summary.potential,
    archetype,
    capitalEfficiency: capitalEfficiency.index,
    liquidityScore: liquidity.liquidityScore,
    structuralRisk: risk.totalRisk,
    financialRisk: financialRisk.riskIndex,
    risk: normalizedRisk.risk,
    structuralRiskNormalized: normalizedRisk.structuralRisk,
    financialRiskNormalized: normalizedRisk.financialRisk,
    liquidityNormalized: normalizedRisk.liquidity,
    image: refreshedPlayer.imagePath ?? null,
  };

  const [projection, similarPlayers] = await Promise.all([
    Promise.resolve(buildProjectionFromProfile(baseProfile)),
    getSimilarPlayers(id).catch(() => []),
  ]);

  const intelligenceProfile = buildPlayerIntelligenceProfile({
    playerProfile: baseProfile,
    projection,
    similarPlayers,
  });

  return {
    ...baseProfile,
    projection,
    similarPlayers,
    intelligenceProfile,
  };
}

export async function getPlayerProjection(id: string) {
  const profile = await getPlayerProfile(id);
  return buildProjectionFromProfile(profile);
}

export async function getSimilarPlayers(id: string) {
  const base = await prisma.player.findUnique({ where: { id } });
  if (!base) throw new Error("Player not found");

  const peers = await findPlayersWithSnapshots({
    where: {
      positions: { has: resolvePlayerPosition(base as any) },
      NOT: { id: base.id },
    },
    take: 6,
  });

  return peers
    .map((player) => buildPlayerSummary(player as PlayerSummarySource).player)
    .sort((left, right) => {
      const overallDiff = (right.overall ?? -1) - (left.overall ?? -1);
      if (overallDiff !== 0) {
        return overallDiff;
      }
      return left.name.localeCompare(right.name);
    });
}

function normalizeString(value?: string | null) {
  return value?.trim() ?? "";
}

function normalizeSearchValue(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

async function getPlayerFilterOptions() {
  return withCache("players:filter-options", 600, async () => {
    const [positionRows, nationalityRows, teamRows, leagueRows, sourceRows] = await Promise.all([
      prisma.player.findMany({ select: { positions: true } }),
      prisma.player.findMany({
        select: { nationality: true },
        distinct: ["nationality"],
        orderBy: { nationality: "asc" },
      }),
      prisma.player.findMany({
        where: { team: { not: null } },
        select: { team: true },
        distinct: ["team"],
        orderBy: { team: "asc" },
      }),
      prisma.player.findMany({
        where: { league: { not: null } },
        select: { league: true },
        distinct: ["league"],
        orderBy: { league: "asc" },
      }),
      prisma.player.findMany({
        select: { source: true },
        distinct: ["source"],
        orderBy: { source: "asc" },
      }),
    ]);

    return {
      positions: Array.from(
        new Set(
          positionRows
            .flatMap((row) => row.positions ?? [])
            .map((position) => normalizeString(position).toUpperCase())
            .filter(Boolean),
        ),
      ).sort((left, right) => left.localeCompare(right)),
      nationalities: nationalityRows
        .map((row) => normalizeString(row.nationality))
        .filter(Boolean),
      teams: teamRows
        .map((row) => normalizeString(row.team))
        .filter(Boolean),
      leagues: leagueRows
        .map((row) => normalizeString(row.league))
        .filter(Boolean),
      sources: sourceRows
        .map((row) => normalizeString(row.source))
        .filter(Boolean),
    };
  });
}

export async function listPlayers(params: ListPlayersParams = {}) {
  const page = Math.max(1, Number(params.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(params.limit ?? 20)));
  const skip = (page - 1) * limit;

  const normalizedSearch = normalizeString(params.search);
  const normalizedSearchValue = normalizedSearch ? normalizeSearchValue(normalizedSearch) : "";
  const normalizedPositions = Array.from(
    new Set(
      [...(params.positions ?? []), ...(params.position ? [params.position] : [])]
        .map((value) => normalizeString(value).toUpperCase())
        .filter(Boolean),
    ),
  );

  const whereClauses: any[] = [];

  if (normalizedSearch) {
    whereClauses.push({
      OR: [
        { name: { contains: normalizedSearch, mode: "insensitive" } },
        { nameNormalized: { contains: normalizedSearchValue } },
        { team: { contains: normalizedSearch, mode: "insensitive" } },
        { league: { contains: normalizedSearch, mode: "insensitive" } },
        { nationality: { contains: normalizedSearch, mode: "insensitive" } },
        { positions: { has: normalizedSearch.toUpperCase() } },
      ],
    });
  }

  if (normalizedPositions.length > 0) {
    whereClauses.push({ positions: { hasSome: normalizedPositions } });
  }

  if (normalizeString(params.nationality)) {
    whereClauses.push({ nationality: { equals: normalizeString(params.nationality), mode: "insensitive" } });
  }

  if (normalizeString(params.team)) {
    whereClauses.push({ team: { equals: normalizeString(params.team), mode: "insensitive" } });
  }

  if (normalizeString(params.league)) {
    whereClauses.push({ league: { equals: normalizeString(params.league), mode: "insensitive" } });
  }

  if (normalizeString(params.source)) {
    whereClauses.push({ source: { equals: normalizeString(params.source), mode: "insensitive" } });
  }

  if (Number.isFinite(params.ageMin) || Number.isFinite(params.ageMax)) {
    whereClauses.push({
      age: {
        ...(Number.isFinite(params.ageMin) ? { gte: Number(params.ageMin) } : {}),
        ...(Number.isFinite(params.ageMax) ? { lte: Number(params.ageMax) } : {}),
      },
    });
  }

  const normalizedOverallMin = Number.isFinite(params.overallMin)
    ? Number(params.overallMin)
    : Number.isFinite(params.minOverall)
      ? Number(params.minOverall)
      : undefined;
  const normalizedOverallMax = Number.isFinite(params.overallMax) ? Number(params.overallMax) : undefined;
  const normalizedPotentialMin = Number.isFinite(params.potentialMin) ? Number(params.potentialMin) : undefined;
  const normalizedPotentialMax = Number.isFinite(params.potentialMax) ? Number(params.potentialMax) : undefined;
  const normalizedMarketValueMin = Number.isFinite(params.marketValueMin) ? Number(params.marketValueMin) : undefined;
  const normalizedMarketValueMax = Number.isFinite(params.marketValueMax) ? Number(params.marketValueMax) : undefined;

  if (Number.isFinite(normalizedOverallMin) || Number.isFinite(normalizedOverallMax)) {
    whereClauses.push({
      overall: {
        ...(Number.isFinite(normalizedOverallMin) ? { gte: normalizedOverallMin } : {}),
        ...(Number.isFinite(normalizedOverallMax) ? { lte: normalizedOverallMax } : {}),
      },
    });
  }

  if (Number.isFinite(normalizedPotentialMin) || Number.isFinite(normalizedPotentialMax)) {
    whereClauses.push({
      potential: {
        ...(Number.isFinite(normalizedPotentialMin) ? { gte: normalizedPotentialMin } : {}),
        ...(Number.isFinite(normalizedPotentialMax) ? { lte: normalizedPotentialMax } : {}),
      },
    });
  }

  if (Number.isFinite(normalizedMarketValueMin) || Number.isFinite(normalizedMarketValueMax)) {
    whereClauses.push({
      marketValue: {
        ...(Number.isFinite(normalizedMarketValueMin) ? { gte: normalizedMarketValueMin } : {}),
        ...(Number.isFinite(normalizedMarketValueMax) ? { lte: normalizedMarketValueMax } : {}),
      },
    });
  }

  const where = whereClauses.length > 0 ? { AND: whereClauses } : {};

  const [total, players, filterOptions] = await Promise.all([
    prisma.player.count({ where }),
    findPlayersWithSnapshots({
      where,
      skip,
      take: limit,
      orderBy: [{ overall: "desc" }, { name: "asc" }],
    }),
    getPlayerFilterOptions(),
  ]);

  const items = players.map((player) => buildPlayerSummary(player as PlayerSummarySource).player);

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
    filterOptions,
    filters: {
      search: normalizedSearch || null,
      positions: normalizedPositions,
      nationality: normalizeString(params.nationality) || null,
      team: normalizeString(params.team) || null,
      league: normalizeString(params.league) || null,
      source: normalizeString(params.source) || null,
      minOverall: Number.isFinite(normalizedOverallMin) ? Number(normalizedOverallMin) : null,
      overallMin: Number.isFinite(normalizedOverallMin) ? Number(normalizedOverallMin) : null,
      overallMax: Number.isFinite(normalizedOverallMax) ? Number(normalizedOverallMax) : null,
      minPotential: Number.isFinite(normalizedPotentialMin) ? Number(normalizedPotentialMin) : null,
      maxPotential: Number.isFinite(normalizedPotentialMax) ? Number(normalizedPotentialMax) : null,
      minValue: Number.isFinite(normalizedMarketValueMin) ? Number(normalizedMarketValueMin) : null,
      maxValue: Number.isFinite(normalizedMarketValueMax) ? Number(normalizedMarketValueMax) : null,
      ageMin: Number.isFinite(params.ageMin) ? Number(params.ageMin) : null,
      ageMax: Number.isFinite(params.ageMax) ? Number(params.ageMax) : null,
    },
  };
}
