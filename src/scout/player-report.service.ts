import { createReportAnalysis } from "../analysis/analysis.service";
import { generatePlayerNarrativeReport } from "../ai/scout.service";
import { getPlayerProfile, getPlayerProjection } from "./player.service";
import { buildExecutiveRiskSummary } from "./risk.summary";

type PlayerProfileResponse = Awaited<ReturnType<typeof getPlayerProfile>>;
type PlayerProjectionResponse = Awaited<ReturnType<typeof getPlayerProjection>>;

function createHttpError(message: string, statusCode: number) {
  const error = new Error(message) as Error & { statusCode?: number };
  error.statusCode = statusCode;
  return error;
}

function toDisplayTier(tier: string | null | undefined) {
  switch (tier) {
    case "ELITE":
      return "ELITE";
    case "A":
      return "PREMIUM";
    case "B":
    case "C":
      return "STANDARD";
    default:
      return "PROSPECT";
  }
}

function normalizeNarrativeDescription(value: string | null) {
  if (!value) {
    return "";
  }

  return value.trim().slice(0, 4000);
}

function buildFallbackRecommendation(profile: PlayerProfileResponse, projection: PlayerProjectionResponse) {
  const riskLevel = String(profile.risk?.level ?? "MEDIUM");
  const liquidityScore = typeof profile.liquidityScore === "number" ? profile.liquidityScore : 0;
  const expectedPeak = typeof projection.expectedPeak === "number" ? projection.expectedPeak : profile.potential ?? profile.overall ?? 0;

  if (riskLevel === "LOW" && liquidityScore >= 6.5 && expectedPeak >= (profile.overall ?? 0) + 2) {
    return "Ativo com janela favoravel para investimento, desde que o pacote financeiro permaneça dentro da disciplina de caixa do clube.";
  }

  if (riskLevel === "HIGH" || liquidityScore < 4.5) {
    return "Recomendacao condicionada a desconto relevante de entrada e validacao adicional do contexto competitivo antes de avancar.";
  }

  return "Perfil elegivel para acompanhamento executivo, com decisao final dependente de preco, timing de oportunidade e encaixe esportivo.";
}

export async function generatePlayerReportAnalysis(playerId: string, options?: { analyst?: string }) {
  let profile: PlayerProfileResponse;

  try {
    profile = await getPlayerProfile(playerId);
  } catch (error) {
    if (error instanceof Error && error.message === "Player not found") {
      throw createHttpError("Player not found", 404);
    }

    throw error;
  }

  const projection = await getPlayerProjection(playerId);
  const displayTier = toDisplayTier(profile.tier);
  const normalizedRiskLevel =
    profile.risk?.level === "LOW" || profile.risk?.level === "MEDIUM" || profile.risk?.level === "HIGH"
      ? profile.risk.level
      : "MEDIUM";
  const riskSummary = buildExecutiveRiskSummary(profile.name, {
    totalRisk: Number(profile.structuralRisk ?? 0),
    riskLevel: normalizedRiskLevel,
    breakdown: {
      age: Number(profile.structuralRisk ?? 0) * 0.4,
      competitive: Number(profile.structuralRisk ?? 0) * 0.6,
      structural: Number(profile.structuralRisk ?? 0),
    },
    factors: [],
  });

  let aiResult;

  try {
    aiResult = await generatePlayerNarrativeReport({
      name: profile.name,
      position: profile.position ?? "N/A",
      age: profile.age ?? 0,
      club: profile.team ?? "Sem clube",
      league: profile.league ?? "Sem liga",
      overall: profile.overall ?? 0,
      potential: profile.potential ?? profile.overall ?? 0,
      tier: displayTier,
      archetype: profile.archetype?.label ?? "Balanced Player",
      riskScore: Number(profile.risk?.score ?? 0),
      riskLevel: normalizedRiskLevel,
      liquidityScore: Number(profile.liquidityScore ?? 0),
      capitalEfficiency: Number(profile.capitalEfficiency ?? 0),
      marketValue: Number(((profile.marketValue ?? 0) / 1_000_000).toFixed(1)),
    });
  } catch (error) {
    console.error("OpenAI error:", error);
    throw createHttpError("IA indisponível, tente novamente", 500);
  }

  if (!aiResult.narrative?.trim()) {
    console.error("OpenAI error:", new Error("OpenAI returned an empty narrative for player report."));
    throw createHttpError("IA indisponível, tente novamente", 500);
  }

  const recommendation = aiResult.recommendation ?? buildFallbackRecommendation(profile, projection);
  const createdAt = new Date().toISOString();
  const metrics = {
    overall: profile.overall ?? 0,
    potential: profile.potential ?? profile.overall ?? 0,
    tier: displayTier,
    archetype: profile.archetype?.label ?? "Balanced Player",
    archetypeConfidence: profile.archetype?.confidence ?? null,
    riskScore: Number(profile.risk?.score ?? 0),
    riskLevel: normalizedRiskLevel,
    riskSummary,
    financialRisk: Number(profile.financialRisk ?? 0),
    liquidityScore: Number(profile.liquidityScore ?? 0),
    capitalEfficiency: Number(profile.capitalEfficiency ?? 0),
    marketValue: typeof profile.marketValue === "number" ? profile.marketValue : null,
    growthProjection: projection,
  };

  const savedAnalysis = await createReportAnalysis({
    playerIds: [playerId],
    title: `Relatorio Individual - ${profile.name}`,
    description: normalizeNarrativeDescription(aiResult.narrative),
    analyst: options?.analyst,
  });

  return {
    analysisId: savedAnalysis.id,
    player: profile,
    metrics,
    aiNarrative: aiResult.narrative,
    recommendation,
    createdAt,
  };
}

