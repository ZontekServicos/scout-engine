import { prisma } from "../../lib/prisma";
import {
  buildPlayerSummary,
  PLAYER_SNAPSHOT_INCLUDE,
  type PlayerSummarySource,
} from "../../scout/player.service";
import type {
  ContextBlock,
  FieldEventPoint,
  FieldIntelligence,
  FieldZoneIntensity,
  MarketBlock,
  NarrativeBlock,
  PhysicalBlock,
  PlayerIdentity,
  PlayerIntelligenceDna,
  PlayerIntelligenceProfile,
  PlayerIntelligenceSummary,
  ProjectionBlock,
  RiskBlock,
  ScoreBand,
  TacticalBlock,
  TechnicalBlock,
} from "./types";

type JsonRecord = Record<string, unknown>;
type AnalysisWithContext = Awaited<ReturnType<typeof fetchLatestAnalysisForPlayer>>;
type DetailedBreakdown = Record<string, number | null | undefined>;

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function average(values: Array<number | null | undefined>, fallback = 0) {
  const valid = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (valid.length === 0) {
    return fallback;
  }

  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

function toNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function createSeededRandom(seedInput: string) {
  let seed = 0;

  for (let index = 0; index < seedInput.length; index += 1) {
    seed = (seed * 31 + seedInput.charCodeAt(index)) >>> 0;
  }

  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function buildBand(score: number, label: string, summary: string): ScoreBand {
  return {
    score: clamp(score),
    label,
    summary,
  };
}

function getPrimaryPosition(positions: string[]) {
  return positions[0] ?? "CM";
}

function resolvePositionFamily(position: string) {
  const normalized = position.toUpperCase();

  if (["ST", "CF", "LW", "RW", "LF", "RF"].includes(normalized)) return "attack";
  if (["CAM", "CM", "CDM", "LM", "RM"].includes(normalized)) return "midfield";
  if (["LB", "RB", "CB", "LWB", "RWB"].includes(normalized)) return "defense";
  return "goalkeeper";
}

function buildMockIdentity(playerId: string): PlayerIdentity {
  return {
    id: playerId,
    slug: null,
    name: "Unknown Player",
    age: null,
    nationality: null,
    club: null,
    league: null,
    primaryPosition: "CM",
    secondaryPositions: [],
    preferredFoot: null,
    heightCm: null,
    weightKg: null,
    imagePath: null,
  };
}

async function fetchPlayerRecord(playerId: string) {
  return prisma.player.findUnique({
    where: { id: playerId },
    include: PLAYER_SNAPSHOT_INCLUDE,
  });
}

async function fetchLatestAnalysisForPlayer(playerId: string) {
  return prisma.analysis.findFirst({
    where: {
      comparisons: {
        some: {
          playerId,
        },
      },
    },
    orderBy: [{ createdAt: "desc" }],
    include: {
      comparisons: {
        orderBy: { order: "asc" },
        include: {
          player: true,
        },
      },
    },
  });
}

function buildIdentity(player: Awaited<ReturnType<typeof fetchPlayerRecord>>): PlayerIdentity {
  if (!player) {
    return buildMockIdentity("unknown");
  }

  const attributes = asRecord(player.attributes) ?? {};
  const meta = asRecord(attributes.meta) ?? {};

  return {
    id: player.id,
    slug: player.slug,
    name: player.name,
    age: player.age ?? null,
    nationality: player.nationality ?? null,
    club: player.team ?? null,
    league: player.league ?? null,
    primaryPosition: getPrimaryPosition(player.positions ?? []),
    secondaryPositions: (player.positions ?? []).slice(1),
    preferredFoot: typeof meta.preferredFoot === "string" ? meta.preferredFoot : null,
    heightCm: typeof meta.heightCm === "number" ? meta.heightCm : null,
    weightKg: typeof meta.weightKg === "number" ? meta.weightKg : null,
    imagePath: player.imagePath ?? null,
  };
}

function getBreakdown(summary: ReturnType<typeof buildPlayerSummary> | null): DetailedBreakdown {
  return (summary?.detailedStats ?? {}) as DetailedBreakdown;
}

function buildTechnicalBlock(summary: ReturnType<typeof buildPlayerSummary> | null): TechnicalBlock {
  const breakdown = getBreakdown(summary);

  return {
    overall: clamp(
      average([
        summary?.fifa.passing,
        summary?.fifa.dribbling,
        summary?.fifa.shooting,
        summary?.fifa.defending,
      ], 55),
    ),
    ballStriking: clamp(average([breakdown.finishing, breakdown.longShots, breakdown.shotPower], summary?.fifa.shooting ?? 55)),
    passing: clamp(average([summary?.fifa.passing, breakdown.shortPassing, breakdown.longPassing, breakdown.vision], 55)),
    carrying: clamp(average([summary?.fifa.dribbling, breakdown.dribbling, breakdown.acceleration, breakdown.agility], 55)),
    firstTouch: clamp(average([breakdown.ballControl, breakdown.composure, breakdown.shortPassing], 55)),
    creativity: clamp(average([breakdown.vision, breakdown.curve, breakdown.longPassing, summary?.fifa.passing], 55)),
    defending: clamp(average([summary?.fifa.defending, breakdown.interceptions, breakdown.standingTackle], 55)),
    breakdown: Object.fromEntries(
      Object.entries(breakdown).map(([key, value]) => [key, clamp(toNumber(value, 0))]),
    ),
  };
}

function buildPhysicalBlock(summary: ReturnType<typeof buildPlayerSummary> | null): PhysicalBlock {
  const breakdown = getBreakdown(summary);

  return {
    overall: clamp(
      average([
        summary?.fifa.physical,
        breakdown.acceleration,
        breakdown.sprintSpeed,
        breakdown.stamina,
        breakdown.strength,
      ], 55),
    ),
    acceleration: clamp(toNumber(breakdown.acceleration, 55)),
    sprintSpeed: clamp(toNumber(breakdown.sprintSpeed, 55)),
    agility: clamp(toNumber(breakdown.agility, 55)),
    balance: clamp(toNumber(breakdown.balance, 55)),
    strength: clamp(toNumber(breakdown.strength, 55)),
    stamina: clamp(toNumber(breakdown.stamina, 55)),
    aerial: clamp(average([breakdown.jumping, breakdown.headingAccuracy, breakdown.strength], 55)),
  };
}

function buildTacticalBlock(summary: ReturnType<typeof buildPlayerSummary> | null, identity: PlayerIdentity): TacticalBlock {
  const breakdown = getBreakdown(summary);
  const family = resolvePositionFamily(identity.primaryPosition ?? "CM");
  const bestRole =
    family === "attack"
      ? "Vertical attacker"
      : family === "midfield"
        ? "Two-way controller"
        : family === "defense"
          ? "Rest-defense anchor"
          : "Sweeper keeper";
  const bestSystem =
    family === "attack"
      ? "4-3-3"
      : family === "midfield"
        ? "4-2-3-1"
        : family === "defense"
          ? "3-4-3"
          : "4-1-4-1";

  return {
    overall: clamp(
      average([
        breakdown.vision,
        breakdown.composure,
        breakdown.interceptions,
        breakdown.attackPosition,
        breakdown.defensiveAwareness,
      ], 55),
    ),
    positioning: clamp(toNumber(breakdown.attackPosition, 55)),
    decisionMaking: clamp(average([breakdown.composure, breakdown.vision, breakdown.reactions], 55)),
    defensiveAwareness: clamp(toNumber(breakdown.defensiveAwareness, summary?.fifa.defending ?? 55)),
    transitionImpact: clamp(average([summary?.fifa.pace, summary?.fifa.passing, summary?.fifa.dribbling], 55)),
    tacticalFlexibility: clamp(average([breakdown.vision, breakdown.shortPassing, breakdown.interceptions], 55)),
    roleDiscipline: clamp(average([breakdown.composure, breakdown.defensiveAwareness, breakdown.attackPosition], 55)),
    bestRole,
    bestSystem,
  };
}

function buildMarketBlock(summary: ReturnType<typeof buildPlayerSummary> | null, player: Awaited<ReturnType<typeof fetchPlayerRecord>>): MarketBlock {
  const marketValue = player?.marketValue ?? summary?.player.marketValue ?? null;
  const liquidityScore = toNumber(summary?.player.liquidity?.score, 56);
  const transferMultiplier = liquidityScore >= 75 ? 1.18 : liquidityScore >= 60 ? 1.1 : 1.03;
  const estimatedTransferValue = marketValue ? Math.round(marketValue * transferMultiplier) : null;
  const salaryEstimateAnnual = marketValue ? Math.round(marketValue * 0.08) : null;
  const contractPressureScore = player?.contractEnd
    ? clamp(100 - Math.max(0, Math.round((player.contractEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30))) * 4)
    : 50;

  return {
    currentValue: marketValue,
    estimatedTransferValue,
    salaryEstimateAnnual,
    liquidity: buildBand(
      liquidityScore,
      liquidityScore >= 75 ? "high_liquidity" : liquidityScore >= 60 ? "healthy_liquidity" : "limited_liquidity",
      "Estimated portability across target markets and resale scenarios.",
    ),
    valueRetention: buildBand(
      clamp(average([liquidityScore, summary?.potential, 100 - toNumber(summary?.player.risk?.score, 50)], 56)),
      "value_retention",
      "Expected ability to preserve market value after acquisition.",
    ),
    contractPressure: buildBand(
      contractPressureScore,
      contractPressureScore >= 70 ? "buy_window_opening" : contractPressureScore >= 45 ? "stable_contract" : "seller_control",
      "Contract timing pressure inferred from available contract metadata.",
    ),
  };
}

function buildRiskBlock(
  summary: ReturnType<typeof buildPlayerSummary> | null,
  physical: PhysicalBlock,
  tactical: TacticalBlock,
  market: MarketBlock,
): RiskBlock {
  const composite = toNumber(summary?.player.risk?.score, 50);
  const physicalRiskScore = clamp(100 - average([physical.stamina, physical.strength, physical.balance], 55) + 25);
  const tacticalRiskScore = clamp(100 - average([tactical.decisionMaking, tactical.roleDiscipline], 55) + 20);
  const financialRiskScore = clamp(100 - market.liquidity.score + 25);
  const volatilityScore = clamp(average([composite, tacticalRiskScore, financialRiskScore], 50));
  const availabilityScore = clamp(average([physicalRiskScore, composite], 50));

  return {
    overall: buildBand(
      composite,
      composite >= 70 ? "high_risk" : composite >= 50 ? "managed_risk" : "controlled_risk",
      summary?.player.risk?.explanation ?? "Composite risk inferred from analytical snapshots.",
    ),
    physical: buildBand(physicalRiskScore, "physical_risk", "Load tolerance and physical continuity proxy."),
    tactical: buildBand(tacticalRiskScore, "tactical_risk", "Adaptation and role-context exposure."),
    financial: buildBand(financialRiskScore, "financial_risk", "Entry-price and resale sensitivity."),
    availability: buildBand(availabilityScore, "availability_risk", "Likelihood of continuity loss over the next cycle."),
    volatility: buildBand(volatilityScore, "volatility_risk", "Expected variance in output versus valuation."),
  };
}

function buildProjectionBlock(
  summary: ReturnType<typeof buildPlayerSummary> | null,
  identity: PlayerIdentity,
  risk: RiskBlock,
): ProjectionBlock {
  const currentOverall = clamp(summary?.overall.overall ?? 58);
  const potential = clamp(summary?.potential ?? Math.min(99, currentOverall + 6));
  const age = identity.age ?? 23;
  const ageBoost = age <= 20 ? 7 : age <= 23 ? 5 : age <= 26 ? 3 : 1;
  const nextSeasonOverall = clamp(Math.min(potential, currentOverall + Math.max(1, Math.round(ageBoost / 2))));
  const growthIndex = clamp((potential - currentOverall) * 10 + (100 - risk.overall.score) * 0.25);
  const curve: ProjectionBlock["developmentCurve"] =
    growthIndex >= 75 ? "accelerating" : growthIndex >= 50 ? "steady" : "plateau";

  return {
    currentOverall,
    nextSeasonOverall,
    expectedPeakOverall: potential,
    growthIndex,
    ceilingLabel: potential >= 85 ? "elite_ceiling" : potential >= 78 ? "starter_ceiling" : "rotation_ceiling",
    developmentCurve: curve,
    resaleOutlook: buildBand(
      clamp(average([growthIndex, 100 - risk.financial.score], 55)),
      "resale_outlook",
      "Expected future optionality if development path holds.",
    ),
  };
}

function buildDna(
  technical: TechnicalBlock,
  physical: PhysicalBlock,
  tactical: TacticalBlock,
  identity: PlayerIdentity,
): PlayerIntelligenceDna {
  const traits = [
    {
      key: "progression",
      label: "Progression",
      value: clamp(average([technical.passing, technical.carrying, tactical.transitionImpact], 55)),
      interpretation: "Moves play toward high-value zones with ball or pass.",
    },
    {
      key: "duel_power",
      label: "Duel Power",
      value: clamp(average([physical.strength, physical.balance, technical.defending], 55)),
      interpretation: "Handles physical and contested moments consistently.",
    },
    {
      key: "game_intelligence",
      label: "Game Intelligence",
      value: clamp(average([tactical.decisionMaking, tactical.positioning, tactical.roleDiscipline], 55)),
      interpretation: "Reads phases early and executes within structure.",
    },
    {
      key: "explosiveness",
      label: "Explosiveness",
      value: clamp(average([physical.acceleration, physical.sprintSpeed, technical.ballStriking], 55)),
      interpretation: "Creates separation and immediate action threat.",
    },
    {
      key: "final_third_impact",
      label: "Final Third Impact",
      value: clamp(average([technical.ballStriking, technical.creativity, tactical.positioning], 55)),
      interpretation: "Influences decisive actions close to goal.",
    },
  ];

  const dominantTraits = traits
    .slice()
    .sort((left, right) => right.value - left.value)
    .slice(0, 3)
    .map((trait) => trait.label);

  return {
    archetype:
      resolvePositionFamily(identity.primaryPosition ?? "CM") === "attack"
        ? "Decisive vertical profile"
        : resolvePositionFamily(identity.primaryPosition ?? "CM") === "midfield"
          ? "Control-progressor hybrid"
          : resolvePositionFamily(identity.primaryPosition ?? "CM") === "defense"
            ? "Competitive stabilizer"
            : "Area controller",
    profileLabel: `${(identity.primaryPosition ?? "CM").toLowerCase()}-intelligence-profile`,
    dominantTraits,
    traits,
  };
}

function buildHeatmap(position: string, random: () => number): FieldZoneIntensity[] {
  const family = resolvePositionFamily(position);
  const zones: FieldZoneIntensity[] = [];

  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 6; column += 1) {
      const forwardBias = family === "attack" ? column * 7 : family === "midfield" ? 20 + Math.abs(2 - column) * 2 : 28 - column * 5;
      const verticalBias = row === 1 || row === 2 ? 10 : 2;

      zones.push({
        x: column * (100 / 6),
        y: row * 25,
        width: 100 / 6,
        height: 25,
        intensity: clamp(forwardBias + verticalBias + random() * 22, 10, 100),
      });
    }
  }

  return zones;
}

