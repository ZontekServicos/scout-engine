import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { buildPlayerIntelligenceProfile } from "../domain/player-intelligence/buildPlayerIntelligenceProfile";
import type { PlayerIntelligenceProfile } from "../domain/player-intelligence/types";
import { normalizeText } from "../utils/normalizeText";

type WinnerKey = "A" | "B" | "tie";
type ComparisonBlockKey = "technical" | "physical" | "tactical" | "market" | "risk" | "projection" | "dna";

type InternalBlockScore = {
  block: ComparisonBlockKey;
  scoreA: number;
  scoreB: number;
  winner: WinnerKey;
};

export type PlayerComparisonResult = {
  playerAProfile: PlayerIntelligenceProfile;
  playerBProfile: PlayerIntelligenceProfile;
  comparison: {
    winnersByBlock: Record<string, "A" | "B" | "tie">;
    finalDecision: {
      betterPlayer: "A" | "B";
      saferPlayer: "A" | "B";
      higherUpside: "A" | "B";
      bestTacticalFit: "A" | "B";
    };
    summaryInsights: string[];
  };
};

export type PlayerComparisonAnalysisResult = PlayerComparisonResult;

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function round(value: number) {
  return Number(value.toFixed(2));
}

// TASK 2 — core compareBlock helper
function compareBlock(a: number, b: number, invert = false): WinnerKey {
  if (Math.abs(a - b) < 0.01) return "tie";
  if (invert) return a < b ? "A" : "B";
  return a > b ? "A" : "B";
}

function buildBlockScore(
  block: ComparisonBlockKey,
  scoreA: number,
  scoreB: number,
  invert = false,
): InternalBlockScore {
  return { block, scoreA: round(scoreA), scoreB: round(scoreB), winner: compareBlock(scoreA, scoreB, invert) };
}

// TASK 3 — per-block scoring using PlayerIntelligenceProfile attributes

function scoreTechnical(p: PlayerIntelligenceProfile): number {
  // key passes → passing + creativity; xG → ballStriking; xA → firstTouch + carrying
  return average([
    p.technical.overall,
    p.technical.passing,
    p.technical.creativity,
    p.technical.ballStriking,
    p.technical.firstTouch,
    p.technical.carrying,
    p.technical.defending,
  ]);
}

function scorePhysical(p: PlayerIntelligenceProfile): number {
  return average([
    p.physical.overall,
    p.physical.stamina,
    p.physical.strength,
    p.physical.acceleration,
    p.physical.sprintSpeed,
    p.physical.agility,
    p.physical.balance,
    p.physical.aerial,
  ]);
}

function scoreTactical(p: PlayerIntelligenceProfile): number {
  return average([
    p.tactical.overall,
    p.tactical.positioning,
    p.tactical.decisionMaking,
    p.tactical.defensiveAwareness,
    p.tactical.transitionImpact,
    p.tactical.tacticalFlexibility,
    p.tactical.roleDiscipline,
  ]);
}

function scoreMarket(p: PlayerIntelligenceProfile): number {
  return average([
    p.market.liquidity.score,
    p.market.valueRetention.score,
    p.market.contractPressure.score,
    p.summary.marketOpportunity.score,
  ]);
}

function scoreRisk(p: PlayerIntelligenceProfile): number {
  // lower is better — invert=true in compareBlock
  return average([
    p.risk.overall.score,
    p.risk.physical.score,
    p.risk.tactical.score,
    p.risk.financial.score,
    p.risk.availability.score,
    p.risk.volatility.score,
  ]);
}

function scoreProjection(p: PlayerIntelligenceProfile): number {
  return average([
    p.projection.currentOverall,
    p.projection.nextSeasonOverall,
    p.projection.expectedPeakOverall,
    p.projection.growthIndex,
    p.projection.resaleOutlook.score,
    p.summary.upside.score,
  ]);
}

function scoreDna(p: PlayerIntelligenceProfile): number {
  // progression + pressing proxied through trait values
  if (p.dna.traits.length === 0) return 0;
  return average(p.dna.traits.map((t) => t.value));
}

// TASK 4 — final decision helpers

function countBlockWins(scores: InternalBlockScore[], side: "A" | "B"): number {
  return scores.filter((s) => s.winner === side).length;
}

function resolveFinalWinner(winner: WinnerKey, tiebreaker: WinnerKey): "A" | "B" {
  if (winner === "A" || winner === "B") return winner;
  return tiebreaker === "B" ? "B" : "A";
}

// TASK 5 — summary insights

