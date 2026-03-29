import { generatePlayerNarrativeReport } from "../../ai/scout.service";
import { getPlayerProfile, getPlayerProjection } from "../../scout/player.service";
import { compareByIds } from "../../scout/compare.service";
import { buildExecutiveDecisionSummary } from "../../scout/decision.summary";
import { getPlayerDisplayName, normalizeReportLiquidityScore } from "../../utils/player-display";
import { getPrimaryPosition } from "../../utils/positions";
import { prisma } from "../../lib/prisma";
import { ScoutReportRepository } from "./scout-report.repository";

type UnknownRecord = Record<string, unknown>;

type CreateScoutReportInput = {
  type: "REPORT" | "COMPARISON";
  title: string;
  description?: string;
  content: UnknownRecord;
  players: Array<UnknownRecord>;
  analyst?: string;
  status?: "COMPLETED" | "IN_PROGRESS";
};

type GenerateScoutReportInput = {
  playerIds?: string[];
  players?: string[];
  title?: string;
  description?: string;
  analyst?: string;
};

function createHttpError(message: string, statusCode: number) {
  const error = new Error(message) as Error & { statusCode?: number };
  error.statusCode = statusCode;
  return error;
}

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : null;
}

function normalizeText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeGeneratedTime(startedAt: number) {
  return Math.max(1, Date.now() - startedAt);
}

