import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { buildPlayerIntelligenceProfile } from "../domain/player-intelligence/buildPlayerIntelligenceProfile";
import type { PlayerIntelligenceProfile } from "../domain/player-intelligence/types";
import { normalizeText } from "../utils/normalizeText";

type WinnerKey = "playerA" | "playerB" | "draw";
type ComparisonBlockKey = "technical" | "physical" | "tactical" | "market" | "risk" | "projection" | "dna";

type BlockWinner = {
  block: ComparisonBlockKey;
  playerA: number;
  playerB: number;
  winner: WinnerKey;
};

type FinalDecisionEntry = {
  playerId: string | null;
  playerName: string;
};

export type PlayerComparisonAnalysisResult = {
  playerAProfile: PlayerIntelligenceProfile;
  playerBProfile: PlayerIntelligenceProfile;
  comparison: {
    winnersByBlock: Record<ComparisonBlockKey, BlockWinner>;
    finalDecision: {
      betterPlayer: FinalDecisionEntry;
      saferPlayer: FinalDecisionEntry;
      higherUpside: FinalDecisionEntry;
      bestTacticalFit: FinalDecisionEntry;
    };
    summaryInsights: string[];
  };
};

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundScore(value: number) {
  return Number(value.toFixed(2));
}

function normalizeWinner(playerA: number, playerB: number, inverse = false): WinnerKey {
  if (Math.abs(playerA - playerB) < 0.01) {
    return "draw";
  }

  if (inverse) {
    return playerA < playerB ? "playerA" : "playerB";
  }

  return playerA > playerB ? "playerA" : "playerB";
}

function toDecisionEntry(profile: PlayerIntelligenceProfile | null): FinalDecisionEntry {
  if (!profile) {
    return {
      playerId: null,
      playerName: "No clear edge",
    };
  }

  return {
    playerId: profile.identity.id,
    playerName: profile.identity.name,
  };
}

function resolveDecisionProfile(
  winner: WinnerKey,
  playerAProfile: PlayerIntelligenceProfile,
  playerBProfile: PlayerIntelligenceProfile,
) {
  if (winner === "playerA") {
    return playerAProfile;
  }

  if (winner === "playerB") {
    return playerBProfile;
  }

  return null;
}

function scoreTechnical(profile: PlayerIntelligenceProfile) {
  return average([
    profile.technical.overall,
    profile.technical.ballStriking,
    profile.technical.passing,
    profile.technical.carrying,
    profile.technical.firstTouch,
    profile.technical.creativity,
    profile.technical.defending,
  ]);
}

function scorePhysical(profile: PlayerIntelligenceProfile) {
  return average([
    profile.physical.overall,
    profile.physical.acceleration,
    profile.physical.sprintSpeed,
    profile.physical.agility,
    profile.physical.balance,
    profile.physical.strength,
    profile.physical.stamina,
    profile.physical.aerial,
  ]);
}

function scoreTactical(profile: PlayerIntelligenceProfile) {
  return average([
    profile.tactical.overall,
    profile.tactical.positioning,
    profile.tactical.decisionMaking,
    profile.tactical.defensiveAwareness,
    profile.tactical.transitionImpact,
    profile.tactical.tacticalFlexibility,
    profile.tactical.roleDiscipline,
  ]);
}

function scoreMarket(profile: PlayerIntelligenceProfile) {
  return average([
    profile.market.liquidity.score,
    profile.market.valueRetention.score,
    profile.market.contractPressure.score,
    profile.summary.marketOpportunity.score,
  ]);
}

function scoreRisk(profile: PlayerIntelligenceProfile) {
  return average([
    profile.risk.overall.score,
    profile.risk.physical.score,
    profile.risk.tactical.score,
    profile.risk.financial.score,
    profile.risk.availability.score,
    profile.risk.volatility.score,
  ]);
}

function scoreProjection(profile: PlayerIntelligenceProfile) {
  return average([
    profile.projection.currentOverall,
    profile.projection.nextSeasonOverall,
    profile.projection.expectedPeakOverall,
    profile.projection.growthIndex,
    profile.projection.resaleOutlook.score,
    profile.summary.upside.score,
  ]);
}

function scoreDna(profile: PlayerIntelligenceProfile) {
  return average(profile.dna.traits.map((trait) => trait.value));
}