function buildInsight(
  winnerProfile: PlayerIntelligenceProfile,
  loserProfile: PlayerIntelligenceProfile,
  block: ComparisonBlockKey,
  delta: number,
): string {
  const wName = winnerProfile.identity.name;
  const lName = loserProfile.identity.name;

  switch (block) {
    case "technical":
      return `${wName} shows stronger offensive progression with superior passing, carrying and final-action quality over ${lName}.`;
    case "physical":
      return `${wName} holds a physical edge in stamina and strength, giving better coverage and duel support than ${lName}.`;
    case "tactical":
      return `${wName} owns a clear tactical advantage — better decision-making, transition impact and role discipline compared to ${lName}.`;
    case "market":
      return `${wName} is the cleaner market opportunity with better liquidity and value retention (${round(delta)}-pt edge).`;
    case "risk":
      return `${wName} presents lower financial and physical risk, making them the safer acquisition over ${lName}.`;
    case "projection":
      return `${wName} projects the higher upside, with a stronger growth index and expected peak than ${lName}.`;
    case "dna":
      return `Significant difference in DNA profile — ${wName} leads in ${winnerProfile.dna.dominantTraits.slice(0, 2).join(" and ").toLowerCase()}.`;
  }
}

function buildSummaryInsights(
  playerAProfile: PlayerIntelligenceProfile,
  playerBProfile: PlayerIntelligenceProfile,
  scores: InternalBlockScore[],
): string[] {
  const decisive = scores
    .filter((s) => s.winner !== "tie")
    .map((s) => ({ ...s, delta: Math.abs(s.scoreA - s.scoreB) }))
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 5);

  if (decisive.length === 0) {
    return [
      `${playerAProfile.identity.name} and ${playerBProfile.identity.name} are effectively level across all comparison blocks.`,
    ];
  }

  const insights = decisive.map((entry) => {
    const winner = entry.winner === "A" ? playerAProfile : playerBProfile;
    const loser = entry.winner === "A" ? playerBProfile : playerAProfile;
    return buildInsight(winner, loser, entry.block, entry.delta);
  });

  // Add a tactical context insight if both bestSystem / bestRole differ
  const roleA = playerAProfile.tactical.bestRole;
  const roleB = playerBProfile.tactical.bestRole;
  if (roleA && roleB && roleA !== roleB && insights.length < 5) {
    insights.push(
      `${playerAProfile.identity.name} is best suited as ${roleA} while ${playerBProfile.identity.name} fits ${roleB} — context matters for positional fit.`,
    );
  }

  return insights.slice(0, 5);
}

function buildComparison(
  playerAProfile: PlayerIntelligenceProfile,
  playerBProfile: PlayerIntelligenceProfile,
): PlayerComparisonResult["comparison"] {
  const scores: InternalBlockScore[] = [
    buildBlockScore("technical", scoreTechnical(playerAProfile), scoreTechnical(playerBProfile)),
    buildBlockScore("physical", scorePhysical(playerAProfile), scorePhysical(playerBProfile)),
    buildBlockScore("tactical", scoreTactical(playerAProfile), scoreTactical(playerBProfile)),
    buildBlockScore("market", scoreMarket(playerAProfile), scoreMarket(playerBProfile)),
    buildBlockScore("risk", scoreRisk(playerAProfile), scoreRisk(playerBProfile), true), // lower is better
    buildBlockScore("projection", scoreProjection(playerAProfile), scoreProjection(playerBProfile)),
    buildBlockScore("dna", scoreDna(playerAProfile), scoreDna(playerBProfile)),
  ];

  const winnersByBlock: Record<string, "A" | "B" | "tie"> = Object.fromEntries(
    scores.map((s) => [s.block, s.winner]),
  );

  // TASK 4 — betterPlayer: who wins the most blocks
  const winsA = countBlockWins(scores, "A");
  const winsB = countBlockWins(scores, "B");
  const blockCountWinner: WinnerKey = winsA > winsB ? "A" : winsB > winsA ? "B" : "tie";

  // Weighted score as tiebreaker for betterPlayer
  const riskA = scores.find((s) => s.block === "risk")!.scoreA;
  const riskB = scores.find((s) => s.block === "risk")!.scoreB;
  const technicalScore = scores.find((s) => s.block === "technical")!;
  const physicalScore = scores.find((s) => s.block === "physical")!;
  const tacticalScore = scores.find((s) => s.block === "tactical")!;
  const marketScore = scores.find((s) => s.block === "market")!;
  const projectionScore = scores.find((s) => s.block === "projection")!;
  const dnaScore = scores.find((s) => s.block === "dna")!;
  const riskScore = scores.find((s) => s.block === "risk")!;

  const weightedA =
    technicalScore.scoreA * 0.24 +
    physicalScore.scoreA * 0.14 +
    tacticalScore.scoreA * 0.20 +
    marketScore.scoreA * 0.10 +
    (100 - riskA) * 0.12 +
    projectionScore.scoreA * 0.14 +
    dnaScore.scoreA * 0.06;

  const weightedB =
    technicalScore.scoreB * 0.24 +
    physicalScore.scoreB * 0.14 +
    tacticalScore.scoreB * 0.20 +
    marketScore.scoreB * 0.10 +
    (100 - riskB) * 0.12 +
    projectionScore.scoreB * 0.14 +
    dnaScore.scoreB * 0.06;

  const weightedWinner: WinnerKey = compareBlock(weightedA, weightedB);

  // saferPlayer → lower total risk (invert)
  const saferWinner: WinnerKey = riskScore.winner;

  // higherUpside → higher projection + upside score
  const upsideA = average([playerAProfile.projection.growthIndex, playerAProfile.summary.upside.score]);
  const upsideB = average([playerBProfile.projection.growthIndex, playerBProfile.summary.upside.score]);
  const upsideWinner: WinnerKey = compareBlock(upsideA, upsideB);

  // bestTacticalFit → higher tactical overall + flexibility
  const fitA = average([playerAProfile.tactical.overall, playerAProfile.tactical.tacticalFlexibility, playerAProfile.tactical.roleDiscipline]);
  const fitB = average([playerBProfile.tactical.overall, playerBProfile.tactical.tacticalFlexibility, playerBProfile.tactical.roleDiscipline]);
  const tacticalFitWinner: WinnerKey = compareBlock(fitA, fitB);

  return {
    winnersByBlock,
    finalDecision: {
      betterPlayer: resolveFinalWinner(blockCountWinner, weightedWinner),
      saferPlayer: resolveFinalWinner(saferWinner, weightedWinner),
      higherUpside: resolveFinalWinner(upsideWinner, weightedWinner),
      bestTacticalFit: resolveFinalWinner(tacticalFitWinner, weightedWinner),
    },
    summaryInsights: buildSummaryInsights(playerAProfile, playerBProfile, scores),
  };
}