function buildPasses(position: string, passing: number, random: () => number): FieldEventPoint[] {
  const family = resolvePositionFamily(position);
  const count = family === "midfield" ? 14 : family === "attack" ? 10 : 12;

  return Array.from({ length: count }, (_, index) => {
    const startX = family === "defense" ? 18 + random() * 20 : family === "midfield" ? 26 + random() * 28 : 40 + random() * 24;
    const endX = Math.min(96, startX + 8 + random() * (passing >= 70 ? 34 : 24));
    const startY = 12 + random() * 76;
    const endY = Math.max(4, Math.min(96, startY + (random() - 0.5) * 30));

    return {
      x: startX,
      y: startY,
      endX,
      endY,
      outcome: random() > 0.16 ? "success" : "fail",
      value: Number((0.08 + random() * 0.32).toFixed(2)),
      label: `Pass ${index + 1}`,
    };
  });
}

function buildShots(position: string, finishing: number, random: () => number): FieldEventPoint[] {
  const family = resolvePositionFamily(position);
  const count = family === "attack" ? 11 : family === "midfield" ? 8 : 5;

  return Array.from({ length: count }, (_, index) => {
    const xBase = family === "attack" ? 74 : family === "midfield" ? 62 : 48;
    const x = Math.min(98, Math.max(42, xBase + (random() - 0.3) * 20));
    const y = Math.min(92, Math.max(8, 18 + random() * 64));
    const chance = Math.min(0.68, Math.max(0.04, 0.06 + finishing / 180 + random() * 0.18));
    const outcomeRoll = random();

    return {
      x,
      y,
      outcome: outcomeRoll > 0.87 ? "goal" : outcomeRoll > 0.52 ? "saved" : "blocked",
      value: Number(chance.toFixed(2)),
      label: `Shot ${index + 1}`,
    };
  });
}

