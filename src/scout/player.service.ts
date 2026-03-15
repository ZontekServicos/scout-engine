import { prisma } from "../lib/prisma";
import { calculateCapitalEfficiency } from "./capital-efficiency.engine";
import { calculateFinancialRisk } from "./financial-risk.engine";
import { calculateGrowthProjection } from "./growth-projection.engine";
import { calculateLiquidityScore } from "./liquidity.engine";
import { calculateOverallRating } from "./overall.engine";
import { calculateRankingScore } from "./ranking.engine";
import { POSITION_WEIGHTS } from "./ranking.weights";
import { calculateRiskScore } from "./risk.engine";
import { getPrimaryPosition } from "../utils/positions";
import { mapPlayerRecord } from "../mappers/player.mapper";

type ListPlayersParams = {
  position?: string;
  team?: string;
  league?: string;
  overallMin?: number;
  overallMax?: number;
  minOverall?: number;
  ageMin?: number;
  ageMax?: number;
  page?: number;
  limit?: number;
};

type PlayerSummarySource = {
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
};

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

export function buildPlayerSummary(player: PlayerSummarySource) {
  const playerPosition = resolvePlayerPosition(player);
  const weights = POSITION_WEIGHTS[playerPosition];
  const rawAttributes = player.attributes ?? {};
  const fifa = resolveFifa(rawAttributes, playerPosition);
  const categoryIndex = buildCategoryIndex(fifa);
  const performanceScore = calculateRankingScore(fifa, weights);
  const persistedOverall = hasFiniteNumber(player.overall) ? clampFifaCore(player.overall) : null;
  const persistedPotential = hasFiniteNumber(player.potential) ? clampFifaCore(player.potential) : null;
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
    marketValue: player.marketValue ?? null,
    imagePath: player.imagePath ?? null,
    attributes: {
      ...overall.fifaStyle.core,
      ...detailedStats,
    },
  });

  return {
    player: profile,
    position: playerPosition,
    overall,
    potential,
    fifa,
    categoryIndex,
    performanceScore,
    detailedStats,
  };
}

export async function getPlayerProfile(id: string) {
  const player = await prisma.player.findUnique({ where: { id } });
  if (!player) throw new Error("Player not found");
  const summary = buildPlayerSummary(player as PlayerSummarySource);

  const risk = calculateRiskScore({
    age: player.age ?? 25,
    position: summary.position,
    performanceScore: summary.performanceScore,
    averagePositionScore: summary.performanceScore,
    categoryIndex: summary.categoryIndex,
  });

  const liquidity = calculateLiquidityScore({
    age: player.age ?? 25,
    performanceScore: summary.performanceScore,
    averagePositionScore: summary.performanceScore,
    risk,
    antiFlop: {
      flopProbability: risk.totalRisk,
      safetyIndex: 100 - risk.totalRisk,
      confidenceScore: 80,
      classification:
        risk.totalRisk >= 55 ? "HIGH_RISK" : risk.totalRisk >= 25 ? "MODERATE" : "SAFE",
      decisionHint: "PROCEED",
      keyDrivers: [],
      breakdown: {
        structural: risk.breakdown.structural,
        competitive: risk.breakdown.competitive,
        ageCurve: risk.breakdown.age,
        medical: 0,
        uncertainty: 0,
      },
    },
  });

  const financialRisk = calculateFinancialRisk({
    structuralRisk: risk.totalRisk,
    flopProbability: risk.totalRisk,
    liquidityScore: liquidity.liquidityScore,
    age: player.age ?? 25,
    overall: summary.overall.overall,
  });

  const capitalEfficiency = calculateCapitalEfficiency({
    performanceScore: summary.performanceScore,
    flopProbability: risk.totalRisk,
    liquidityScore: liquidity.liquidityScore,
    financialRiskIndex: financialRisk.riskIndex,
  });

  const raw = (player.attributes as any) ?? {};
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

  return {
    player: summary.player,
    attributes: summary.fifa,
    technical,
    physical,
    mental,

    // Campos legados para manter compatibilidade retroativa.
    id: player.id,
    playerKey: player.id,
    name: player.name,
    nomeJogador: player.name,
    age: player.age ?? null,
    position: summary.position,
    team: player.team ?? null,
    league: player.league ?? null,
    marketValue: player.marketValue ?? null,
    contractEnd: player.contractEnd ? String(player.contractEnd) : null,
    overall: summary.overall.overall,
    fifaStyle: summary.overall.fifaStyle,
    potential: summary.potential,
    capitalEfficiency: capitalEfficiency.index,
    liquidityScore: liquidity.liquidityScore,
    structuralRisk: risk.totalRisk,
    financialRisk: financialRisk.riskIndex,
    image: player.imagePath ?? null,
  };
}

