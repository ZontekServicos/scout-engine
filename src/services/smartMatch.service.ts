import { prisma } from "../lib/prisma";
import { getPlayerProfile } from "../scout/player.service";
import { getPlayerDisplayName } from "../utils/player-display";
import { getPrimaryPosition } from "../utils/positions";

type SmartMatchClubCandidate = {
  club: string;
  league: string | null;
  samePositionCount: number;
  avgOverall: number;
  avgMarketValue: number;
};

function normalizeText(value: unknown, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

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

export async function getSmartMatch(playerId: string) {
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