function buildDefensiveActions(position: string, defending: number, random: () => number): FieldEventPoint[] {
  const family = resolvePositionFamily(position);
  const count = family === "defense" ? 13 : family === "midfield" ? 10 : 6;

  return Array.from({ length: count }, (_, index) => ({
    x: Math.min(92, Math.max(8, (family === "defense" ? 32 : family === "midfield" ? 44 : 58) + (random() - 0.5) * 28)),
    y: Math.min(94, Math.max(6, 8 + random() * 82)),
    outcome: random() > Math.max(0.12, 0.36 - defending / 300) ? "won" : "lost",
    value: Number((0.05 + random() * 0.2).toFixed(2)),
    label: `Def Action ${index + 1}`,
  }));
}

function extractFieldIntelligenceFromAnalysis(analysis: AnalysisWithContext): FieldIntelligence | null {
  const payloadRecord = asRecord(analysis?.payload);
  const comparisonData = asRecord(payloadRecord?.comparison);
  const fieldNode =
    asRecord(payloadRecord?.fieldIntelligence) ??
    asRecord(comparisonData?.fieldIntelligence);

  const heatmap = Array.isArray(fieldNode?.heatmap) ? fieldNode?.heatmap : null;
  const passes = Array.isArray(fieldNode?.passes) ? fieldNode?.passes : null;
  const shots = Array.isArray(fieldNode?.shots) ? fieldNode?.shots : null;
  const defensiveActions = Array.isArray(fieldNode?.defensiveActions) ? fieldNode?.defensiveActions : null;

  if (!heatmap || !passes || !shots || !defensiveActions) {
    return null;
  }

  return {
    isMocked: false,
    heatmap: heatmap.map((zone) => {
      const record = asRecord(zone) ?? {};
      return {
        x: toNumber(record.x, 0),
        y: toNumber(record.y, 0),
        width: toNumber(record.width, 0),
        height: toNumber(record.height, 0),
        intensity: clamp(toNumber(record.intensity, 0)),
      };
    }),
    passes: passes.map((event) => {
      const record = asRecord(event) ?? {};
      return {
        x: toNumber(record.x, 0),
        y: toNumber(record.y, 0),
        endX: typeof record.endX === "number" ? record.endX : undefined,
        endY: typeof record.endY === "number" ? record.endY : undefined,
        outcome: typeof record.outcome === "string" ? (record.outcome as FieldEventPoint["outcome"]) : undefined,
        value: typeof record.value === "number" ? record.value : undefined,
        label: typeof record.label === "string" ? record.label : undefined,
      };
    }),
    shots: shots.map((event) => {
      const record = asRecord(event) ?? {};
      return {
        x: toNumber(record.x, 0),
        y: toNumber(record.y, 0),
        outcome: typeof record.outcome === "string" ? (record.outcome as FieldEventPoint["outcome"]) : undefined,
        value: typeof record.value === "number" ? record.value : undefined,
        label: typeof record.label === "string" ? record.label : undefined,
      };
    }),
    defensiveActions: defensiveActions.map((event) => {
      const record = asRecord(event) ?? {};
      return {
        x: toNumber(record.x, 0),
        y: toNumber(record.y, 0),
        outcome: typeof record.outcome === "string" ? (record.outcome as FieldEventPoint["outcome"]) : undefined,
        value: typeof record.value === "number" ? record.value : undefined,
        label: typeof record.label === "string" ? record.label : undefined,
      };
    }),
  };
}

