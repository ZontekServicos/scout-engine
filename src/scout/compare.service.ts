import { prisma } from "../lib/prisma";
import { compareAttributes, CompareResult } from "./compare.engine";
import { POSITION_WEIGHTS } from "./ranking.weights";
import { calculateRankingScore, Attributes } from "./ranking.engine";
import { calculateRiskScore } from "./risk.engine";
import { buildExecutiveRiskSummary } from "./risk.summary";
import { calculateAntiFlopIndex } from "./antiFlop.engine";
import { calculateLiquidityScore } from "./liquidity.engine";
import { calculateOverallRating } from "./overall.engine";
import { calculateFinancialRisk } from "./financial-risk.engine";
import { calculateCapitalEfficiency } from "./capital-efficiency.engine";
import { buildFifaAttributes } from "./skill-tree.builder";
import {
  calculateMedicalRisk,
  extractInjuryEventsFromAttributes,
  loadLesionMapFromPath,
} from "./injury-risk.engine";
import { getLeagueDifficultyCoefficient } from "./league-difficulty.engine";
import { calculateGrowthProjection } from "./growth-projection.engine";
import { buildExplainability } from "./explainability.service";
import { logger } from "../lib/logger";
import { getPrimaryPosition } from "../utils/positions";
import { buildPlayerSummary, persistAnalyticalSnapshots } from "./player.service";

//------------------Busca Segura----------------------------
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
export async function compareByNames(nameA: string, nameB: string) {
  const [playerA, playerB] = await Promise.all([
    findPlayerByNameOrThrow(nameA),
    findPlayerByNameOrThrow(nameB),
  ]);

  return compareByIds(playerA.id, playerB.id);
}

//---------------Atributos------------------------
function resolveFifaAttributes(attributes: any) {
  if (
    typeof attributes?.pace === "number" &&
    typeof attributes?.shooting === "number" &&
    typeof attributes?.passing === "number" &&
    typeof attributes?.dribbling === "number" &&
    typeof attributes?.defending === "number" &&
    typeof attributes?.physical === "number"
  ) {
    return {
      pace: attributes.pace,
      shooting: attributes.shooting,
      passing: attributes.passing,
      dribbling: attributes.dribbling,
      defending: attributes.defending,
      physical: attributes.physical,
    };
  }

  return buildFifaAttributes(attributes);
}

/**
 * Gera atributos principais realistas quando o jogador nÃƒÆ’Ã‚Â£o possui atributos FIFA detalhados.
 * A distribuiÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o usa o overall como base e aplica ajustes por posiÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o para evitar "todos iguais".
 */
function generateAttributesFromOverall(overall: number, position: string) {
  const base = Math.round(overall);

  // Garante limites consistentes para todas as engines consumidoras.
  const clamp = (value: number) => Math.max(40, Math.min(99, Math.round(value)));

  // Perfil de distribuiÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o por posiÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o (offsets relativos ao overall).
  const presets: Record<
    string,
    {
      pace: number;
      shooting: number;
      passing: number;
      dribbling: number;
      defending: number;
      physical: number;
    }
  > = {
    GK: { pace: -18, shooting: -20, passing: -8, dribbling: -12, defending: +4, physical: +2 },
    CB: { pace: -8, shooting: -14, passing: -6, dribbling: -8, defending: +4, physical: +3 },
    LB: { pace: +2, shooting: -8, passing: -2, dribbling: -1, defending: +1, physical: +2 },
    RB: { pace: +2, shooting: -8, passing: -2, dribbling: -1, defending: +1, physical: +2 },
    LWB: { pace: +3, shooting: -7, passing: -1, dribbling: +1, defending: 0, physical: +1 },
    RWB: { pace: +3, shooting: -7, passing: -1, dribbling: +1, defending: 0, physical: +1 },
    CDM: { pace: -5, shooting: -10, passing: -3, dribbling: -5, defending: +2, physical: +1 },
    CM: { pace: -2, shooting: -3, passing: +1, dribbling: 0, defending: -1, physical: 0 },
    CAM: { pace: -1, shooting: +1, passing: +2, dribbling: +2, defending: -7, physical: -3 },
    LM: { pace: +1, shooting: -2, passing: +1, dribbling: +1, defending: -4, physical: -1 },
    RM: { pace: +1, shooting: -2, passing: +1, dribbling: +1, defending: -4, physical: -1 },
    LW: { pace: +2, shooting: 0, passing: -2, dribbling: +2, defending: -9, physical: -2 },
    RW: { pace: +2, shooting: 0, passing: -2, dribbling: +2, defending: -9, physical: -2 },
    CF: { pace: 0, shooting: +1, passing: -1, dribbling: +1, defending: -8, physical: -2 },
    ST: { pace: -1, shooting: +2, passing: -4, dribbling: 0, defending: -10, physical: -2 },
  };

  const profile = presets[position] ?? presets.CM;

  return {
    pace: clamp(base + profile.pace),
    shooting: clamp(base + profile.shooting),
    passing: clamp(base + profile.passing),
    dribbling: clamp(base + profile.dribbling),
    defending: clamp(base + profile.defending),
    physical: clamp(base + profile.physical),
  };
}