export async function getPlayerProjection(id: string) {
  const profile = await getPlayerProfile(id);

  return calculateGrowthProjection({
    age: profile.age ?? 25,
    position: profile.position ?? "CM",
    currentOverall: profile.overall ?? 60,
    performanceHistory: [profile.overall ?? 60],
    physicalLoad: 55,
    performanceStability: 60,
  });
}

export async function getSimilarPlayers(id: string) {
  const base = await prisma.player.findUnique({ where: { id } });
  if (!base) throw new Error("Player not found");

  const peers = await prisma.player.findMany({
    where: {
      positions: { has: resolvePlayerPosition(base as any) },
      NOT: { id: base.id },
    },
    take: 6,
    select: {
      id: true,
      name: true,
      positions: true,
      team: true,
      league: true,
      nationality: true,
      age: true,
      overall: true,
      potential: true,
      marketValue: true,
      imagePath: true,
      attributes: true,
    },
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

export async function listPlayers(params: ListPlayersParams = {}) {
  const page = Math.max(1, Number(params.page ?? 1));
  const limit = Math.min(100, Math.max(1, Number(params.limit ?? 20)));
  const skip = (page - 1) * limit;

  const where: any = {};

  if (params.position && params.position.trim()) {
    where.positions = { has: params.position.trim().toUpperCase() };
  }

  if (params.league && params.league.trim()) {
    where.league = { contains: params.league.trim(), mode: "insensitive" };
  }

  if (params.team && params.team.trim()) {
    where.team = { contains: params.team.trim(), mode: "insensitive" };
  }

  const normalizedOverallMin = Number.isFinite(params.overallMin)
    ? Number(params.overallMin)
    : Number.isFinite(params.minOverall)
      ? Number(params.minOverall)
      : undefined;

  if (Number.isFinite(params.ageMin) || Number.isFinite(params.ageMax)) {
    where.age = {
      ...(Number.isFinite(params.ageMin) ? { gte: Number(params.ageMin) } : {}),
      ...(Number.isFinite(params.ageMax) ? { lte: Number(params.ageMax) } : {}),
    };
  }

  const players = await prisma.player.findMany({
    where,
    select: {
      id: true,
      name: true,
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
    },
  });

  const summaries = players
    .map((player) => buildPlayerSummary(player as PlayerSummarySource).player)
    .filter((player) => {
      const overall = player.overall;
      if (overall === null) {
        return !Number.isFinite(normalizedOverallMin) && !Number.isFinite(params.overallMax);
      }

      if (Number.isFinite(normalizedOverallMin) && overall < Number(normalizedOverallMin)) {
        return false;
      }

      if (Number.isFinite(params.overallMax) && overall > Number(params.overallMax)) {
        return false;
      }

      return true;
    })
    .sort((left, right) => {
      const overallDiff = (right.overall ?? -1) - (left.overall ?? -1);
      if (overallDiff !== 0) {
        return overallDiff;
      }
      return left.name.localeCompare(right.name);
    });

  const total = summaries.length;
  const items = summaries.slice(skip, skip + limit);

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
    filters: {
      position: params.position ?? null,
      team: params.team ?? null,
      league: params.league ?? null,
      minOverall: Number.isFinite(normalizedOverallMin) ? Number(normalizedOverallMin) : null,
      overallMin: Number.isFinite(normalizedOverallMin) ? Number(normalizedOverallMin) : null,
      overallMax: Number.isFinite(params.overallMax) ? Number(params.overallMax) : null,
      ageMin: Number.isFinite(params.ageMin) ? Number(params.ageMin) : null,
      ageMax: Number.isFinite(params.ageMax) ? Number(params.ageMax) : null,
    },
  };
}