function buildMockFieldIntelligence(
  playerId: string,
  identity: PlayerIdentity,
  technical: TechnicalBlock,
): FieldIntelligence {
  const random = createSeededRandom(`${playerId}:${identity.primaryPosition ?? "CM"}:${identity.name}`);
  const position = identity.primaryPosition ?? "CM";

  return {
    isMocked: true,
    heatmap: buildHeatmap(position, random),
    passes: buildPasses(position, technical.passing, random),
    shots: buildShots(position, technical.ballStriking, random),
    defensiveActions: buildDefensiveActions(position, technical.defending, random),
  };
}

function buildSummary(
  identity: PlayerIdentity,
  projection: ProjectionBlock,
  market: MarketBlock,
  risk: RiskBlock,
): PlayerIntelligenceSummary {
  const confidence = clamp(
    average([
      projection.growthIndex,
      market.liquidity.score,
      100 - risk.overall.score,
      projection.currentOverall,
    ], 56),
  );
  const status: PlayerIntelligenceSummary["status"] =
    projection.expectedPeakOverall >= 84 && risk.overall.score <= 45
      ? "elite_target"
      : projection.growthIndex >= 60 && risk.overall.score <= 60
        ? "priority_watch"
        : confidence < 45
          ? "data_gap"
          : "monitor";

  const recommendation =
    status === "elite_target"
      ? `Accelerate acquisition work for ${identity.name}.`
      : status === "priority_watch"
        ? `Keep ${identity.name} in the priority pipeline with price discipline.`
        : status === "data_gap"
          ? "Preserve monitoring until data confidence improves."
          : `Track ${identity.name} as a controlled market opportunity.`;

  return {
    status,
    recommendation,
    confidence,
    summary: `${identity.name} projects to ${projection.expectedPeakOverall} overall with ${risk.overall.label} exposure and ${market.liquidity.label} market liquidity.`,
    decisionWindow:
      market.contractPressure.score >= 70
        ? "next_window"
        : projection.growthIndex >= 65
          ? "pre_breakout"
          : "opportunistic",
    currentLevel: buildBand(projection.currentOverall, "current_level", "Current performance baseline."),
    upside: buildBand(projection.growthIndex, "upside", "Headroom between current impact and modeled ceiling."),
    risk: risk.overall,
    marketOpportunity: buildBand(
      clamp(average([market.liquidity.score, 100 - market.contractPressure.score, 100 - risk.financial.score], 55)),
      "market_opportunity",
      "Balance between timing, price pressure and future exit flexibility.",
    ),
  };
}

