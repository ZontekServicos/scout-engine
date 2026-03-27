import { createReportAnalysis, getAnalysisById } from "../analysis/analysis.service";

function createHttpError(message: string, statusCode: number) {
  const error = new Error(message) as Error & { statusCode?: number };
  error.statusCode = statusCode;
  return error;
}

export async function generatePlayerReportAnalysis(playerId: string, options?: { analyst?: string }) {
  const analysis = await createReportAnalysis({
    playerIds: [playerId],
    analyst: options?.analyst,
  });

  const analysisDetail = await getAnalysisById(analysis.id);
  const playerReport = analysisDetail.reportContent?.playerReportData;

  if (!playerReport) {
    throw createHttpError("Analysis report content could not be generated", 500);
  }

  return {
    analysisId: analysis.id,
    scoutReportId: null,
    player: {
      ...playerReport.player,
      nomeJogador: playerReport.player.name,
    },
    metrics: playerReport.metrics,
    aiNarrative: playerReport.aiNarrative,
    recommendation: playerReport.metrics.recommendation,
    createdAt: analysis.createdAt ?? new Date().toISOString(),
  };
}
