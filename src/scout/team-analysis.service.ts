import { prisma } from "../lib/prisma";
import { calculateAntiFlopIndex } from "./antiFlop.engine";
import { calculateLiquidityScore } from "./liquidity.engine";
import { calculateOverallRating } from "./overall.engine";
import { calculateRankingScore } from "./ranking.engine";
import { POSITION_WEIGHTS } from "./ranking.weights";
import { calculateRiskScore } from "./risk.engine";
import { getPrimaryPosition } from "../utils/positions";

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

export async function analyzeTeamByPlayerIds(playerIds: string[]) {
  const players = await prisma.player.findMany({
    where: { id: { in: playerIds } },
  });

  if (!players.length) {
    throw new Error("No players found for team analysis");
  }

  const computed = players.map((player) => {
    const primaryPosition = getPrimaryPosition(player as any);
    const weights = POSITION_WEIGHTS[primaryPosition];
    if (!weights) return null;

    const performanceScore = calculateRankingScore(player.attributes as any, weights);
    const fifa = resolveFifaAttributes(player.attributes);
    const categoryIndex = buildCategoryIndex(fifa);

    const risk = calculateRiskScore({
      age: player.age ?? 25,
      position: primaryPosition,
      performanceScore,
      averagePositionScore: performanceScore,
      categoryIndex,
    });

    const antiFlop = calculateAntiFlopIndex({
      risk,
      age: player.age ?? 25,
      performanceScore,
      averagePositionScore: performanceScore,
    });

    const liquidity = calculateLiquidityScore({
      age: player.age ?? 25,
      performanceScore,
      averagePositionScore: performanceScore,
      risk,
      antiFlop,
    });

    const overall = calculateOverallRating({
      position: primaryPosition,
      performanceScore,
      categoryIndex,
      macroOverall: Object.values(categoryIndex).reduce((a, b) => a + b, 0) / 6,
      fifaAttributes: fifa,
      rawAttributes: player.attributes,
    });

    return {
      player,
      risk,
      liquidity,
      overall,
    };
  });

  const valid = computed.filter(Boolean) as NonNullable<typeof computed[number]>[];

  const teamOverall = Number(
    (valid.reduce((acc, item) => acc + item.overall.overall, 0) / Math.max(1, valid.length)).toFixed(2),
  );
  const teamLiquidityScore = Number(
    (valid.reduce((acc, item) => acc + item.liquidity.liquidityScore, 0) / Math.max(1, valid.length)).toFixed(
      2,
    ),
  );
  const teamRiskProfile = Number(
    (valid.reduce((acc, item) => acc + item.risk.totalRisk, 0) / Math.max(1, valid.length)).toFixed(2),
  );
  const teamAgeCurve = Number(
    (valid.reduce((acc, item) => acc + (item.player.age ?? 25), 0) / Math.max(1, valid.length)).toFixed(2),
  );

  const financialExposure = Number(
    (
      valid.reduce((acc, item) => {
        const mv = Number((item.player as any).marketValue ?? 0);
        return acc + mv;
      }, 0) / Math.max(1, valid.length)
    ).toFixed(2),
  );

  const positionCount = valid.reduce<Record<string, number>>((acc, item) => {
    const position = getPrimaryPosition(item.player as any);
    acc[position] = (acc[position] || 0) + 1;
    return acc;
  }, {});

  return {
    teamOverall,
    teamRiskProfile,
    teamLiquidityScore,
    teamAgeCurve,
    financialExposure,
    positionalBalance: positionCount,
    resaleWindowAverage: teamLiquidityScore >= 70 ? "12-24 months" : teamLiquidityScore >= 45 ? "24-36 months" : "Low liquidity",
    squadSize: valid.length,
  };
}