function clampFifaCore(value: number) {
  return Math.max(40, Math.min(99, Math.round(value)));
}

/**
 * Resolve os atributos FIFA para o compare seguindo prioridade:

 */
function resolveFifaAttributesWithFallback(attributes: any, position: string) {
  const resolved = resolveFifaAttributes(attributes);

  // Se o adaptador devolveu valores vÃƒÆ’Ã‚Â¡lidos, usamos normalmente.
  const hasValidCore =
    typeof resolved?.pace === "number" &&
    typeof resolved?.shooting === "number" &&
    typeof resolved?.passing === "number" &&
    typeof resolved?.dribbling === "number" &&
    typeof resolved?.defending === "number" &&
    typeof resolved?.physical === "number" &&
    Number.isFinite(resolved.pace) &&
    Number.isFinite(resolved.shooting) &&
    Number.isFinite(resolved.passing) &&
    Number.isFinite(resolved.dribbling) &&
    Number.isFinite(resolved.defending) &&
    Number.isFinite(resolved.physical);

  if (hasValidCore) {
    const normalized = {
      pace: clampFifaCore(resolved.pace),
      shooting: clampFifaCore(resolved.shooting),
      passing: clampFifaCore(resolved.passing),
      dribbling: clampFifaCore(resolved.dribbling),
      defending: clampFifaCore(resolved.defending),
      physical: clampFifaCore(resolved.physical),
    };

    const overallFromAttributes = Number(attributes?.overall);

    const values = [
      normalized.pace,
      normalized.shooting,
      normalized.passing,
      normalized.dribbling,
      normalized.defending,
      normalized.physical,
    ];

    const uniqueValues = new Set(values);

    // Quando os seis atributos estao iguais, tratamos como dado achatado
    // e redistribuimos por posicao para evitar card irreal.
    if (uniqueValues.size === 1) {
      const fallbackOverall = Number.isFinite(overallFromAttributes)
        ? overallFromAttributes
        : normalized.pace;
      return generateAttributesFromOverall(fallbackOverall, position);
    }

    return normalized;
  }

  const overallFromAttributes = Number(attributes?.overall);
  if (Number.isFinite(overallFromAttributes) && overallFromAttributes > 0) {
    return generateAttributesFromOverall(overallFromAttributes, position);
  }

  return generateAttributesFromOverall(60, position);
}

function buildCategoryIndex(fifa: any) {
  return {
    attacking: fifa.shooting ?? 50,
    skill: fifa.dribbling ?? 50,
    movement: fifa.pace ?? 50,
    power: fifa.physical ?? 50,
    mentality: 60,
    defending: fifa.defending ?? 50,
  };
}

function buildFifaCard(player: any, overall: any, fifa: any) {
  const primaryPosition = getPrimaryPosition(player);
  return {
    player: {
      id: player.id,
      playerKey: player.id,
      name: player.name,
      nomeJogador: player.name,
      position: primaryPosition,
      age: player.age ?? null,
      nationality: player.nationality ?? null,
    },
    overall: overall.fifaStyle?.overall ?? overall.overall,
    tier: overall.tier,
    rank: overall.positionRank,
    core: overall.fifaStyle?.core ?? {
      pace: fifa.pace ?? 50,
      shooting: fifa.shooting ?? 50,
      passing: fifa.passing ?? 50,
      dribbling: fifa.dribbling ?? 50,
      defending: fifa.defending ?? 50,
      physical: fifa.physical ?? 50,
    },
    categories: overall.fifaStyle?.categories ?? null,
    detailedStats: overall.fifaStyle?.detailedStats ?? null,
  };
}