function buildSeasonTrend(
  summary: ReturnType<typeof buildPlayerSummary> | null,
  player: Awaited<ReturnType<typeof fetchPlayerRecord>>,
  risk: RiskBlock,
) {
  const now = new Date();
  const year = now.getUTCFullYear();
  const currentOverall = clamp(summary?.overall.overall ?? 58);
  const currentValue = player?.marketValue ?? summary?.player.marketValue ?? null;

  return [
    {
      season: `${year - 2}/${String(year - 1).slice(-2)}`,
      overall: clamp(currentOverall - 5),
      marketValue: currentValue ? Math.round(currentValue * 0.74) : null,
      riskScore: clamp(risk.overall.score + 7),
    },
    {
      season: `${year - 1}/${String(year).slice(-2)}`,
      overall: clamp(currentOverall - 2),
      marketValue: currentValue ? Math.round(currentValue * 0.88) : null,
      riskScore: clamp(risk.overall.score + 3),
    },
    {
      season: `${year}/${String(year + 1).slice(-2)}`,
      overall: currentOverall,
      marketValue: currentValue,
      riskScore: risk.overall.score,
    },
  ];
}

function buildContextBlock(
  analysis: AnalysisWithContext,
  summary: ReturnType<typeof buildPlayerSummary> | null,
  player: Awaited<ReturnType<typeof fetchPlayerRecord>>,
  risk: RiskBlock,
): ContextBlock {
  return {
    sourceAnalysisId: analysis?.id ?? null,
    sourceAnalysisType: analysis?.type ?? null,
    sourceUpdatedAt: analysis?.updatedAt?.toISOString() ?? null,
    competitionLevel: player?.league ?? "unknown_competition",
    sampleConfidence: clamp(
      average([
        analysis ? 78 : 45,
        summary?.player.risk?.score != null ? 70 : 45,
        player?.metricsSnapshots?.length ? 80 : 55,
      ], 55),
    ),
    seasonTrend: buildSeasonTrend(summary, player, risk),
  };
}

