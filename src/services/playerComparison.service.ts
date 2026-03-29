import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { buildPlayerIntelligenceProfile } from "../domain/player-intelligence/buildPlayerIntelligenceProfile";
import type { PlayerIntelligenceProfile, ScoreBand } from "../domain/player-intelligence/types";

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

export type PlayerComparisonResult = {
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
  players: {
    playerA: {
      id: string;
      name: string;
      position: string | null;
      age: number | null;
      nationality: string | null;
    };
    playerB: {
      id: string;
      name: string;
      position: string | null;
      age: number | null;
      nationality: string | null;
    };
  };
  quantitative: {
    scoreA: number;
    scoreB: number;
    difference: number;
    winner: "A" | "B" | "DRAW";
  };
  explainability: {
    playerA: {
      topFactors: string[];
      positiveSignals: string[];
      riskDrivers: string[];
    };
    playerB: {
      topFactors: string[];
      positiveSignals: string[];
      riskDrivers: string[];
    };
  };
  risk: {
    playerA: {
      totalRisk: number;
      riskLevel: "LOW" | "MEDIUM" | "HIGH";
      executiveSummary: string;
    };
    playerB: {
      totalRisk: number;
      riskLevel: "LOW" | "MEDIUM" | "HIGH";
      executiveSummary: string;
    };
  };
  antiFlop: {
    playerA: {
      flopProbability: number;
      safetyIndex: number;
      classification: "SAFE" | "MODERATE" | "HIGH_RISK";
    };
    playerB: {
      flopProbability: number;
      safetyIndex: number;
      classification: "SAFE" | "MODERATE" | "HIGH_RISK";
    };
  };
  capitalEfficiency: {
    playerA: {
      index: number;
    };
    playerB: {
      index: number;
    };
  };
  financialRisk: {
    playerA: {
      riskIndex: number;
    };
    playerB: {
      riskIndex: number;
    };
  };
  liquidity: {
    playerA: {
      liquidityScore: number;
    };
    playerB: {
      liquidityScore: number;
    };
  };
  aiNarrative: string;
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

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
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
    profile.executiveSnapshot.marketOpportunity.score,
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
    profile.executiveSnapshot.upside.score,
  ]);
}

