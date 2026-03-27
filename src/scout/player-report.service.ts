import { ScoutReportService } from "../modules/scout-report/scout-report.service";

const scoutReportService = new ScoutReportService();

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export async function generatePlayerReportAnalysis(playerId: string, options?: { analyst?: string }) {
  const report = await scoutReportService.generateReport({
    playerIds: [playerId],
    analyst: options?.analyst,
  });
  if (!report) {
    throw new Error("ScoutReport could not be generated");
  }

  const player = asRecord(report.players[0]) ?? {};
  const content = asRecord(report.content) ?? {};
  const decisionSummary = asRecord(content.decisionSummary);
  const metrics = asRecord(content.metrics) ?? {};

  return {
    analysisId: report.id,
    scoutReportId: report.id,
    player: {
      ...player,
      id: String(player.id ?? playerId),
      name: String(player.name ?? "Jogador"),
      nomeJogador: String(player.name ?? "Jogador"),
    },
    metrics,
    aiNarrative: typeof content.aiNarrative === "string" ? content.aiNarrative : null,
    recommendation:
      typeof content.recommendation === "string"
        ? content.recommendation
        : typeof decisionSummary?.decision === "string"
          ? decisionSummary.decision
          : "Recomendacao executiva indisponivel.",
    createdAt: report.createdAt,
  };
}