function buildAnalysisDescription(
  playerAProfile: PlayerIntelligenceProfile,
  playerBProfile: PlayerIntelligenceProfile,
  comparison: PlayerComparisonResult["comparison"],
): string {
  const resolve = (key: "A" | "B") =>
    key === "A" ? playerAProfile.identity.name : playerBProfile.identity.name;

  return [
    `${playerAProfile.identity.name} vs ${playerBProfile.identity.name}.`,
    `Better player: ${resolve(comparison.finalDecision.betterPlayer)}.`,
    `Safer player: ${resolve(comparison.finalDecision.saferPlayer)}.`,
    `Higher upside: ${resolve(comparison.finalDecision.higherUpside)}.`,
    `Best tactical fit: ${resolve(comparison.finalDecision.bestTacticalFit)}.`,
  ].join(" ");
}

async function persistComparisonAnalysis(result: PlayerComparisonResult): Promise<void> {
  const serialized = JSON.parse(JSON.stringify(result));
  if (!serialized) {
    throw new Error("Invalid payload: cannot be null");
  }
  const payload: Prisma.InputJsonValue = {
    type: "PLAYER_COMPARISON",
    ...serialized,
  };

  await prisma.analysis.create({
    data: {
      type: "PLAYER_COMPARISON",
      title: normalizeText(`${result.playerAProfile.identity.name} vs ${result.playerBProfile.identity.name}`),
      description: normalizeText(
        buildAnalysisDescription(result.playerAProfile, result.playerBProfile, result.comparison),
      ),
      analyst: normalizeText("SoccerMind Comparison Engine"),
      status: "COMPLETED",
      payload,
      comparisons: {
        create: [
          { playerId: result.playerAProfile.identity.id, order: 0 },
          { playerId: result.playerBProfile.identity.id, order: 1 },
        ],
      },
    },
  });
}

async function findPlayerByNameOrThrow(name: string): Promise<{ id: string }> {
  const exactMatch = await prisma.player.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });

  if (exactMatch) return exactMatch;

  const normalizedQuery = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();

  const players = await prisma.player.findMany({
    where: { name: { contains: name.trim(), mode: "insensitive" } },
    select: { id: true, name: true },
  });

  const fallback = players.find((p) => {
    const norm = p.name
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .trim();
    return norm === normalizedQuery;
  });

  if (!fallback) throw new Error(`Player not found by name: ${name}`);
  return fallback;
}

/**
 * Calcula a comparação entre dois jogadores — NÃO persiste no banco.
 * Para salvar, chame POST /analysis/comparison explicitamente (botão "Salvar análise").
 */
export async function comparePlayers(playerAId: string, playerBId: string): Promise<PlayerComparisonResult> {
  const [playerAProfile, playerBProfile] = await Promise.all([
    buildPlayerIntelligenceProfile(playerAId),
    buildPlayerIntelligenceProfile(playerBId),
  ]);

  return {
    playerAProfile,
    playerBProfile,
    comparison: buildComparison(playerAProfile, playerBProfile),
  };
}

export async function comparePlayersByName(playerAName: string, playerBName: string): Promise<PlayerComparisonResult> {
  const [playerA, playerB] = await Promise.all([
    findPlayerByNameOrThrow(playerAName),
    findPlayerByNameOrThrow(playerBName),
  ]);

  return comparePlayers(playerA.id, playerB.id);
}
