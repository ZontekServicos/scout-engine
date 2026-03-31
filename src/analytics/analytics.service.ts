import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { normalizeLegacyAnalysisTypes } from "../analysis/analysis.service";
import { getPrimaryPosition } from "../utils/positions";

const PLAYER_COMPARISON_TYPE = "PLAYER_COMPARISON";

interface AnalyticsParams {
  from?: string;
  to?: string;
  days?: number;
}

function getComparisonDifference(payload: Prisma.JsonValue) {
  const record = (payload ?? {}) as Prisma.JsonObject;
  const comparison = (record.comparison ?? {}) as Prisma.JsonObject;
  const winnersByBlock = (comparison.winnersByBlock ?? {}) as Prisma.JsonObject;

  return Object.values(winnersByBlock).reduce<number>((sum, block) => {
    const entry = block && typeof block === "object" && !Array.isArray(block)
      ? (block as Prisma.JsonObject)
      : {};
    const playerA = typeof entry.playerA === "number" ? entry.playerA : 0;
    const playerB = typeof entry.playerB === "number" ? entry.playerB : 0;
    return sum + Math.abs(playerA - playerB);
  }, 0);
}

export async function getAnalyticsOverview(params: AnalyticsParams) {
  await normalizeLegacyAnalysisTypes();
  const { from, to, days } = params;

  let dateFilter: Prisma.AnalysisWhereInput = {};

  if (days) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    dateFilter = {
      createdAt: {
        gte: startDate,
      },
    };
  }

  if (from && to) {
    dateFilter = {
      createdAt: {
        gte: new Date(from),
        lte: new Date(to),
      },
    };
  }

  const reports = await prisma.analysis.findMany({
    where: {
      ...dateFilter,
      type: PLAYER_COMPARISON_TYPE,
    },
    include: {
      comparisons: {
        include: {
          player: true,
        },
      },
    },
  });

  const totalComparisons = reports.length;
  const totalWithAI = reports.filter((report) => report.description !== null).length;

  const averageDifference =
    reports.reduce((acc, report) => acc + getComparisonDifference(report.payload), 0) / (totalComparisons || 1);

  const positionMap: Record<string, { count: number; totalDiff: number }> = {};

  reports.forEach((report) => {
    const leadPlayer = report.comparisons[0]?.player;
    const pos = leadPlayer ? getPrimaryPosition(leadPlayer as never) : "UNK";
    const diff = getComparisonDifference(report.payload);

    if (!positionMap[pos]) {
      positionMap[pos] = { count: 0, totalDiff: 0 };
    }

    positionMap[pos].count += 1;
    positionMap[pos].totalDiff += diff;
  });

  const comparisonsByPosition = Object.entries(positionMap).map(([position, data]) => ({
    position,
    count: data.count,
    averageDifference: Number((data.totalDiff / data.count).toFixed(2)),
  }));

  const mostComparedPosition =
    comparisonsByPosition.sort((a, b) => b.count - a.count)[0]?.position ?? null;

  const playerMap: Record<string, number> = {};

  reports.forEach((report) => {
    report.comparisons.forEach((entry) => {
      const id = entry.player.id;
      playerMap[id] = (playerMap[id] || 0) + 1;
    });
  });

  const topPlayers = await Promise.all(
    Object.entries(playerMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(async ([playerId, count]) => {
        const player = await prisma.player.findUnique({
          where: { id: playerId },
        });

        return {
          id: playerId,
          name: player?.name,
          comparisons: count,
        };
      }),
  );

  const estimatedCostPerCall = 0.002;
  const estimatedAITotalCost = Number((totalWithAI * estimatedCostPerCall).toFixed(4));

  return {
    totalComparisons,
    totalWithAI,
    aiUsageRate: Number(((totalWithAI / (totalComparisons || 1)) * 100).toFixed(2)),
    estimatedAITotalCost,
    averageDifference: Number(averageDifference.toFixed(2)),
    comparisonsByPosition,
    mostComparedPosition,
    topPlayers,
  };
}