function buildNarrativeBlock(
  identity: PlayerIdentity,
  summary: PlayerIntelligenceSummary,
  technical: TechnicalBlock,
  tactical: TacticalBlock,
  risk: RiskBlock,
  projection: ProjectionBlock,
  analysis: AnalysisWithContext,
): NarrativeBlock {
  const payloadRecord = asRecord(analysis?.payload);
  const reportNarrative = typeof payloadRecord?.aiNarrative === "string" ? payloadRecord.aiNarrative : null;
  const comparisonRecord = asRecord(payloadRecord?.comparison);
  const reportInsights = [
    ...asStringArray(payloadRecord?.insights),
    ...asStringArray(comparisonRecord?.summaryInsights),
  ];
  const description = analysis?.description ?? null;

  const strengths = [
    technical.passing >= 70 ? "Build-up progression quality is already first-team relevant." : "Technical baseline is functional but not yet dominant.",
    tactical.decisionMaking >= 70 ? "Decision-making remains stable under pressure." : "Decision-making still needs stronger consistency.",
    projection.growthIndex >= 65 ? "Development trajectory points to visible upside." : "Projection is more stable than explosive.",
  ];

  const concerns = [
    risk.overall.score >= 65 ? "Composite risk sits above the platform comfort line." : "Risk level is manageable in a structured environment.",
    risk.financial.score >= 60 ? "Financial exposure requires disciplined entry price." : "Financial exposure remains controllable.",
    risk.tactical.score >= 60 ? "Role-context fit should be validated before scaling minutes." : "Tactical fit is broadly portable.",
  ];

  const developmentFocus = [
    technical.creativity >= technical.ballStriking ? "Sharpen final-third decisiveness and shot selection." : "Expand chance creation range under pressure.",
    tactical.roleDiscipline >= 68 ? "Increase repeatability of high-value actions across full matches." : "Improve tactical timing and role discipline.",
    "Validate output with deeper event data and recurring analysis snapshots.",
  ];

  const aiInsights = [
    reportNarrative,
    description,
    ...reportInsights,
    summary.summary,
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);

  return {
    headline: `${identity.name}: ${summary.status.replace(/_/g, " ")}`,
    executiveSummary: summary.recommendation,
    strengths,
    concerns,
    developmentFocus,
    aiInsights:
      aiInsights.length > 0
        ? aiInsights
        : [
            `${identity.name} profiles as a ${summary.status.replace(/_/g, " ")} candidate with ${projection.growthIndex} growth index.`,
            `Technical score ${technical.overall} and tactical score ${tactical.overall} frame the current role fit.`,
          ],
  };
}

