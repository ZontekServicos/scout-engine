import { prisma } from "../lib/prisma";
import { logger } from "../lib/logger";
import { compareAttributes, type CompareResult } from "./compare.engine";
import { type Attributes } from "./ranking.engine";
import { getPlayerProfile } from "./player.service";
import type { NormalizedPlayerIntelligenceProfile } from "./player-intelligence.service";
import {
  comparePlayers as comparePlayersWithIntelligenceProfile,
  comparePlayersByName as comparePlayersByNameWithIntelligenceProfile,
} from "../services/playerComparison.service";

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function normalizeWinner(valueA: number, valueB: number, inverse = false) {
  if (Math.abs(valueA - valueB) < 0.001) {
    return "DRAW" as const;
  }

  if (inverse) {
    return valueA < valueB ? "A" : "B";
  }

  return valueA > valueB ? "A" : "B";
}

async function findPlayerByNameOrThrow(name: string) {
  const player = await prisma.player.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
  });

  if (player) {
    return player;
  }

  const normalizedQuery = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();

  const allPlayers = await prisma.player.findMany({
    where: {
      name: {
        contains: name.trim(),
        mode: "insensitive",
      },
    },
  });

  const fallback = allPlayers.find((item) => {
    const normalizedName = item.name
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

const POSITION_GROUPS: Record<string, string> = {
  ST: "attack",
  CF: "attack",
  RW: "attack",
  LW: "attack",
  CAM: "midfield",
  CM: "midfield",
  CDM: "midfield",
  RB: "wide-defense",
  LB: "wide-defense",
  RWB: "wide-defense",
  LWB: "wide-defense",
  CB: "central-defense",
  GK: "goalkeeper",
};

function getPositionGroup(position: string) {
  return POSITION_GROUPS[position] ?? "hybrid";
}

function buildPositionContext(positionA: string, positionB: string) {
  const groupA = getPositionGroup(positionA);
  const groupB = getPositionGroup(positionB);

  if (positionA === positionB) {
    return {
      kind: "same",
      label: "Comparacao posicional direta",
      tone: "neutral",
      message: "Os dois jogadores ocupam a mesma posicao primaria, entao a leitura comparativa segue o contexto mais direto da plataforma.",
      positionA,
      positionB,
      groupA,
      groupB,
    };
  }

  if (groupA === groupB) {
    return {
      kind: "related",
      label: "Comparacao compativel",
      tone: "info",
      message: "As posicoes sao diferentes, mas pertencem ao mesmo grupo funcional. Compare considerando variacoes de corredor, altura media ou papel sem bola.",
      positionA,
      positionB,
      groupA,
      groupB,
    };
  }

  return {
    kind: "cross",
    label: "Comparacao cruzada",
    tone: "warning",
    message: "Comparacao entre funcoes diferentes. A leitura analitica continua valida, mas deve considerar contextos taticos e responsabilidades de jogo distintos.",
    positionA,
    positionB,
    groupA,
    groupB,
  };
}

function scoreTechnical(profile: NormalizedPlayerIntelligenceProfile) {
  const core = profile.technical.coreAttributes;
  return average([
    core.pace,
    core.shooting,
    core.passing,
    core.dribbling,
    core.defending,
    core.physical,
    profile.summary.overall,
  ]);
}

function scorePhysical(profile: NormalizedPlayerIntelligenceProfile) {
  return average([
    profile.physical.acceleration,
    profile.physical.sprintSpeed,
    profile.physical.stamina,
    profile.physical.strength,
    profile.physical.jumping,
    profile.physical.balance,
    profile.physical.agility,
  ]) - profile.physical.physicalRisk.score * 0.2;
}

function scoreMarket(profile: NormalizedPlayerIntelligenceProfile) {
  return (
    profile.market.valueScore * 0.4 +
    profile.market.liquidity.score * 0.3 +
    profile.projection.resalePotential.score * 0.2 -
    profile.market.financialRisk.score * 0.15 +
    profile.market.capitalEfficiency * 2.5
  );
}

function scoreRisk(profile: NormalizedPlayerIntelligenceProfile) {
  return (
    profile.risk.composite.score * 0.45 +
    profile.risk.financial.score * 0.2 +
    profile.risk.physical.score * 0.15 +
    profile.risk.tacticalAdaptation.score * 0.2
  );
}

function scoreUpside(profile: NormalizedPlayerIntelligenceProfile) {
  return (
    profile.projection.growthIndex * 0.45 +
    (profile.projection.expectedPeak - profile.projection.currentLevel) * 6 +
    profile.projection.resalePotential.score * 0.25
  );
}

function scoreTacticalDna(profile: NormalizedPlayerIntelligenceProfile) {
  const dnaAverage = average(profile.dna.traits.map((trait) => trait.value));
  return profile.tactical.tacticalMaturity.score * 0.45 + dnaAverage * 0.35 + profile.executiveSnapshot.tacticalFit.score * 0.2;
}

function getPlayerComparisonScore(profile: NormalizedPlayerIntelligenceProfile) {
  const technical = scoreTechnical(profile);
  const physical = scorePhysical(profile);
  const market = scoreMarket(profile);
  const risk = scoreRisk(profile);
  const upside = scoreUpside(profile);
  const tacticalDna = scoreTacticalDna(profile);

  return {
    technical,
    physical,
    market,
    risk,
    upside,
    tacticalDna,
    weighted:
      technical * 0.24 +
      physical * 0.12 +
      market * 0.18 +
      (100 - risk) * 0.16 +
      upside * 0.16 +
      tacticalDna * 0.14,
  };
}

function buildExplainability(profile: NormalizedPlayerIntelligenceProfile) {
  return {
    topFactors: [
      `${profile.summary.archetype} with ${profile.summary.idealSystem}`,
      `${profile.executiveSnapshot.value.label} value profile`,
      `${profile.projection.growthOutlook} trajectory`,
    ],
    positiveSignals: [
      `${profile.executiveSnapshot.liquidity.label} liquidity`,
      `${profile.executiveSnapshot.upside.label} upside`,
      `${profile.tactical.tacticalMaturity.label} tactical maturity`,
    ],
    riskDrivers: [
      profile.risk.composite.label,
      profile.risk.financial.label,
      profile.risk.tacticalAdaptation.label,
    ],
  };
}

function buildFifaCard(profile: any) {
  return {
    player: {
      id: profile.id,
      playerKey: profile.id,
      name: profile.name,
      nomeJogador: profile.name,
      position: profile.position,
      age: profile.age ?? null,
      nationality: profile.player?.nationality ?? null,
      team: profile.team ?? null,
      league: profile.league ?? null,
      marketValue: profile.marketValue ?? null,
    },
    overall: profile.overall ?? 0,
    potential: profile.potential ?? profile.overall ?? 0,
    tier: profile.tier,
    rank: profile.positionRank,
    core: profile.attributes,
    categories: null,
    detailedStats: profile.fifaStyle?.detailedStats ?? null,
  };
}

function buildSectionWinner(
  label: string,
  scoreA: number,
  scoreB: number,
  inverse = false,
) {
  return {
    label,
    playerA: Number(scoreA.toFixed(2)),
    playerB: Number(scoreB.toFixed(2)),
    winner: normalizeWinner(scoreA, scoreB, inverse),
  };
}

function buildExecutiveRecommendation(
  playerAProfile: NormalizedPlayerIntelligenceProfile,
  playerBProfile: NormalizedPlayerIntelligenceProfile,
) {
  const scoreA = getPlayerComparisonScore(playerAProfile);
  const scoreB = getPlayerComparisonScore(playerBProfile);

  const technical = buildSectionWinner("technical", scoreA.technical, scoreB.technical);
  const physical = buildSectionWinner("physical", scoreA.physical, scoreB.physical);
  const market = buildSectionWinner("market", scoreA.market, scoreB.market);
  const risk = buildSectionWinner("risk", scoreA.risk, scoreB.risk, true);
  const upside = buildSectionWinner("upside", scoreA.upside, scoreB.upside);
  const tacticalDna = buildSectionWinner("tacticalDna", scoreA.tacticalDna, scoreB.tacticalDna);
  const finalWinner = normalizeWinner(scoreA.weighted, scoreB.weighted);

  const sportingImpactWinner = normalizeWinner(
    playerAProfile.summary.currentLevel + technical.playerA,
    playerBProfile.summary.currentLevel + technical.playerB,
  );
  const tacticalFitWinner = normalizeWinner(
    playerAProfile.executiveSnapshot.tacticalFit.score,
    playerBProfile.executiveSnapshot.tacticalFit.score,
  );
  const marketEfficiencyWinner = normalizeWinner(market.playerA, market.playerB);
  const resaleWinner = normalizeWinner(
    playerAProfile.projection.resalePotential.score,
    playerBProfile.projection.resalePotential.score,
  );

  return {
    winner: finalWinner,
    blockWinners: {
      technical,
      physical,
      market,
      risk,
      upside,
      tacticalDna,
    },
    weightedScores: {
      playerA: Number(scoreA.weighted.toFixed(2)),
      playerB: Number(scoreB.weighted.toFixed(2)),
    },
    sportingImpact: sportingImpactWinner,
    tacticalFit: tacticalFitWinner,
    risk: risk.winner,
    marketEfficiency: marketEfficiencyWinner,
    upside: upside.winner,
    resaleLiquidity: resaleWinner,
    summary:
      finalWinner === "A"
        ? `${playerAProfile.identity.name} emerges as the stronger recommendation when sporting impact, tactical fit, risk balance and market efficiency are weighted together.`
        : finalWinner === "B"
          ? `${playerBProfile.identity.name} emerges as the stronger recommendation when sporting impact, tactical fit, risk balance and market efficiency are weighted together.`
          : "The final recommendation remains balanced, with no decisive edge once sporting, tactical and market blocks are weighted together.",
  };
}

export async function compareByNames(nameA: string, nameB: string) {
  return comparePlayersByNameWithIntelligenceProfile(nameA, nameB);
}

export async function compareByIds(idA: string, idB: string) {
  return comparePlayersWithIntelligenceProfile(idA, idB);
}

export async function compareByIdsLegacy(idA: string, idB: string) {
  const startedAt = Date.now();
  const [playerAProfile, playerBProfile] = await Promise.all([
    getPlayerProfile(idA),
    getPlayerProfile(idB),
  ]);

  const intelligenceA = playerAProfile.intelligenceProfile as NormalizedPlayerIntelligenceProfile;
  const intelligenceB = playerBProfile.intelligenceProfile as NormalizedPlayerIntelligenceProfile;

  const qualitative: CompareResult = compareAttributes(
    playerAProfile.attributes as Attributes,
    playerBProfile.attributes as Attributes,
  );

  const technicalA = scoreTechnical(intelligenceA);
  const technicalB = scoreTechnical(intelligenceB);
  const difference = Number(Math.abs(technicalA - technicalB).toFixed(2));
  const executiveRecommendation = buildExecutiveRecommendation(intelligenceA, intelligenceB);
  const winner = executiveRecommendation.winner;
  const positionContext = buildPositionContext(
    intelligenceA.identity.dominantPosition ?? playerAProfile.position ?? "N/A",
    intelligenceB.identity.dominantPosition ?? playerBProfile.position ?? "N/A",
  );

  const aiNarrative = [
    `${playerAProfile.name} enters the comparison with overall ${playerAProfile.overall}, expected peak ${intelligenceA.projection.expectedPeak} and ${intelligenceA.executiveSnapshot.liquidity.label.toLowerCase()} liquidity.`,
    `${playerBProfile.name} answers with overall ${playerBProfile.overall}, expected peak ${intelligenceB.projection.expectedPeak} and ${intelligenceB.executiveSnapshot.liquidity.label.toLowerCase()} liquidity.`,
    executiveRecommendation.summary,
  ].join(" ");

  logger.info("Compare completed", {
    idA,
    idB,
    durationMs: Date.now() - startedAt,
  });

  return {
    position: playerAProfile.position,
    positionContext,
    winner,
    playerA: playerAProfile,
    playerB: playerBProfile,
    playerProfiles: {
      playerA: playerAProfile,
      playerB: playerBProfile,
    },
    intelligenceProfiles: {
      playerA: intelligenceA,
      playerB: intelligenceB,
    },
    players: {
      playerA: {
        id: playerAProfile.id,
        playerKey: playerAProfile.id,
        name: playerAProfile.name,
        nomeJogador: playerAProfile.name,
        position: playerAProfile.position,
        age: playerAProfile.age ?? null,
        nationality: playerAProfile.player?.nationality ?? null,
      },
      playerB: {
        id: playerBProfile.id,
        playerKey: playerBProfile.id,
        name: playerBProfile.name,
        nomeJogador: playerBProfile.name,
        position: playerBProfile.position,
        age: playerBProfile.age ?? null,
        nationality: playerBProfile.player?.nationality ?? null,
      },
    },
    summary: {
      playerA: {
        ...playerAProfile.player,
        recommendation: intelligenceA.executiveSnapshot.recommendation,
        confidence: intelligenceA.executiveSnapshot.confidence,
        valueScore: intelligenceA.summary.valueScore,
        intelligenceProfile: intelligenceA,
      },
      playerB: {
        ...playerBProfile.player,
        recommendation: intelligenceB.executiveSnapshot.recommendation,
        confidence: intelligenceB.executiveSnapshot.confidence,
        valueScore: intelligenceB.summary.valueScore,
        intelligenceProfile: intelligenceB,
      },
    },
    qualitative,
    quantitative: {
      scoreA: Number(technicalA.toFixed(2)),
      scoreB: Number(technicalB.toFixed(2)),
      difference,
      winner,
    },
    overallRating: {
      playerA: {
        overall: playerAProfile.overall,
        potential: playerAProfile.potential,
        tier: playerAProfile.tier,
        positionRank: playerAProfile.positionRank,
      },
      playerB: {
        overall: playerBProfile.overall,
        potential: playerBProfile.potential,
        tier: playerBProfile.tier,
        positionRank: playerBProfile.positionRank,
      },
    },
    fifaAttributes: {
      playerA: playerAProfile.attributes,
      playerB: playerBProfile.attributes,
    },
    fifaCards: {
      playerA: buildFifaCard(playerAProfile),
      playerB: buildFifaCard(playerBProfile),
    },
    risk: {
      playerA: {
        totalRisk: Number((intelligenceA.risk.composite.score / 10).toFixed(2)),
        executiveSummary: intelligenceA.risk.composite.summary,
        riskLevel: playerAProfile.risk.level,
      },
      playerB: {
        totalRisk: Number((intelligenceB.risk.composite.score / 10).toFixed(2)),
        executiveSummary: intelligenceB.risk.composite.summary,
        riskLevel: playerBProfile.risk.level,
      },
    },
    antiFlop: {
      playerA: playerAProfile.player.antiFlopIndex,
      playerB: playerBProfile.player.antiFlopIndex,
    },
    liquidity: {
      playerA: {
        liquidityScore: intelligenceA.market.liquidity.score,
        resaleWindow: playerAProfile.player.liquidity.resaleWindow,
        marketProfile: playerAProfile.player.liquidity.marketProfile,
      },
      playerB: {
        liquidityScore: intelligenceB.market.liquidity.score,
        resaleWindow: playerBProfile.player.liquidity.resaleWindow,
        marketProfile: playerBProfile.player.liquidity.marketProfile,
      },
    },
    financialRisk: {
      playerA: {
        riskIndex: intelligenceA.market.financialRisk.score,
        capitalExposure: playerAProfile.player.financialRisk.capitalExposure,
        investmentProfile: playerAProfile.player.financialRisk.investmentProfile,
      },
      playerB: {
        riskIndex: intelligenceB.market.financialRisk.score,
        capitalExposure: playerBProfile.player.financialRisk.capitalExposure,
        investmentProfile: playerBProfile.player.financialRisk.investmentProfile,
      },
    },
    riskProfile: {
      playerA: playerAProfile.player.risk,
      playerB: playerBProfile.player.risk,
    },
    capitalEfficiency: {
      playerA: { index: intelligenceA.market.capitalEfficiency },
      playerB: { index: intelligenceB.market.capitalEfficiency },
    },
    growthProjection: {
      playerA: playerAProfile.projection,
      playerB: playerBProfile.projection,
    },
    explainability: {
      playerA: buildExplainability(intelligenceA),
      playerB: buildExplainability(intelligenceB),
    },
    medicalRisk: {
      playerA: { riskIndex: intelligenceA.risk.medical.score, summary: intelligenceA.risk.medical.summary },
      playerB: { riskIndex: intelligenceB.risk.medical.score, summary: intelligenceB.risk.medical.summary },
    },
    blockWinners: executiveRecommendation.blockWinners,
    executiveRecommendation,
    comparison: {
      playerA: intelligenceA,
      playerB: intelligenceB,
      blockWinners: executiveRecommendation.blockWinners,
      executiveRecommendation,
    },
    aiNarrative,
  };
}
