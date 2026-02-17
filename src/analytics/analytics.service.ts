import { prisma } from "../lib/prisma";

interface AnalyticsParams {
  from?: string;
  to?: string;
  days?: number;
}

export async function getAnalyticsOverview(params: AnalyticsParams) {
  const { from, to, days } = params;

  let dateFilter: any = {};

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

  const reports = await prisma.scoutReport.findMany({
    where: {
      ...dateFilter,
      type: "COMPARE",
    },
    include: {
      player: true,
    },
  });

  const totalComparisons = reports.length;
  const totalWithAI = reports.filter((r) => r.aiNarrative !== null).length;

  const averageDifference =
    reports.reduce((acc: number, report: any) => {
      const diff = report.output?.quantitative?.difference ?? 0;
      return acc + diff;
    }, 0) / (totalComparisons || 1);

  // 📊 Comparações por posição
  const positionMap: Record<string, { count: number; totalDiff: number }> = {};

  reports.forEach((r: any) => {
    const pos = r.player.position;
    const diff = r.output?.quantitative?.difference ?? 0;

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

  // 🏆 Top 5 jogadores mais comparados
  const playerMap: Record<string, number> = {};

  reports.forEach((r) => {
    const id = r.playerId;
    playerMap[id] = (playerMap[id] || 0) + 1;
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

  // 💰 Estimativa simples de custo IA (exemplo)
  const estimatedCostPerCall = 0.002; // exemplo hipotético
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