export async function buildPlayerIntelligenceProfile(playerId: string): Promise<PlayerIntelligenceProfile> {
  const [player, latestAnalysis] = await Promise.all([
    fetchPlayerRecord(playerId),
    fetchLatestAnalysisForPlayer(playerId),
  ]);

  const summary = player ? buildPlayerSummary(player as PlayerSummarySource) : null;
  const identity = player ? buildIdentity(player) : buildMockIdentity(playerId);

  if (!player) {
    identity.id = playerId;
  }

  const technical = buildTechnicalBlock(summary);
  const physical = buildPhysicalBlock(summary);
  const tactical = buildTacticalBlock(summary, identity);
  const market = buildMarketBlock(summary, player);
  const risk = buildRiskBlock(summary, physical, tactical, market);
  const projection = buildProjectionBlock(summary, identity, risk);
  const dna = buildDna(technical, physical, tactical, identity);
  const fieldIntelligence =
    extractFieldIntelligenceFromAnalysis(latestAnalysis) ??
    buildMockFieldIntelligence(playerId, identity, technical);
  const summaryBlock = buildSummary(identity, projection, market, risk);
  const context = buildContextBlock(latestAnalysis, summary, player, risk);
  const narrative = buildNarrativeBlock(
    identity,
    summaryBlock,
    technical,
    tactical,
    risk,
    projection,
    latestAnalysis,
  );

  return {
    generatedAt: new Date().toISOString(),
    identity,
    summary: summaryBlock,
    technical,
    physical,
    tactical,
    market,
    risk,
    projection,
    dna,
    fieldIntelligence,
    context,
    narrative,
    executiveSnapshot: summaryBlock,
    soccerMindDNA: dna,
  };
}
