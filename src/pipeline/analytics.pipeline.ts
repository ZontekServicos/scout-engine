import { prisma } from "../lib/prisma";
import { calculateFinancialRisk } from "../scout/financial-risk.engine";
import { calculateGrowthProjection } from "../scout/growth-projection.engine";
import { calculateLiquidityScore } from "../scout/liquidity.engine";
import { calculateOverallRating } from "../scout/overall.engine"; // fallback for players with no enriched data
import { calculateRankingScore } from "../scout/ranking.engine";
import { POSITION_WEIGHTS } from "../scout/ranking.weights";
import { calculateRiskScore } from "../scout/risk.engine";
import { getPrimaryPosition } from "../utils/positions";

type PipelineItem = {
  playerId: string;
  overall: number;
  financialRisk: number;
  growthIndex: number;
  liquidityScore: number;
  similarityScore: number;
};

function buildCategoryIndex(attributes: any) {
  return {
    attacking: Number(attributes?.shooting ?? 50),
    skill: Number(attributes?.dribbling ?? 50),
    movement: Number(attributes?.pace ?? 50),
    power: Number(attributes?.physical ?? 50),
    mentality: Number(attributes?.vision ?? 60),
    defending: Number(attributes?.defending ?? 50),
  };
}

export async function runAnalyticsPipeline(limit = 200): Promise<PipelineItem[]> {
  const players = await prisma.player.findMany({
    take: Math.max(1, Math.min(1000, limit)),
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      age: true,
      positions: true,
      attributes: true,
      league: true,
      overall: true,
      overallPace: true,
      overallShooting: true,
      overallPassing: true,
      overallDribbling: true,
      overallDefending: true,
      overallPhysical: true,
    },
  });

  return players.map((player) => {
    const position = getPrimaryPosition(player as any);
    const weights = POSITION_WEIGHTS[position] ?? POSITION_WEIGHTS.CM;
    const attrs = (player.attributes as any) ?? {};
    const fifa = {
      pace: Number(attrs.pace ?? 50),
      shooting: Number(attrs.shooting ?? 50),
      passing: Number(attrs.passing ?? 50),
      dribbling: Number(attrs.dribbling ?? 50),
      defending: Number(attrs.defending ?? 50),
      physical: Number(attrs.physical ?? 50),
    };
    const categoryIndex = buildCategoryIndex(attrs);
    const performanceScore = calculateRankingScore(fifa as any, weights);
    // Prefer overall persisted by the enrichment pipeline (computed from raw Sportmonks stats
    // via analytics/overall.engine). Fall back to the old attribute-based engine only for
    // players that have not yet been enriched.
    const persistedOverall = typeof player.overall === "number" && player.overall > 0 ? player.overall : null;
    const overall = persistedOverall !== null
      ? { overall: persistedOverall }
      : calculateOverallRating({
          position,
          performanceScore,
          categoryIndex,
          macroOverall: Object.values(categoryIndex).reduce((acc, value) => acc + value, 0) / 6,
          fifaAttributes: fifa,
          rawAttributes: attrs,
        });
    const risk = calculateRiskScore({
      age: player.age ?? 25,
      position,
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
        classification: risk.totalRisk >= 55 ? "HIGH_RISK" : risk.totalRisk >= 25 ? "MODERATE" : "SAFE",
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
      overall: overall.overall,
    });
    const growth = calculateGrowthProjection({
      age: player.age ?? 25,
      position,
      currentOverall: overall.overall,
      performanceHistory: [performanceScore],
      physicalLoad: 55,
      performanceStability: 60,
    });

    const similarityScore = Number(
      (
        (fifa.pace + fifa.shooting + fifa.passing + fifa.dribbling + fifa.defending + fifa.physical) / 6
      ).toFixed(2),
    );

    return {
      playerId: player.id,
      overall: overall.overall,
      financialRisk: financialRisk.riskIndex,
      growthIndex: growth.growthIndex,
      liquidityScore: liquidity.liquidityScore,
      similarityScore,
    };
  });
}