function resolvePlayerLeague(player: any): string {
  return (
    player?.league ??
    player?.attributes?.league ??
    player?.attributes?.clubLeague ??
    process.env.DEFAULT_LEAGUE ??
    "Brasileirao"
  );
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

export async function compareByIds(idA: string, idB: string) {
  const startedAt = Date.now();
  const [playerA, playerB] = await Promise.all([
    prisma.player.findUnique({
      where: { id: idA },
      include: {
        metricsSnapshots: {
          orderBy: { timestamp: "desc" },
          take: 1,
        },
        financialSnapshots: {
          orderBy: { timestamp: "desc" },
          take: 1,
        },
        riskSnapshots: {
          orderBy: { timestamp: "desc" },
          take: 1,
        },
      },
    }),
    prisma.player.findUnique({
      where: { id: idB },
      include: {
        metricsSnapshots: {
          orderBy: { timestamp: "desc" },
          take: 1,
        },
        financialSnapshots: {
          orderBy: { timestamp: "desc" },
          take: 1,
        },
        riskSnapshots: {
          orderBy: { timestamp: "desc" },
          take: 1,
        },
      },
    }),
  ]);

  if (!playerA || !playerB) {
    logger.warn("Compare aborted: player not found", { idA, idB });
    throw new Error("Player not found");
  }

  await Promise.all([
    persistAnalyticalSnapshots(playerA as any),
    persistAnalyticalSnapshots(playerB as any),
  ]);

  const [hydratedPlayerA, hydratedPlayerB] = await Promise.all([
    prisma.player.findUnique({
      where: { id: idA },
      include: {
        metricsSnapshots: {
          orderBy: { timestamp: "desc" },
          take: 1,
        },
        financialSnapshots: {
          orderBy: { timestamp: "desc" },
          take: 1,
        },
        riskSnapshots: {
          orderBy: { timestamp: "desc" },
          take: 1,
        },
      },
    }),
    prisma.player.findUnique({
      where: { id: idB },
      include: {
        metricsSnapshots: {
          orderBy: { timestamp: "desc" },
          take: 1,
        },
        financialSnapshots: {
          orderBy: { timestamp: "desc" },
          take: 1,
        },
        riskSnapshots: {
          orderBy: { timestamp: "desc" },
          take: 1,
        },
      },
    }),
  ]);

  if (!hydratedPlayerA || !hydratedPlayerB) {
    throw new Error("Player not found after snapshot hydration");
  }

  const positionA = getPrimaryPosition(hydratedPlayerA);
  const positionB = getPrimaryPosition(hydratedPlayerB);
  const positionContext = buildPositionContext(positionA, positionB);
  const summaryA = buildPlayerSummary(hydratedPlayerA as any);
  const summaryB = buildPlayerSummary(hydratedPlayerB as any);

  const weightsA = POSITION_WEIGHTS[positionA] ?? POSITION_WEIGHTS.CM;
  const weightsB = POSITION_WEIGHTS[positionB] ?? POSITION_WEIGHTS.CM;

  // ---------------- QUALITATIVE ----------------
  const qualitative: CompareResult = compareAttributes(
    hydratedPlayerA.attributes as Attributes,
    hydratedPlayerB.attributes as Attributes,
  );

  // ---------------- QUANTITATIVE ----------------
  const scoreA = calculateRankingScore(hydratedPlayerA.attributes as Attributes, weightsA);

  const scoreB = calculateRankingScore(hydratedPlayerB.attributes as Attributes, weightsB);

  const difference = Number(Math.abs(scoreA - scoreB).toFixed(2));
  const winner = scoreA > scoreB ? "A" : scoreB > scoreA ? "B" : "DRAW";
  const averagePositionScore = (scoreA + scoreB) / 2;

  // ---------------- FIFA + CATEGORY ----------------
  const fifaA = summaryA.fifa;
  const fifaB = summaryB.fifa;

  const categoryA = buildCategoryIndex(fifaA);
  const categoryB = buildCategoryIndex(fifaB);

  // ---------------- RISK ----------------
  const riskA = calculateRiskScore({
    age: hydratedPlayerA.age ?? 25,
    position: positionA,
    performanceScore: scoreA,
    averagePositionScore,
    categoryIndex: categoryA,
  });

  const riskB = calculateRiskScore({
    age: hydratedPlayerB.age ?? 25,
    position: positionB,
    performanceScore: scoreB,
    averagePositionScore,
    categoryIndex: categoryB,
  });

  const executiveSummaryA = buildExecutiveRiskSummary(hydratedPlayerA.name, riskA);
  const executiveSummaryB = buildExecutiveRiskSummary(hydratedPlayerB.name, riskB);

  // ---------------- MEDICAL RISK (LESION MAP) ----------------
  const lesionMap = loadLesionMapFromPath(process.env.LESION_MAP_PATH);

  const injuriesA = extractInjuryEventsFromAttributes(hydratedPlayerA.attributes);
  const injuriesB = extractInjuryEventsFromAttributes(hydratedPlayerB.attributes);

  const medicalRiskA = calculateMedicalRisk({
    injuries: injuriesA,
    lesionMap,
  });

  const medicalRiskB = calculateMedicalRisk({
    injuries: injuriesB,
    lesionMap,
  });

  // ---------------- ANTI FLOP ----------------
  const antiFlopA = calculateAntiFlopIndex({
    risk: riskA,
    age: hydratedPlayerA.age ?? 25,
    performanceScore: scoreA,
    averagePositionScore,
    medicalRisk: medicalRiskA,
    leagueDifficultyCoefficient: getLeagueDifficultyCoefficient(resolvePlayerLeague(hydratedPlayerA)),
  });

  const antiFlopB = calculateAntiFlopIndex({
    risk: riskB,
    age: hydratedPlayerB.age ?? 25,
    performanceScore: scoreB,
    averagePositionScore,
    medicalRisk: medicalRiskB,
    leagueDifficultyCoefficient: getLeagueDifficultyCoefficient(resolvePlayerLeague(hydratedPlayerB)),
  });

  // ---------------- LIQUIDITY ----------------
  const liquidityA = calculateLiquidityScore({
    age: hydratedPlayerA.age ?? 25,
    performanceScore: scoreA,
    averagePositionScore,
    risk: riskA,
    antiFlop: antiFlopA,
  });

  const liquidityB = calculateLiquidityScore({
    age: hydratedPlayerB.age ?? 25,
    performanceScore: scoreB,
    averagePositionScore,
    risk: riskB,
    antiFlop: antiFlopB,
  });

  // ---------------- OVERALL ----------------
  const overallA = summaryA.overall;
  const fifaCardA = buildFifaCard(hydratedPlayerA, overallA, fifaA);

  const overallB = summaryB.overall;
  const fifaCardB = buildFifaCard(hydratedPlayerB, overallB, fifaB);

  // ---------------- FINANCIAL RISK ----------------
  const financialRiskA = calculateFinancialRisk({
    structuralRisk: riskA.totalRisk,
    flopProbability: antiFlopA.flopProbability,
    liquidityScore: liquidityA.liquidityScore,
    age: hydratedPlayerA.age ?? 25,
    overall: overallA.overall,
  });

  const financialRiskB = calculateFinancialRisk({
    structuralRisk: riskB.totalRisk,
    flopProbability: antiFlopB.flopProbability,
    liquidityScore: liquidityB.liquidityScore,
    age: hydratedPlayerB.age ?? 25,
    overall: overallB.overall,
  });

  // ---------------- CAPITAL EFFICIENCY  ----------------
  const capitalEfficiencyA = calculateCapitalEfficiency({
    performanceScore: scoreA,
    flopProbability: antiFlopA.flopProbability,
    liquidityScore: liquidityA.liquidityScore,
    financialRiskIndex: financialRiskA.riskIndex,
  });

  const capitalEfficiencyB = calculateCapitalEfficiency({
    performanceScore: scoreB,
    flopProbability: antiFlopB.flopProbability,
    liquidityScore: liquidityB.liquidityScore,
    financialRiskIndex: financialRiskB.riskIndex,
  });

  const growthProjectionA = calculateGrowthProjection({
    age: hydratedPlayerA.age ?? 25,
    position: positionA,
    currentOverall: overallA.overall,
    performanceHistory: [scoreA],
    physicalLoad: Number((hydratedPlayerA.attributes as any)?.physicalLoad ?? 55),
    performanceStability: Number((hydratedPlayerA.attributes as any)?.stability ?? 60),
    leagueDifficultyCoefficient: getLeagueDifficultyCoefficient(resolvePlayerLeague(hydratedPlayerA)),
  });

  const growthProjectionB = calculateGrowthProjection({
    age: hydratedPlayerB.age ?? 25,
    position: positionB,
    currentOverall: overallB.overall,
    performanceHistory: [scoreB],
    physicalLoad: Number((hydratedPlayerB.attributes as any)?.physicalLoad ?? 55),
    performanceStability: Number((hydratedPlayerB.attributes as any)?.stability ?? 60),
    leagueDifficultyCoefficient: getLeagueDifficultyCoefficient(resolvePlayerLeague(hydratedPlayerB)),
  });

  const explainabilityA = buildExplainability({
    risk: riskA,
    antiFlop: antiFlopA,
    financialRisk: financialRiskA,
    growthProjection: growthProjectionA,
  });

  const explainabilityB = buildExplainability({
    risk: riskB,
    antiFlop: antiFlopB,
    financialRisk: financialRiskB,
    growthProjection: growthProjectionB,
  });
  const aiNarrative = `
${hydratedPlayerA.name} scored ${scoreA}.
${hydratedPlayerB.name} scored ${scoreB}.
Difference: ${difference}.
Winner: ${winner === "A" ? hydratedPlayerA.name : winner === "B" ? hydratedPlayerB.name : "Draw"}.
`.trim();

  logger.info("Compare completed", {
    idA,
    idB,
    durationMs: Date.now() - startedAt,
  });

  return {
    position: positionA,
    positionContext,
    players: {
      playerA: {
        id: hydratedPlayerA.id,
        playerKey: hydratedPlayerA.id,
        name: hydratedPlayerA.name,
        nomeJogador: hydratedPlayerA.name,
        position: positionA,
        age: hydratedPlayerA.age ?? null,
        nationality: hydratedPlayerA.nationality ?? null,
      },
      playerB: {
        id: hydratedPlayerB.id,
        playerKey: hydratedPlayerB.id,
        name: hydratedPlayerB.name,
        nomeJogador: hydratedPlayerB.name,
        position: positionB,
        age: hydratedPlayerB.age ?? null,
        nationality: hydratedPlayerB.nationality ?? null,
      },
    },
    summary: {
      playerA: summaryA.player,
      playerB: summaryB.player,
    },
    qualitative,
    quantitative: { scoreA, scoreB, difference, winner },
    overallRating: { playerA: overallA, playerB: overallB },
    fifaAttributes: { playerA: fifaA, playerB: fifaB },

    fifaCards: {
      playerA: fifaCardA,
      playerB: fifaCardB,
    },

    risk: {
      playerA: { ...riskA, executiveSummary: executiveSummaryA },
      playerB: { ...riskB, executiveSummary: executiveSummaryB },
    },
    antiFlop: { playerA: antiFlopA, playerB: antiFlopB },
    liquidity: { playerA: liquidityA, playerB: liquidityB },
    financialRisk: { playerA: financialRiskA, playerB: financialRiskB },
    riskProfile: {
      playerA: summaryA.player.risk,
      playerB: summaryB.player.risk,
    },
    capitalEfficiency: {
      playerA: capitalEfficiencyA,
      playerB: capitalEfficiencyB,
    },
    growthProjection: {
      playerA: growthProjectionA,
      playerB: growthProjectionB,
    },
    explainability: {
      playerA: explainabilityA,
      playerB: explainabilityB,
    },
    medicalRisk: { playerA: medicalRiskA, playerB: medicalRiskB },
    aiNarrative,
  };
}