function buildBlockWinner(
  block: ComparisonBlockKey,
  playerA: number,
  playerB: number,
  inverse = false,
): BlockWinner {
  return {
    block,
    playerA: roundScore(playerA),
    playerB: roundScore(playerB),
    winner: normalizeWinner(playerA, playerB, inverse),
  };
}

function buildInsightFromBlock(
  winnerProfile: PlayerIntelligenceProfile,
  loserProfile: PlayerIntelligenceProfile,
  block: ComparisonBlockKey,
  delta: number,
) {
  if (block === "technical") {
    return `${winnerProfile.identity.name} leads the technical block with stronger passing, carrying and final-action quality than ${loserProfile.identity.name}.`;
  }

  if (block === "physical") {
    return `${winnerProfile.identity.name} shows the stronger physical base through acceleration, speed endurance and duel support.`;
  }

  if (block === "tactical") {
    return `${winnerProfile.identity.name} owns the clearer tactical edge with better decision-making, positioning and role discipline.`;
  }

  if (block === "market") {
    return `${winnerProfile.identity.name} is the cleaner market opportunity with better liquidity, retention and contract timing.`;
  }

  if (block === "risk") {
    return `${winnerProfile.identity.name} profiles as the safer choice with lower overall exposure across physical, tactical and financial risk.`;
  }

  if (block === "projection") {
    return `${winnerProfile.identity.name} projects the better upside with a stronger growth index and higher expected peak.`;
  }

  return `${winnerProfile.identity.name} has the stronger DNA profile, especially in ${winnerProfile.dna.dominantTraits.slice(0, 2).join(" and ").toLowerCase()}, creating a ${roundScore(delta)}-point edge.`;
}

function buildSummaryInsights(
  playerAProfile: PlayerIntelligenceProfile,
  playerBProfile: PlayerIntelligenceProfile,
  winnersByBlock: Record<ComparisonBlockKey, BlockWinner>,
) {
  const rankedBlocks = (Object.values(winnersByBlock) as BlockWinner[])
    .filter((entry) => entry.winner !== "draw")
    .map((entry) => ({
      ...entry,
      delta: Math.abs(entry.playerA - entry.playerB),
    }))
    .sort((left, right) => right.delta - left.delta)
    .slice(0, 5);

  if (rankedBlocks.length === 0) {
    return [
      `${playerAProfile.identity.name} and ${playerBProfile.identity.name} are effectively level across the comparison model.`,
    ];
  }

  return rankedBlocks.map((entry) => {
    const winnerProfile = entry.winner === "playerA" ? playerAProfile : playerBProfile;
    const loserProfile = entry.winner === "playerA" ? playerBProfile : playerAProfile;

    return buildInsightFromBlock(winnerProfile, loserProfile, entry.block, entry.delta);
  });
}

function buildComparison(
  playerAProfile: PlayerIntelligenceProfile,
  playerBProfile: PlayerIntelligenceProfile,
) {
  const technical = buildBlockWinner("technical", scoreTechnical(playerAProfile), scoreTechnical(playerBProfile));
  const physical = buildBlockWinner("physical", scorePhysical(playerAProfile), scorePhysical(playerBProfile));
  const tactical = buildBlockWinner("tactical", scoreTactical(playerAProfile), scoreTactical(playerBProfile));
  const market = buildBlockWinner("market", scoreMarket(playerAProfile), scoreMarket(playerBProfile));
  const risk = buildBlockWinner("risk", scoreRisk(playerAProfile), scoreRisk(playerBProfile), true);
  const projection = buildBlockWinner("projection", scoreProjection(playerAProfile), scoreProjection(playerBProfile));
  const dna = buildBlockWinner("dna", scoreDna(playerAProfile), scoreDna(playerBProfile));

  const winnersByBlock = {
    technical,
    physical,
    tactical,
    market,
    risk,
    projection,
    dna,
  } satisfies Record<ComparisonBlockKey, BlockWinner>;

  const weightedScoreA =
    technical.playerA * 0.24 +
    physical.playerA * 0.14 +
    tactical.playerA * 0.2 +
    market.playerA * 0.1 +
    (100 - risk.playerA) * 0.12 +
    projection.playerA * 0.14 +
    dna.playerA * 0.06;

  const weightedScoreB =
    technical.playerB * 0.24 +
    physical.playerB * 0.14 +
    tactical.playerB * 0.2 +
    market.playerB * 0.1 +
    (100 - risk.playerB) * 0.12 +
    projection.playerB * 0.14 +
    dna.playerB * 0.06;

  return {
    winnersByBlock,
    finalDecision: {
      betterPlayer: toDecisionEntry(
        resolveDecisionProfile(normalizeWinner(weightedScoreA, weightedScoreB), playerAProfile, playerBProfile),
      ),
      saferPlayer: toDecisionEntry(resolveDecisionProfile(risk.winner, playerAProfile, playerBProfile)),
      higherUpside: toDecisionEntry(resolveDecisionProfile(projection.winner, playerAProfile, playerBProfile)),
      bestTacticalFit: toDecisionEntry(resolveDecisionProfile(tactical.winner, playerAProfile, playerBProfile)),
    },
    summaryInsights: buildSummaryInsights(playerAProfile, playerBProfile, winnersByBlock),
  };
}

