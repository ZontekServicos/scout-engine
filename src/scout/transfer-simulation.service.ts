import { prisma } from "../lib/prisma";
import { calculateAntiFlopIndex } from "./antiFlop.engine";
import { calculateCapitalEfficiency } from "./capital-efficiency.engine";
import { calculateFinancialRisk } from "./financial-risk.engine";
import { calculateGrowthProjection } from "./growth-projection.engine";
import { calculateLiquidityScore } from "./liquidity.engine";
import { getLeagueDifficultyCoefficient } from "./league-difficulty.engine";
import { calculateOverallRating } from "./overall.engine";
import { calculateRankingScore } from "./ranking.engine";
import { POSITION_WEIGHTS } from "./ranking.weights";
import { calculateRiskScore } from "./risk.engine";
import { getPrimaryPosition } from "../utils/positions";

type TransferSimulationInput = {
  playerId: string;
  transferCost: number;
  salary: number;
  contractYears: number;
};

function resolveFifaAttributes(attributes: any) {
  return {
    pace: Number(attributes?.pace ?? 50),
    shooting: Number(attributes?.shooting ?? 50),
    passing: Number(attributes?.passing ?? 50),
    dribbling: Number(attributes?.dribbling ?? 50),
    defending: Number(attributes?.defending ?? 50),
    physical: Number(attributes?.physical ?? 50),
  };
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

export async function simulateTransfer(input: TransferSimulationInput) {
  const { playerId, transferCost, salary, contractYears } = input;

  const player = await prisma.player.findUnique({ where: { id: playerId } });
  if (!player) throw new Error("Player not found");
  const playerPosition = getPrimaryPosition(player as any);

  const squad = await prisma.player.findMany();
  const currentTeamOverall =
    squad.reduce((acc, item) => acc + Number((item.attributes as any)?.overall ?? 65), 0) /
    Math.max(1, squad.length);

  const positionWeights = POSITION_WEIGHTS[playerPosition];
  if (!positionWeights) throw new Error("Invalid player position for simulation");

  const fifa = resolveFifaAttributes(player.attributes);
  const categoryIndex = buildCategoryIndex(fifa);
  const performanceScore = calculateRankingScore(player.attributes as any, positionWeights);

  const averagePositionScore =
    squad
      .filter((item) => getPrimaryPosition(item as any) === playerPosition)
      .reduce((acc, item) => {
        return acc + calculateRankingScore(item.attributes as any, positionWeights);
      }, 0) /
    Math.max(1, squad.filter((item) => getPrimaryPosition(item as any) === playerPosition).length);

  const risk = calculateRiskScore({
    age: player.age ?? 25,
    position: playerPosition,
    performanceScore,
    averagePositionScore,
    categoryIndex,
  });

  const leagueDifficulty = getLeagueDifficultyCoefficient((player as any).league);

  const antiFlop = calculateAntiFlopIndex({
    risk,
    age: player.age ?? 25,
    performanceScore,
    averagePositionScore,
    leagueDifficultyCoefficient: leagueDifficulty,
  });

  const liquidity = calculateLiquidityScore({
    age: player.age ?? 25,
    performanceScore,
    averagePositionScore,
    risk,
    antiFlop,
  });

  // Use persisted overall (written by analytics/overall.engine via enrichment) when available.
  const persistedOverall = typeof (player as any).overall === "number" && (player as any).overall > 0
    ? (player as any).overall as number
    : null;
  const overall = persistedOverall !== null
    ? { overall: persistedOverall }
    : calculateOverallRating({
        position: playerPosition,
        performanceScore,
        categoryIndex,
        macroOverall: Object.values(categoryIndex).reduce((a, b) => a + b, 0) / 6,
        fifaAttributes: fifa,
        rawAttributes: player.attributes,
      });

  const financialRisk = calculateFinancialRisk({
    structuralRisk: risk.totalRisk,
    flopProbability: antiFlop.flopProbability,
    liquidityScore: liquidity.liquidityScore,
    age: player.age ?? 25,
    overall: overall.overall,
  });

  const capitalEfficiency = calculateCapitalEfficiency({
    performanceScore,
    flopProbability: antiFlop.flopProbability,
    liquidityScore: liquidity.liquidityScore,
    financialRiskIndex: financialRisk.riskIndex,
  });

  const growth = calculateGrowthProjection({
    age: player.age ?? 25,
    position: playerPosition,
    currentOverall: overall.overall,
    performanceHistory: [performanceScore],
    physicalLoad: Number((player.attributes as any)?.physicalLoad ?? 55),
    performanceStability: Number((player.attributes as any)?.stability ?? 60),
    leagueDifficultyCoefficient: leagueDifficulty,
  });

  const annualCost = transferCost / Math.max(contractYears, 1) + salary;
  const expectedResaleValue = Math.round(
    transferCost * (liquidity.liquidityScore / 100) * (growth.expectedPeak / 100),
  );

  return {
    player: {
      id: player.id,
      playerKey: player.id,
      name: player.name,
      nomeJogador: player.name,
      position: playerPosition,
    },
    teamRiskDelta: Number((risk.totalRisk - 35).toFixed(2)),
    teamCapitalEfficiencyDelta: Number((capitalEfficiency.index - 6.5).toFixed(2)),
    teamAverageOverallDelta: Number((overall.overall - currentTeamOverall).toFixed(2)),
    financialExposure: {
      annualCost: Number(annualCost.toFixed(2)),
      totalContractCost: Number((annualCost * contractYears).toFixed(2)),
      riskLevel: financialRisk.riskLevel,
    },
    expectedResaleValue,
    leagueDifficultyCoefficient: leagueDifficulty,
    growthProjection: growth,
  };
}