function toSentenceCase(value: string) {
  const normalized = value.replace(/[_-]+/g, " ").trim();
  if (!normalized) {
    return "";
  }

  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function buildSinglePlayerExplainability(params: {
  recommendation: string;
  riskLevel: string;
  riskScore: number;
  capitalEfficiency: number;
  liquidityScore: number;
  expectedPeak: number | null;
}) {
  return [
    {
      metric: "Recommendation",
      impact: params.recommendation,
    },
    {
      metric: "Risk profile",
      impact: `Nivel ${params.riskLevel} com score composto ${params.riskScore.toFixed(1)}, definindo a margem de seguranca da decisao.`,
    },
    {
      metric: "Capital efficiency",
      impact: `Indice ${params.capitalEfficiency.toFixed(1)}, usado para calibrar retorno esportivo versus custo da operacao.`,
    },
    {
      metric: "Liquidity",
      impact: `Score ${params.liquidityScore.toFixed(1)}, refletindo flexibilidade de revenda e opcionalidade de portfolio.`,
    },
    {
      metric: "Growth projection",
      impact: params.expectedPeak
        ? `Pico projetado em ${params.expectedPeak.toFixed(1)}, indicando teto tecnico ainda capturavel.`
        : "Projecao de crescimento preservada para leitura complementar.",
    },
  ];
}

function buildComparisonExplainability(comparison: Awaited<ReturnType<typeof compareByIds>>, decisionSummary: ReturnType<typeof buildComparisonDecisionSummary>) {
  const winnerKey = decisionSummary.winner === "B" ? "playerB" : "playerA";
  const winnerName =
    decisionSummary.winner === "B"
      ? comparison.players.playerB.name
      : comparison.players.playerA.name;
  const explainabilityNode =
    comparison.explainability?.[winnerKey] ?? comparison.explainability?.playerA ?? comparison.explainability?.playerB;
  const topFactors = Array.isArray(explainabilityNode?.topFactors) ? explainabilityNode.topFactors.filter((item) => typeof item === "string") : [];
  const positiveSignals = Array.isArray(explainabilityNode?.positiveSignals)
    ? explainabilityNode.positiveSignals.filter((item) => typeof item === "string")
    : [];
  const riskDrivers = Array.isArray(explainabilityNode?.riskDrivers)
    ? explainabilityNode.riskDrivers.filter((item) => typeof item === "string")
    : [];

  return [
    {
      metric: "Recommended profile",
      impact: decisionSummary.decision,
    },
    {
      metric: "Confidence edge",
      impact: `${winnerName} sustenta ${decisionSummary.confidence}% de confianca na leitura atual, com vantagem quantitativa de ${comparison.quantitative.difference.toFixed(1)} pontos.`,
    },
    ...topFactors.slice(0, 2).map((factor) => ({
      metric: "Top factor",
      impact: `${winnerName} ganha tracao decisoria por ${factor.toLowerCase()}.`,
    })),
    ...positiveSignals.slice(0, 2).map((signal) => ({
      metric: "Positive signal",
      impact: `${winnerName} apresenta ${signal.toLowerCase()}.`,
    })),
    ...riskDrivers.slice(0, 2).map((driver) => ({
      metric: "Risk driver",
      impact: `O comite deve monitorar ${toSentenceCase(driver).toLowerCase()} para validar a sustentabilidade da escolha.`,
    })),
  ];
}

function buildSinglePlayerInsights(params: {
  playerName: string;
  riskLevel: string;
  expectedPeak: number | null;
  marketValue: number | null;
}) {
  const marketValueLabel =
    typeof params.marketValue === "number" && params.marketValue > 0
      ? `mercado atual em torno de EUR ${(params.marketValue / 1_000_000).toFixed(1)}M`
      : "mercado ainda sem referencia consolidada";

  return [
    `${params.playerName} entra na mesa de decisao com risco ${params.riskLevel.toLowerCase()} e leitura de retorno calibrada para acompanhamento executivo.`,
    params.expectedPeak
      ? `O teto projetado de ${params.expectedPeak.toFixed(1)} sugere upside tecnico relevante dentro da janela monitorada.`
      : "A projecao de crescimento deve ser validada com contexto adicional antes do investimento.",
    `A operacao considera ${marketValueLabel}, preservando disciplina de preco como condicionante da recomendacao final.`,
  ];
}

function buildComparisonInsights(comparison: Awaited<ReturnType<typeof compareByIds>>, decisionSummary: ReturnType<typeof buildComparisonDecisionSummary>) {
  const winnerName =
    decisionSummary.winner === "B"
      ? comparison.players.playerB.name
      : decisionSummary.winner === "A"
        ? comparison.players.playerA.name
        : "os dois perfis";

  return [
    `${winnerName} aparece como decisao preferencial quando o comite prioriza combinacao entre entrega esportiva, risco e flexibilidade de revenda.`,
    `A diferenca quantitativa atual e de ${comparison.quantitative.difference.toFixed(1)} pontos, suficiente para orientar a decisao sem alterar a arquitetura do ScoutReport.`,
    "A recomendacao final deve ser lida junto do contexto tatico e financeiro, nao apenas do score bruto.",
  ];
}

function withGenerationMeta<T extends UnknownRecord>(content: T, startedAt: number) {
  return {
    ...content,
    meta: {
      generatedInMs: normalizeGeneratedTime(startedAt),
    },
  };
}

function buildStoredReportView(report: Awaited<ReturnType<ScoutReportRepository["findById"]>>) {
  if (!report) {
    return null;
  }

  const reportRecord = report as unknown as Record<string, unknown>;
  const input = asRecord(report.input) ?? {};
  const output = asRecord(report.output) ?? asRecord(reportRecord.content) ?? {};
  const storedPlayers =
    Array.isArray(reportRecord.players) ? reportRecord.players : Array.isArray(input.players) ? input.players : [];

  return {
    id: report.id,
    type: report.type === "COMPARE" ? "COMPARISON" : "REPORT",
    title: normalizeText(reportRecord.title, normalizeText(input.title, "Scout Report")),
    description: normalizeText(reportRecord.description, normalizeText(input.description, "")),
    content: output,
    players: storedPlayers,
    analyst: normalizeText(reportRecord.analyst, normalizeText(report.requestedBy, "Analista SoccerMind")),
    status: report.decisionStatus === "PENDING" ? "IN_PROGRESS" : "COMPLETED",
    createdAt: report.createdAt.toISOString(),
    updatedAt:
      reportRecord.updatedAt instanceof Date ? reportRecord.updatedAt.toISOString() : report.createdAt.toISOString(),
  };
}

function buildComparisonDecisionSummary(comparison: Awaited<ReturnType<typeof compareByIds>>) {
  const winnerKey = comparison.quantitative.winner === "B" ? "playerB" : "playerA";
  const winnerName =
    comparison.quantitative.winner === "B"
      ? comparison.players.playerB.name
      : comparison.quantitative.winner === "A"
        ? comparison.players.playerA.name
        : "Comparacao equilibrada";

  const riskNode =
    comparison.quantitative.winner === "DRAW"
      ? comparison.risk.playerA
      : winnerKey === "playerA"
        ? comparison.risk.playerA
        : comparison.risk.playerB;
  const antiFlopNode =
    comparison.quantitative.winner === "DRAW"
      ? comparison.antiFlop.playerA
      : winnerKey === "playerA"
        ? comparison.antiFlop.playerA
        : comparison.antiFlop.playerB;
  const riskNodeAny = riskNode as Record<string, unknown>;
  const antiFlopNodeAny = antiFlopNode as Record<string, unknown>;

  const normalizedRiskNode = {
    totalRisk: typeof riskNode.totalRisk === "number" ? riskNode.totalRisk : 0,
    riskLevel: riskNode.riskLevel,
    breakdown:
      typeof riskNodeAny.breakdown === "object" && riskNodeAny.breakdown
        ? (riskNodeAny.breakdown as { competitive: number; age: number; structural: number })
        : { competitive: 0, age: 0, structural: 0 },
    factors: Array.isArray(riskNodeAny.factors) ? (riskNodeAny.factors as string[]) : [],
  };

  const normalizedAntiFlopNode = {
    flopProbability: typeof antiFlopNode.flopProbability === "number" ? antiFlopNode.flopProbability : 0,
    safetyIndex: typeof antiFlopNode.safetyIndex === "number" ? antiFlopNode.safetyIndex : 0,
    confidenceScore: typeof antiFlopNodeAny.confidenceScore === "number" ? (antiFlopNodeAny.confidenceScore as number) : 80,
    classification: antiFlopNode.classification,
    decisionHint: (
      antiFlopNodeAny.decisionHint === "PROCEED_WITH_GUARDRAILS" || antiFlopNodeAny.decisionHint === "HIGH_CAUTION"
        ? antiFlopNodeAny.decisionHint
        : "PROCEED"
    ) as "PROCEED" | "PROCEED_WITH_GUARDRAILS" | "HIGH_CAUTION",
    keyDrivers: Array.isArray(antiFlopNodeAny.keyDrivers) ? (antiFlopNodeAny.keyDrivers as string[]) : [],
    breakdown:
      typeof antiFlopNodeAny.breakdown === "object" && antiFlopNodeAny.breakdown
        ? (antiFlopNodeAny.breakdown as {
            structural: number;
            competitive: number;
            ageCurve: number;
            medical: number;
            uncertainty: number;
          })
        : {
            structural: 0,
            competitive: 0,
            ageCurve: 0,
            medical: 0,
            uncertainty: 0,
          },
  };

  const decision =
    comparison.quantitative.winner === "DRAW"
      ? "Comparacao equilibrada. Recomenda-se aprofundar o contexto tatico e financeiro antes da decisao final."
      : buildExecutiveDecisionSummary({
          playerName: winnerName,
          performanceScore:
            comparison.quantitative.winner === "A" ? comparison.quantitative.scoreA : comparison.quantitative.scoreB,
          averagePositionScore:
            (comparison.quantitative.scoreA + comparison.quantitative.scoreB) / 2,
          risk: normalizedRiskNode,
          antiFlop: normalizedAntiFlopNode,
        });

  return {
    decision,
    confidence: Number(Math.min(100, Math.max(55, Math.round(100 - comparison.quantitative.difference * 4))).toFixed(0)),
    riskLevel: comparison.quantitative.winner === "DRAW" ? "MEDIUM" : riskNode.riskLevel,
    winner: comparison.quantitative.winner,
  };
}

async function buildSinglePlayerContent(playerId: string, analyst?: string) {
  const [profile, projection] = await Promise.all([getPlayerProfile(playerId), getPlayerProjection(playerId)]);
  const displayName = getPlayerDisplayName(profile.name);
  const riskLevel =
    profile.risk?.level === "LOW" || profile.risk?.level === "MEDIUM" || profile.risk?.level === "HIGH"
      ? profile.risk.level
      : "MEDIUM";
  const liquidityScore = normalizeReportLiquidityScore(profile.liquidityScore);

  let aiNarrative = "";
  let recommendation = "Recomendacao executiva indisponivel.";

  try {
    const aiResult = await generatePlayerNarrativeReport({
      name: displayName,
      position: profile.position ?? "N/A",
      age: profile.age ?? 0,
      club: profile.team ?? "Sem clube",
      league: profile.league ?? "Sem liga",
      overall: profile.overall ?? 0,
      potential: profile.potential ?? profile.overall ?? 0,
      tier: profile.tier ?? "PROSPECT",
      archetype: normalizeText(profile.archetype?.label, "Balanced Player"),
      riskScore: Number(profile.risk?.score ?? 0),
      riskLevel,
      liquidityScore,
      capitalEfficiency: Number(profile.capitalEfficiency ?? 0),
      marketValue: Number(((profile.marketValue ?? 0) / 1_000_000).toFixed(1)),
    });

    aiNarrative = normalizeText(aiResult.narrative, "");
    recommendation = normalizeText(aiResult.recommendation, recommendation);
  } catch {
    aiNarrative = "";
  }

  const decisionSummary = {
    decision: recommendation,
    confidence: Number(Math.min(100, Math.max(58, Math.round((profile.potential ?? profile.overall ?? 0) - Number(profile.risk?.score ?? 0) * 4 + 55))).toFixed(0)),
    riskLevel,
  };
  const expectedPeak = typeof projection?.expectedPeak === "number" ? projection.expectedPeak : null;

  return {
    type: "REPORT" as const,
    title: `Scout Report - ${displayName}`,
    description: normalizeText(aiNarrative, `Leitura individual gerada para ${displayName}.`),
    players: [
      {
        id: profile.id,
        name: displayName,
        position: profile.position ?? null,
        club: profile.team ?? null,
        league: profile.league ?? null,
        nationality: profile.player?.nationality ?? null,
      },
    ],
    content: {
      mode: "single_player",
      analyst: analyst ?? null,
      generatedAt: new Date().toISOString(),
      player: {
        id: profile.id,
        name: displayName,
        position: profile.position ?? null,
        club: profile.team ?? null,
        league: profile.league ?? null,
        nationality: profile.player?.nationality ?? null,
        age: profile.age ?? null,
      },
      metrics: {
        overall: profile.overall ?? 0,
        potential: profile.potential ?? profile.overall ?? 0,
        tier: profile.tier ?? "PROSPECT",
        archetype: normalizeText(profile.archetype?.label, "Balanced Player"),
        riskScore: Number(profile.risk?.score ?? 0),
        riskLevel,
        liquidityScore,
        capitalEfficiency: Number(profile.capitalEfficiency ?? 0),
        financialRisk: Number(profile.financialRisk ?? 0),
        marketValue: typeof profile.marketValue === "number" ? profile.marketValue : null,
        growthProjection: projection,
      },
      decisionSummary,
      recommendation,
      aiNarrative,
      explainability: buildSinglePlayerExplainability({
        recommendation,
        riskLevel,
        riskScore: Number(profile.risk?.score ?? 0),
        capitalEfficiency: Number(profile.capitalEfficiency ?? 0),
        liquidityScore,
        expectedPeak,
      }),
      insights: buildSinglePlayerInsights({
        playerName: displayName,
        riskLevel,
        expectedPeak,
        marketValue: typeof profile.marketValue === "number" ? profile.marketValue : null,
      }),
    },
  };
}

async function buildComparisonContent(playerIds: string[], analyst?: string) {
  const comparison = await compareByIds(playerIds[0], playerIds[1]);
  const decisionSummary = buildComparisonDecisionSummary(comparison);

  return {
    type: "COMPARISON" as const,
    title: `Scout Report - ${comparison.players.playerA.name} vs ${comparison.players.playerB.name}`,
    description: normalizeText(comparison.aiNarrative, "Comparacao executiva gerada pelo motor de scouting."),
    players: [
      comparison.players.playerA,
      comparison.players.playerB,
    ],
    content: {
      mode: "comparison",
      analyst: analyst ?? null,
      generatedAt: new Date().toISOString(),
      comparisonData: comparison,
      decisionSummary,
      explainability: buildComparisonExplainability(comparison, decisionSummary),
      insights: buildComparisonInsights(comparison, decisionSummary),
      metrics: {
        scoreA: comparison.quantitative.scoreA,
        scoreB: comparison.quantitative.scoreB,
        difference: comparison.quantitative.difference,
        winner: comparison.quantitative.winner,
        capitalEfficiency: comparison.capitalEfficiency,
        financialRisk: comparison.financialRisk,
        liquidity: comparison.liquidity,
      },
      aiNarrative: comparison.aiNarrative,
    },
  };
}

type SmartMatchClubCandidate = {
  club: string;
  league: string | null;
  samePositionCount: number;
  avgOverall: number;
  avgMarketValue: number;
};

function buildRiskCompatibilityScore(riskScore: number) {
  return clamp(100 - riskScore * 10, 35, 100);
}

function buildFinancialCompatibilityScore(playerMarketValue: number | null, clubAvgMarketValue: number) {
  if (!playerMarketValue || playerMarketValue <= 0) {
    return 60;
  }

  if (clubAvgMarketValue <= 0) {
    return 52;
  }

  const ratio = playerMarketValue / clubAvgMarketValue;
  if (ratio <= 0.9) return 96;
  if (ratio <= 1.1) return 90;
  if (ratio <= 1.35) return 80;
  if (ratio <= 1.6) return 68;
  if (ratio <= 2) return 55;
  return 38;
}

function buildOverallCompatibilityScore(playerOverall: number, clubAvgOverall: number, samePositionCount: number) {
  const gap = playerOverall - clubAvgOverall;
  const squadNeedBoost = samePositionCount <= 1 ? 12 : samePositionCount === 2 ? 6 : 0;

  if (gap >= 5) return clamp(92 + squadNeedBoost, 0, 100);
  if (gap >= 2) return clamp(86 + squadNeedBoost, 0, 100);
  if (gap >= -1) return clamp(78 + squadNeedBoost, 0, 100);
  if (gap >= -4) return clamp(66 + squadNeedBoost, 0, 100);

  return clamp(54 + squadNeedBoost, 0, 100);
}

function buildSmartMatchReason(params: {
  playerName: string;
  playerOverall: number;
  playerRiskLevel: string;
  playerMarketValue: number | null;
  candidate: SmartMatchClubCandidate;
}) {
  const marketValueLabel =
    typeof params.playerMarketValue === "number" && params.playerMarketValue > 0
      ? `valor em torno de EUR ${(params.playerMarketValue / 1_000_000).toFixed(1)}M`
      : "valor de mercado ainda sem referencia forte";

  return [
    `${params.playerName} entrega overall ${params.playerOverall} para um contexto em que ${params.candidate.club} roda a posicao com media ${params.candidate.avgOverall.toFixed(1)}.`,
    `O risco ${params.playerRiskLevel.toLowerCase()} sustenta uma operacao mais controlada e o pacote financeiro parte de ${marketValueLabel}.`,
    `Amostra interna: ${params.candidate.samePositionCount} atleta(s) da mesma faixa posicional no elenco monitorado.`,
  ].join(" ");
}

export class ScoutReportService {
  constructor(private readonly repository = new ScoutReportRepository()) {}

  async listReports() {
    const reports = await this.repository.list();
    return reports.map((report) => buildStoredReportView(report));
  }

  async getReportById(id: string) {
    const report = await this.repository.findById(id);

    if (!report) {
      throw createHttpError("ScoutReport not found", 404);
    }

    return buildStoredReportView(report);
  }

  async createReport(input: CreateScoutReportInput) {
    const content = asRecord(input.content) ?? {};
    const report = await this.repository.create({
      type: input.type,
      title: normalizeText(input.title, "Scout Report"),
      description: normalizeText(input.description, "") || null,
      content,
      players: input.players,
      analyst: normalizeText(input.analyst, "") || null,
      status: input.status ?? "COMPLETED",
      playerId: typeof input.players[0]?.id === "string" ? String(input.players[0].id) : null,
      input: {
        source: "manual_save",
        players: input.players,
      },
      output: content,
      risk: asRecord(content.decisionSummary),
      aiNarrative: normalizeText(content.aiNarrative, "") || null,
    });

    return buildStoredReportView(report);
  }

  async generateReport(input: GenerateScoutReportInput) {
    const startedAt = Date.now();
    const playerIds = (input.playerIds ?? []).filter(Boolean);

    if (playerIds.length === 0) {
      throw createHttpError("At least one playerId is required", 400);
    }

    const generated =
      playerIds.length === 1
        ? await buildSinglePlayerContent(playerIds[0], input.analyst)
        : await buildComparisonContent(playerIds.slice(0, 2), input.analyst);
    const content = withGenerationMeta(generated.content, startedAt);

    const report = await this.repository.create({
      type: generated.type,
      title: normalizeText(input.title, generated.title),
      description: normalizeText(input.description, generated.description) || generated.description,
      content,
      players: generated.players,
      analyst: normalizeText(input.analyst, "") || null,
      status: "COMPLETED",
      playerId: typeof generated.players[0]?.id === "string" ? String(generated.players[0].id) : null,
      input: {
        source: "engine_generate",
        playerIds,
        players: input.players ?? [],
      },
      output: content,
      risk: asRecord(content.decisionSummary),
      aiNarrative: normalizeText(content.aiNarrative, "") || null,
    });

    return buildStoredReportView(report);
  }

  async deleteReport(id: string) {
    const existing = await this.repository.findById(id);

    if (!existing) {
      throw createHttpError("ScoutReport not found", 404);
    }

    await this.repository.delete(id);

    return {
      id,
      message: "ScoutReport deleted successfully",
    };
  }

  async getSmartMatch(playerId: string) {
    const profile = await getPlayerProfile(playerId);
    const primaryPosition = getPrimaryPosition({ positions: [profile.position ?? "CM"] });
    const playerOverall = Number(profile.overall ?? 0);
    const playerRiskScore = Number(profile.risk?.score ?? 0);
    const playerRiskLevel = normalizeText(profile.risk?.level, "MEDIUM");
    const playerMarketValue = typeof profile.marketValue === "number" ? profile.marketValue : null;

    const clubPlayers = await prisma.player.findMany({
      where: {
        id: { not: playerId },
        team: { not: null },
        positions: { has: primaryPosition },
      },
      select: {
        team: true,
        league: true,
        overall: true,
        marketValue: true,
      },
    });

    const groupedCandidates = new Map<string, SmartMatchClubCandidate>();

    for (const candidate of clubPlayers) {
      const club = normalizeText(candidate.team);
      if (!club || club === normalizeText(profile.team)) {
        continue;
      }

      const current = groupedCandidates.get(club);
      const nextOverallTotal =
        (current?.avgOverall ?? 0) * (current?.samePositionCount ?? 0) + Number(candidate.overall ?? 0);
      const nextValueTotal =
        (current?.avgMarketValue ?? 0) * (current?.samePositionCount ?? 0) + Number(candidate.marketValue ?? 0);
      const nextCount = (current?.samePositionCount ?? 0) + 1;

      groupedCandidates.set(club, {
        club,
        league: candidate.league ?? current?.league ?? null,
        samePositionCount: nextCount,
        avgOverall: nextOverallTotal / nextCount,
        avgMarketValue: nextValueTotal / nextCount,
      });
    }

    const clubs = Array.from(groupedCandidates.values())
      .map((candidate) => {
        const overallFit = buildOverallCompatibilityScore(playerOverall, candidate.avgOverall, candidate.samePositionCount);
        const riskFit = buildRiskCompatibilityScore(playerRiskScore);
        const financialFit = buildFinancialCompatibilityScore(playerMarketValue, candidate.avgMarketValue);
        const fitScore = Math.round(overallFit * 0.45 + riskFit * 0.25 + financialFit * 0.3);

        return {
          club: candidate.club,
          league: candidate.league,
          fitScore,
          reason: buildSmartMatchReason({
            playerName: getPlayerDisplayName(profile.name),
            playerOverall,
            playerRiskLevel,
            playerMarketValue,
            candidate,
          }),
          breakdown: {
            overall: Math.round(overallFit),
            risk: Math.round(riskFit),
            financial: Math.round(financialFit),
          },
        };
      })
      .sort((left, right) => right.fitScore - left.fitScore || left.club.localeCompare(right.club))
      .slice(0, 8);

    return {
      playerId,
      clubs,
    };
  }
}