function buildAnalysisDescription(
  playerAProfile: PlayerIntelligenceProfile,
  playerBProfile: PlayerIntelligenceProfile,
  comparison: PlayerComparisonAnalysisResult["comparison"],
) {
  return [
    `${playerAProfile.identity.name} vs ${playerBProfile.identity.name}.`,
    `Better player: ${comparison.finalDecision.betterPlayer.playerName}.`,
    `Safer player: ${comparison.finalDecision.saferPlayer.playerName}.`,
    `Higher upside: ${comparison.finalDecision.higherUpside.playerName}.`,
    `Best tactical fit: ${comparison.finalDecision.bestTacticalFit.playerName}.`,
  ].join(" ");
}

async function persistComparisonAnalysis(result: PlayerComparisonAnalysisResult) {
  await prisma.analysis.create({
    data: {
      type: "PLAYER_COMPARISON",
      title: normalizeText(`${result.playerAProfile.identity.name} vs ${result.playerBProfile.identity.name}`),
      description: normalizeText(buildAnalysisDescription(result.playerAProfile, result.playerBProfile, result.comparison)),
      analyst: normalizeText("SoccerMind Comparison Engine"),
      status: "COMPLETED",
      payload: {
        type: "PLAYER_COMPARISON",
        ...JSON.parse(JSON.stringify(result)),
      } as Prisma.InputJsonValue,
      comparisons: {
        create: [
          {
            playerId: result.playerAProfile.identity.id,
            order: 0,
          },
          {
            playerId: result.playerBProfile.identity.id,
            order: 1,
          },
        ],
      },
    },
  });
}

async function findPlayerByNameOrThrow(name: string) {
  const exactMatch = await prisma.player.findFirst({
    where: {
      name: {
        equals: name,
        mode: "insensitive",
      },
    },
    select: {
      id: true,
    },
  });

  if (exactMatch) {
    return exactMatch;
  }

  const normalizedQuery = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();

  const players = await prisma.player.findMany({
    where: {
      name: {
        contains: name.trim(),
        mode: "insensitive",
      },
    },
    select: {
      id: true,
      name: true,
    },
  });

  const fallback = players.find((player) => {
    const normalizedName = player.name
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .trim();

    return normalizedName === normalizedQuery;
  });

  if (!fallback) {
    throw new Error(`Player not found by name: ${name}`);
  }

  return fallback;
}

export async function comparePlayers(playerAId: string, playerBId: string): Promise<PlayerComparisonAnalysisResult> {
  const [playerAProfile, playerBProfile] = await Promise.all([
    buildPlayerIntelligenceProfile(playerAId),
    buildPlayerIntelligenceProfile(playerBId),
  ]);

  const result: PlayerComparisonAnalysisResult = {
    playerAProfile,
    playerBProfile,
    comparison: buildComparison(playerAProfile, playerBProfile),
  };

  await persistComparisonAnalysis(result);

  return result;
}

export async function comparePlayersByName(playerAName: string, playerBName: string) {
  const [playerA, playerB] = await Promise.all([
    findPlayerByNameOrThrow(playerAName),
    findPlayerByNameOrThrow(playerBName),
  ]);

  return comparePlayers(playerA.id, playerB.id);
}
