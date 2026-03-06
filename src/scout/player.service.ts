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

function clampFifaCore(value: number) {
  return Math.max(40, Math.min(99, Math.round(value)));
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

function resolveFifa(attributes: any, position: string) {
  const hasValidCore =
    typeof attributes?.pace === "number" &&
    typeof attributes?.shooting === "number" &&
    typeof attributes?.passing === "number" &&
    typeof attributes?.dribbling === "number" &&
    typeof attributes?.defending === "number" &&
    typeof attributes?.physical === "number" &&
    Number.isFinite(attributes?.pace) &&
    Number.isFinite(attributes?.shooting) &&
    Number.isFinite(attributes?.passing) &&
    Number.isFinite(attributes?.dribbling) &&
    Number.isFinite(attributes?.defending) &&
    Number.isFinite(attributes?.physical);

  if (hasValidCore) {
    const normalized = {
      pace: clampFifaCore(attributes.pace),
      shooting: clampFifaCore(attributes.shooting),
      passing: clampFifaCore(attributes.passing),
      dribbling: clampFifaCore(attributes.dribbling),
      defending: clampFifaCore(attributes.defending),
      physical: clampFifaCore(attributes.physical),
    };

    const values = Object.values(normalized);
    const uniqueValues = new Set(values);
    if (uniqueValues.size > 1) {
      return normalized;
    }
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

export async function getPlayerProfile(id: string) {
  const player = await prisma.player.findUnique({ where: { id } });
  if (!player) throw new Error("Player not found");
  const playerPosition = getPrimaryPosition(player as any);

  const weights = POSITION_WEIGHTS[playerPosition];
  if (!weights) throw new Error("Invalid player position");

  const fifa = resolveFifa(player.attributes, playerPosition);
  const categoryIndex = buildCategoryIndex(fifa);
  const performanceScore = calculateRankingScore(player.attributes as any, weights);

  const risk = calculateRiskScore({
    age: player.age ?? 25,
    position: playerPosition,
    performanceScore,
    averagePositionScore: performanceScore,
    categoryIndex,
  });

  const liquidity = calculateLiquidityScore({
    age: player.age ?? 25,
    performanceScore,
    averagePositionScore: performanceScore,
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

  // Reutilizamos a mesma engine de overall do fluxo de compare para manter
  // consistência matemática entre os endpoints e evitar lógica duplicada.
  const overall = calculateOverallRating({
    position: playerPosition,
    performanceScore,
    categoryIndex,
    macroOverall: Object.values(categoryIndex).reduce((a, b) => a + b, 0) / 6,
    fifaAttributes: fifa,
    rawAttributes: player.attributes,
  });

  const financialRisk = calculateFinancialRisk({
    structuralRisk: risk.totalRisk,
    flopProbability: risk.totalRisk,
    liquidityScore: liquidity.liquidityScore,
    age: player.age ?? 25,
    overall: overall.overall,
  });

  const capitalEfficiency = calculateCapitalEfficiency({
    performanceScore,
    flopProbability: risk.totalRisk,
    liquidityScore: liquidity.liquidityScore,
    financialRiskIndex: financialRisk.riskIndex,
  });

  return {
    id: player.id,
    playerKey: player.id,
    name: player.name,
    nomeJogador: player.name,
    age: player.age ?? null,
    position: playerPosition,
    team: (player as any).team ?? null,
    league: (player as any).league ?? null,
    marketValue: (player as any).marketValue ?? null,
    contractEnd: (player as any).contractEnd ? String((player as any).contractEnd) : null,
    overall: overall.overall,
    fifaStyle: overall.fifaStyle,
    potential: Math.max(overall.overall, Math.min(99, overall.overall + 5)),
    capitalEfficiency: capitalEfficiency.index,
    liquidityScore: liquidity.liquidityScore,
    structuralRisk: risk.totalRisk,
    financialRisk: financialRisk.riskIndex,
    technical: fifa,
    photoUrl: null,
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
      positions: { has: getPrimaryPosition(base as any) },
      NOT: { id: base.id },
    },
    take: 6,
  });

  return peers.map((player) => ({
    id: player.id,
    playerKey: player.id,
    name: player.name,
    nomeJogador: player.name,
    age: player.age ?? null,
    position: getPrimaryPosition(player as any),
    overall: Number((player.attributes as any)?.overall ?? 65),
  }));
}