function scoreDna(profile: PlayerIntelligenceProfile) {
  return average(profile.soccerMindDNA.traits.map((trait) => trait.value));
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

function buildInsightFromBand(
  winnerProfile: PlayerIntelligenceProfile,
  loserProfile: PlayerIntelligenceProfile,
  block: ComparisonBlockKey,
  delta: number,
) {
  if (block === "technical") {
    return `${winnerProfile.identity.name} creates the technical edge with ${winnerProfile.technical.passing} passing and ${winnerProfile.technical.carrying} carrying, outpacing ${loserProfile.identity.name} by ${roundScore(delta)} points in the technical block.`;
  }

  if (block === "physical") {
    return `${winnerProfile.identity.name} is the stronger physical profile, driven by ${winnerProfile.physical.acceleration} acceleration, ${winnerProfile.physical.sprintSpeed} sprint speed and ${winnerProfile.physical.stamina} stamina.`;
  }

  if (block === "tactical") {
    return `${winnerProfile.identity.name} reads the game better in this comparison, with stronger decision-making (${winnerProfile.tactical.decisionMaking}) and role discipline (${winnerProfile.tactical.roleDiscipline}).`;
  }

  if (block === "market") {
    return `${winnerProfile.identity.name} is the cleaner market play right now thanks to ${winnerProfile.market.liquidity.label}, ${winnerProfile.market.valueRetention.label} retention and a stronger opportunity score.`;
  }

  if (block === "risk") {
    return `${winnerProfile.identity.name} profiles as the safer option because the overall risk load is lower and the exposure stays more controlled across physical, tactical and financial layers.`;
  }

  if (block === "projection") {
    return `${winnerProfile.identity.name} owns the better future curve, projecting to ${winnerProfile.projection.expectedPeakOverall} at peak with a growth index of ${winnerProfile.projection.growthIndex}.`;
  }

  return `${winnerProfile.identity.name} shows the stronger SoccerMind DNA, with dominant traits around ${winnerProfile.soccerMindDNA.dominantTraits.slice(0, 2).join(" and ").toLowerCase()}.`;
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
    .sort((left, right) => right.delta - left.delta);

  const insights = rankedBlocks.slice(0, 5).map((entry) => {
    const winnerProfile = entry.winner === "playerA" ? playerAProfile : playerBProfile;
    const loserProfile = entry.winner === "playerA" ? playerBProfile : playerAProfile;

    return buildInsightFromBand(winnerProfile, loserProfile, entry.block, entry.delta);
  });

  if (insights.length > 0) {
    return insights;
  }

  return [
    `${playerAProfile.identity.name} and ${playerBProfile.identity.name} are tightly matched across the comparison blocks, with no decisive separation in the current model.`,
  ];
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

  const weightedA =
    technical.playerA * 0.24 +
    physical.playerA * 0.14 +
    tactical.playerA * 0.2 +
    market.playerA * 0.1 +
    (100 - scoreRisk(playerAProfile)) * 0.12 +
    projection.playerA * 0.14 +
    dna.playerA * 0.06;
  const weightedB =
    technical.playerB * 0.24 +
    physical.playerB * 0.14 +
    tactical.playerB * 0.2 +
    market.playerB * 0.1 +
    (100 - scoreRisk(playerBProfile)) * 0.12 +
    projection.playerB * 0.14 +
    dna.playerB * 0.06;

  const betterPlayer = resolveDecisionProfile(
    normalizeWinner(weightedA, weightedB),
    playerAProfile,
    playerBProfile,
  );
  const saferPlayer = resolveDecisionProfile(risk.winner, playerAProfile, playerBProfile);
  const higherUpside = resolveDecisionProfile(projection.winner, playerAProfile, playerBProfile);
  const bestTacticalFit = resolveDecisionProfile(tactical.winner, playerAProfile, playerBProfile);

  const winnersByBlock = {
    technical,
    physical,
    tactical,
    market,
    risk,
    projection,
    dna,
  } satisfies Record<ComparisonBlockKey, BlockWinner>;

  return {
    winnersByBlock,
    finalDecision: {
      betterPlayer: toDecisionEntry(betterPlayer),
      saferPlayer: toDecisionEntry(saferPlayer),
      higherUpside: toDecisionEntry(higherUpside),
      bestTacticalFit: toDecisionEntry(bestTacticalFit),
    },
    summaryInsights: buildSummaryInsights(playerAProfile, playerBProfile, winnersByBlock),
  };
}

function winnerToLegacyLabel(winner: WinnerKey): "A" | "B" | "DRAW" {
  if (winner === "playerA") {
    return "A";
  }

  if (winner === "playerB") {
    return "B";
  }

  return "DRAW";
}

function riskClassification(score: number): "SAFE" | "MODERATE" | "HIGH_RISK" {
  if (score >= 65) {
    return "HIGH_RISK";
  }

  if (score >= 45) {
    return "MODERATE";
  }

  return "SAFE";
}

function riskLevelFromScore(score: number): "LOW" | "MEDIUM" | "HIGH" {
  if (score >= 65) {
    return "HIGH";
  }

  if (score >= 45) {
    return "MEDIUM";
  }

  return "LOW";
}

function buildLegacyExplainability(profile: PlayerIntelligenceProfile) {
  return {
    topFactors: [
      profile.tactical.bestSystem,
      profile.soccerMindDNA.archetype,
      profile.executiveSnapshot.marketOpportunity.label,
    ],
    positiveSignals: [
      profile.executiveSnapshot.upside.label,
      profile.market.liquidity.label,
      profile.market.valueRetention.label,
    ],
    riskDrivers: [
      profile.risk.overall.label,
      profile.risk.financial.label,
      profile.risk.tactical.label,
    ],
  };
}

function buildLegacyPayload(
  playerAProfile: PlayerIntelligenceProfile,
  playerBProfile: PlayerIntelligenceProfile,
  comparison: PlayerComparisonResult["comparison"],
) {
  const scoreA =
    comparison.winnersByBlock.technical.playerA * 0.24 +
    comparison.winnersByBlock.physical.playerA * 0.14 +
    comparison.winnersByBlock.tactical.playerA * 0.2 +
    comparison.winnersByBlock.market.playerA * 0.1 +
    (100 - comparison.winnersByBlock.risk.playerA) * 0.12 +
    comparison.winnersByBlock.projection.playerA * 0.14 +
    comparison.winnersByBlock.dna.playerA * 0.06;
  const scoreB =
    comparison.winnersByBlock.technical.playerB * 0.24 +
    comparison.winnersByBlock.physical.playerB * 0.14 +
    comparison.winnersByBlock.tactical.playerB * 0.2 +
    comparison.winnersByBlock.market.playerB * 0.1 +
    (100 - comparison.winnersByBlock.risk.playerB) * 0.12 +
    comparison.winnersByBlock.projection.playerB * 0.14 +
    comparison.winnersByBlock.dna.playerB * 0.06;
  const quantitativeWinner = winnerToLegacyLabel(normalizeWinner(scoreA, scoreB));

  return {
    players: {
      playerA: {
        id: playerAProfile.identity.id,
        name: playerAProfile.identity.name,
        position: playerAProfile.identity.primaryPosition,
        age: playerAProfile.identity.age,
        nationality: playerAProfile.identity.nationality,
      },
      playerB: {
        id: playerBProfile.identity.id,
        name: playerBProfile.identity.name,
        position: playerBProfile.identity.primaryPosition,
        age: playerBProfile.identity.age,
        nationality: playerBProfile.identity.nationality,
      },
    },
    quantitative: {
      scoreA: roundScore(scoreA),
      scoreB: roundScore(scoreB),
      difference: roundScore(Math.abs(scoreA - scoreB)),
      winner: quantitativeWinner,
    },
    explainability: {
      playerA: buildLegacyExplainability(playerAProfile),
      playerB: buildLegacyExplainability(playerBProfile),
    },
    risk: {
      playerA: {
        totalRisk: roundScore(playerAProfile.risk.overall.score / 10),
        riskLevel: riskLevelFromScore(playerAProfile.risk.overall.score),
        executiveSummary: playerAProfile.risk.overall.summary,
      },
      playerB: {
        totalRisk: roundScore(playerBProfile.risk.overall.score / 10),
        riskLevel: riskLevelFromScore(playerBProfile.risk.overall.score),
        executiveSummary: playerBProfile.risk.overall.summary,
      },
    },
    antiFlop: {
      playerA: {
        flopProbability: roundScore(playerAProfile.risk.overall.score),
        safetyIndex: roundScore(100 - playerAProfile.risk.overall.score),
        classification: riskClassification(playerAProfile.risk.overall.score),
      },
      playerB: {
        flopProbability: roundScore(playerBProfile.risk.overall.score),
        safetyIndex: roundScore(100 - playerBProfile.risk.overall.score),
        classification: riskClassification(playerBProfile.risk.overall.score),
      },
    },
    capitalEfficiency: {
      playerA: {
        index: roundScore(clamp(playerAProfile.executiveSnapshot.marketOpportunity.score / 10, 0, 10)),
      },
      playerB: {
        index: roundScore(clamp(playerBProfile.executiveSnapshot.marketOpportunity.score / 10, 0, 10)),
      },
    },
    financialRisk: {
      playerA: {
        riskIndex: playerAProfile.risk.financial.score,
      },
      playerB: {
        riskIndex: playerBProfile.risk.financial.score,
      },
    },
    liquidity: {
      playerA: {
        liquidityScore: playerAProfile.market.liquidity.score,
      },
      playerB: {
        liquidityScore: playerBProfile.market.liquidity.score,
      },
    },
    aiNarrative: comparison.summaryInsights.join(" "),
  };
}

function buildAnalysisDescription(
  playerAProfile: PlayerIntelligenceProfile,
  playerBProfile: PlayerIntelligenceProfile,
  comparison: PlayerComparisonResult["comparison"],
) {
  const betterPlayer = comparison.finalDecision.betterPlayer.playerName;
  const saferPlayer = comparison.finalDecision.saferPlayer.playerName;
  const higherUpside = comparison.finalDecision.higherUpside.playerName;

  return `${playerAProfile.identity.name} vs ${playerBProfile.identity.name}. Better player: ${betterPlayer}. Safer player: ${saferPlayer}. Higher upside: ${higherUpside}.`;
}

function extractSummarySignal(band: ScoreBand) {
  return `${band.label} (${band.score})`;
}

async function persistComparisonAnalysis(
  playerAProfile: PlayerIntelligenceProfile,
  playerBProfile: PlayerIntelligenceProfile,
  result: PlayerComparisonResult,
) {
  const serializedPayload = {
    ...result,
    metadata: {
      generatedAt: new Date().toISOString(),
      playerAExecutiveSignal: extractSummarySignal(playerAProfile.executiveSnapshot.currentLevel),
      playerBExecutiveSignal: extractSummarySignal(playerBProfile.executiveSnapshot.currentLevel),
    },
  };

  await prisma.analysis.create({
    data: {
      type: "player-comparison",
      title: `${playerAProfile.identity.name} vs ${playerBProfile.identity.name}`,
      description: buildAnalysisDescription(playerAProfile, playerBProfile, result.comparison),
      analyst: "SoccerMind Comparison Engine",
      status: "COMPLETED",
      payload: JSON.parse(JSON.stringify(serializedPayload)) as Prisma.InputJsonValue,
      comparisons: {
        create: [
          {
            playerId: playerAProfile.identity.id,
            order: 0,
          },
          {
            playerId: playerBProfile.identity.id,
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

export async function comparePlayers(playerAId: string, playerBId: string): Promise<PlayerComparisonResult> {
  const [playerAProfile, playerBProfile] = await Promise.all([
    buildPlayerIntelligenceProfile(playerAId),
    buildPlayerIntelligenceProfile(playerBId),
  ]);
  const comparison = buildComparison(playerAProfile, playerBProfile);
  const legacyPayload = buildLegacyPayload(playerAProfile, playerBProfile, comparison);

  const result: PlayerComparisonResult = {
    playerAProfile,
    playerBProfile,
    comparison,
    ...legacyPayload,
  };

  await persistComparisonAnalysis(playerAProfile, playerBProfile, result);

  return result;
}

export async function comparePlayersByName(playerAName: string, playerBName: string) {
  const [playerA, playerB] = await Promise.all([
    findPlayerByNameOrThrow(playerAName),
    findPlayerByNameOrThrow(playerBName),
  ]);

  return comparePlayers(playerA.id, playerB.id);
}
