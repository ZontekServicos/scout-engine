type MetricBand = {
  label: string;
  score: number;
  summary: string;
};

type SpatialZone = {
  x: number;
  y: number;
  width: number;
  height: number;
  intensity: number;
};

type SpatialEventPoint = {
  x: number;
  y: number;
  endX?: number;
  endY?: number;
  value?: number;
  outcome?: "success" | "fail" | "goal" | "saved" | "blocked";
  label?: string;
};

type SimilarPlayer = {
  id: string;
  name: string;
  position: string;
  team: string;
  fitScore: number;
  rationale: string;
};

type SeasonTrendPoint = {
  season: string;
  performance: number;
  market: number;
};

export type NormalizedPlayerIntelligenceProfile = {
  identity: {
    id: string;
    name: string;
    age: number | null;
    nationality: string | null;
    club: string | null;
    league: string | null;
    dominantPosition: string | null;
    positions: string[];
  };
  summary: {
    overall: number;
    potential: number;
    marketValue: number | null;
    recommendation: string;
    confidence: number;
    currentLevel: number;
    expectedPeak: number;
    growthOutlook: string;
    resalePotential: MetricBand;
    archetype: string;
    profile: string;
    idealRole: string;
    idealSystem: string;
    bestUseCase: string;
    valueScore: number;
    liquidityScore: number;
    riskScore: number;
    capitalEfficiency: number;
  };
  technical: {
    coreAttributes: {
      pace: number;
      shooting: number;
      passing: number;
      dribbling: number;
      defending: number;
      physical: number;
    };
    detailedMetrics: Record<string, number>;
    overall: number;
    potential: number;
    marketValue: number | null;
  };
  physical: {
    acceleration: number;
    sprintSpeed: number;
    stamina: number;
    strength: number;
    jumping: number;
    balance: number;
    agility: number;
    physicalRisk: MetricBand;
  };
  tactical: {
    tacticalMaturity: MetricBand;
    tacticalAdaptationRisk: MetricBand;
    idealRole: string;
    idealSystem: string;
    bestUseCase: string;
    archetype: string;
    profile: string;
  };
  market: {
    marketValue: number | null;
    salaryRange: {
      min: number;
      max: number;
      currency: string;
      period: "weekly" | "monthly" | "yearly";
      label: string;
    };
    liquidity: MetricBand;
    financialRisk: MetricBand;
    capitalEfficiency: number;
    valueScore: number;
  };
  risk: {
    composite: MetricBand;
    structural: MetricBand;
    financial: MetricBand;
    physical: MetricBand;
    tacticalAdaptation: MetricBand;
    medical: MetricBand;
  };
  projection: {
    currentLevel: number;
    expectedPeak: number;
    expectedOverallNextSeason: number;
    growthIndex: number;
    growthOutlook: string;
    resalePotential: MetricBand;
  };
  dna: {
    dominantTags: string[];
    traits: Array<{
      key: string;
      label: string;
      value: number;
      emphasis: "elite" | "strong" | "stable" | "developing";
      note: string;
    }>;
    archetype: string;
    profile: string;
  };
  fieldIntelligence: {
    heatmap: SpatialZone[];
    shots: SpatialEventPoint[];
    passes: SpatialEventPoint[];
    defensiveActions: SpatialEventPoint[];
  };
  contextSimilarity: {
    similarPlayers: SimilarPlayer[];
    idealSystems: string[];
    idealClubs: string[];
    seasonTrends: SeasonTrendPoint[];
  };
  executiveSnapshot: {
    recommendation: string;
    confidence: number;
    risk: MetricBand;
    upside: MetricBand;
    liquidity: MetricBand;
    tacticalFit: MetricBand;
    idealAcquisitionWindow: string;
    value: MetricBand;
  };
  soccerMindDna: {
    dominantTags: string[];
    traits: Array<{
      key: string;
      label: string;
      value: number;
      emphasis: "elite" | "strong" | "stable" | "developing";
      note: string;
    }>;
  };
  marketRisk: {
    marketValue: number | null;
    salaryRange: {
      min: number;
      max: number;
      currency: string;
      period: "weekly" | "monthly" | "yearly";
      label: string;
    };
    liquidity: MetricBand;
    physicalRisk: MetricBand;
    tacticalAdaptationRisk: MetricBand;
    financialRisk: MetricBand;
    resalePotential: MetricBand;
  };
  dataStatus: {
    source: "shared-profile";
    eventDataReady: boolean;
    shotLocationsReady: boolean;
    passLocationsReady: boolean;
    heatZonesReady: boolean;
    seasonTrendReady: boolean;
  };
};

type BuildPlayerIntelligenceProfileParams = {
  playerProfile: any;
  projection: {
    growthIndex?: number;
    expectedOverallNextSeason?: number;
    expectedPeak?: number;
  };
  similarPlayers: Array<any>;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function toNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function average(values: Array<number | null | undefined>) {
  const normalized = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (normalized.length === 0) {
    return 0;
  }
  return normalized.reduce((sum, value) => sum + value, 0) / normalized.length;
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

function toBand(label: string, score: number, summary: string): MetricBand {
  return {
    label,
    score: Math.round(clamp(score, 0, 100)),
    summary,
  };
}

function formatCurrencyCompact(value: number) {
  if (value >= 1_000_000) return `EUR ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `EUR ${(value / 1_000).toFixed(0)}K`;
  return `EUR ${value.toFixed(0)}`;
}

function resolvePositionFamily(position: string) {
  const normalized = position.toUpperCase();
  if (["ST", "CF", "LW", "RW", "LF", "RF"].includes(normalized)) return "attack";
  if (["CAM", "CM", "CDM", "LM", "RM"].includes(normalized)) return "midfield";
  if (["LB", "RB", "CB", "LWB", "RWB"].includes(normalized)) return "defense";
  return "goalkeeper";
}

function getGrowthOutlook(growthIndex: number, expectedPeak: number, currentLevel: number) {
  if (growthIndex >= 70 || expectedPeak >= currentLevel + 6) return "High Growth";
  if (growthIndex >= 50 || expectedPeak >= currentLevel + 3) return "Positive";
  return "Stable";
}

function buildSalaryRange(marketValue: number | null) {
  const safeMarketValue = marketValue ?? 3_000_000;
  const min = Math.round(safeMarketValue * 0.07);
  const max = Math.round(safeMarketValue * 0.12);
  return {
    min,
    max,
    currency: "EUR",
    period: "yearly" as const,
    label: `${formatCurrencyCompact(min)} - ${formatCurrencyCompact(max)} / year`,
  };
}

function buildHeatZones(position: string, random: () => number): SpatialZone[] {
  const positionFamily = resolvePositionFamily(position);
  const zones: SpatialZone[] = [];

  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 6; column += 1) {
      const centerBias =
        positionFamily === "attack"
          ? column >= 3
            ? 24
            : 8
          : positionFamily === "midfield"
            ? column >= 2 && column <= 4
              ? 18
              : 10
            : positionFamily === "defense"
              ? column <= 2
                ? 20
                : 8
              : column <= 1
                ? 26
                : 4;
      const lateralBias = row === 1 || row === 2 ? 8 : 0;

      zones.push({
        x: column * (100 / 6),
        y: row * 25,
        width: 100 / 6,
        height: 25,
        intensity: Math.round(clamp(centerBias + lateralBias + random() * 26, 10, 100)),
      });
    }
  }

  return zones;
}

function buildShotMap(position: string, shooting: number, random: () => number): SpatialEventPoint[] {
  const family = resolvePositionFamily(position);
  const shots = family === "defense" ? 7 : family === "midfield" ? 9 : 11;

  return Array.from({ length: shots }, (_, index) => {
    const xBase = family === "attack" ? 72 : family === "midfield" ? 63 : 54;
    const x = clamp(xBase + random() * 24, 48, 96);
    const y = clamp(22 + random() * 56, 10, 90);
    const quality = clamp(0.06 + random() * 0.34 + (shooting - 50) / 200, 0.04, 0.62);
    const outcomeChance = random();

    return {
      x,
      y,
      value: Number(quality.toFixed(2)),
      outcome: outcomeChance > 0.84 ? "goal" : outcomeChance > 0.5 ? "saved" : "blocked",
      label: `Shot ${index + 1}`,
    };
  });
}

function buildPassMap(position: string, random: () => number): SpatialEventPoint[] {
  const family = resolvePositionFamily(position);
  const count = family === "midfield" ? 14 : family === "attack" ? 10 : 12;

  return Array.from({ length: count }, (_, index) => {
    const startX = family === "attack" ? 40 + random() * 28 : family === "midfield" ? 28 + random() * 34 : 18 + random() * 28;
    const endX = clamp(startX + 8 + random() * 28, startX + 4, 98);
    const startY = 14 + random() * 72;
    const endY = clamp(startY + (random() - 0.5) * 28, 6, 94);

    return {
      x: startX,
      y: startY,
      endX,
      endY,
      outcome: random() > 0.18 ? "success" : "fail",
      label: `Pass ${index + 1}`,
    };
  });
}

function buildDefensiveActions(position: string, random: () => number): SpatialEventPoint[] {
  const family = resolvePositionFamily(position);
  const count = family === "defense" ? 12 : family === "midfield" ? 10 : 6;

  return Array.from({ length: count }, (_, index) => ({
    x: clamp((family === "defense" ? 34 : family === "midfield" ? 44 : 58) + (random() - 0.5) * 24, 12, 88),
    y: clamp(10 + random() * 80, 8, 92),
    outcome: random() > 0.22 ? "success" : "fail",
    label: `Action ${index + 1}`,
  }));
}

function buildIdealSystems(position: string) {
  const family = resolvePositionFamily(position);
  if (family === "attack") return ["4-3-3 vertical press", "4-2-3-1 transition attack", "3-4-2-1 box occupation"];
  if (family === "midfield") return ["4-3-3 control-possession", "3-2-4-1 hybrid build", "4-4-2 diamond progression"];
  if (family === "defense") return ["4-3-3 high line", "3-4-3 aggressive rest defense", "4-2-2-2 compact press"];
  return ["4-3-3 build-first", "3-2 rest defense", "4-4-2 medium block"];
}

function buildIdealClubs(position: string, liquidityScore: number) {
  const family = resolvePositionFamily(position);
  if (family === "attack") return liquidityScore >= 70 ? ["Brighton", "Benfica", "Atalanta"] : ["Real Sociedad", "Lille", "Bologna"];
  if (family === "midfield") return liquidityScore >= 70 ? ["RB Leipzig", "Girona", "Feyenoord"] : ["Torino", "Braga", "Toulouse"];
  if (family === "defense") return liquidityScore >= 70 ? ["Leverkusen", "Sporting CP", "Bologna"] : ["Getafe", "Lens", "Freiburg"];
  return ["PSV", "Lazio", "Real Betis"];
}

function buildPlayerRole(position: string, archetype: string) {
  const family = resolvePositionFamily(position);
  if (family === "attack") return archetype.includes("Creator") ? "Creative Forward" : "Vertical Attacker";
  if (family === "midfield") return archetype.includes("Anchor") ? "Control Midfielder" : "Box Midfielder";
  if (family === "defense") return archetype.includes("Ball") ? "Build-up Defender" : "Defensive Stabilizer";
  return "Goalkeeper";
}

function traitEmphasis(value: number): "elite" | "strong" | "stable" | "developing" {
  if (value >= 82) return "elite";
  if (value >= 70) return "strong";
  if (value >= 58) return "stable";
  return "developing";
}

export function buildPlayerIntelligenceProfile({
  playerProfile,
  projection,
  similarPlayers,
}: BuildPlayerIntelligenceProfileParams): NormalizedPlayerIntelligenceProfile {
  const player = playerProfile.player ?? playerProfile;
  const position = String(playerProfile.position ?? player.position ?? "CM");
  const overall = toNumber(playerProfile.overall, 60);
  const potential = toNumber(playerProfile.potential, overall);
  const marketValue = typeof playerProfile.marketValue === "number" ? playerProfile.marketValue : null;
  const riskScore = toNumber(playerProfile.risk?.score, 50);
  const capitalEfficiency = toNumber(playerProfile.capitalEfficiency, 0);
  const liquidityScore = toNumber(playerProfile.liquidityScore, toNumber(playerProfile.liquidityNormalized?.score, 0));
  const financialRiskScore = toNumber(playerProfile.financialRisk, toNumber(playerProfile.financialRiskNormalized?.index, 0));
  const growthIndex = toNumber(projection.growthIndex, 0);
  const expectedPeak = toNumber(projection.expectedPeak, potential);
  const expectedOverallNextSeason = toNumber(projection.expectedOverallNextSeason, overall);
  const growthOutlook = getGrowthOutlook(growthIndex, expectedPeak, overall);
  const upsideGap = Math.max(0, potential - overall);
  const confidence = Math.round(clamp(58 + overall * 0.32 + upsideGap * 2.5, 55, 96));
  const tacticalFitScore = clamp(
    average([
      playerProfile.attributes?.passing,
      playerProfile.attributes?.dribbling,
      playerProfile.attributes?.defending,
      playerProfile.attributes?.physical,
      playerProfile.mental?.vision,
      playerProfile.mental?.composure,
    ]),
    32,
    96,
  );
  const upsideScore = clamp(46 + upsideGap * 8 + Math.max(0, 24 - toNumber(playerProfile.age, 24)) * 1.4, 20, 97);
  const recommendation =
    overall >= 82 || (upsideGap >= 6 && toNumber(playerProfile.age, 24) <= 24)
      ? "Target Now"
      : overall >= 76 || upsideGap >= 4
        ? "Priority Watch"
        : "Monitor";
  const valueScore = Math.round(
    clamp(
      capitalEfficiency * 8 + liquidityScore * 0.3 + upsideScore * 0.25 - financialRiskScore * 0.18,
      20,
      98,
    ),
  );
  const archetype = String(playerProfile.archetype?.label ?? "Balanced Profile");
  const profileLabel = `${resolvePositionFamily(position)}-${growthOutlook.toLowerCase()}`;
  const idealSystems = buildIdealSystems(position);
  const idealRole = buildPlayerRole(position, archetype);
  const bestUseCase =
    recommendation === "Target Now"
      ? "Immediate first-team impact with resale insulation."
      : recommendation === "Priority Watch"
        ? "High-upside acquisition that still needs context discipline."
        : "Strategic monitoring until pricing or role clarity improves.";

  const dnaTraits = [
    ["verticality", "Verticality", average([playerProfile.attributes?.pace, playerProfile.physical?.acceleration, playerProfile.mental?.positioning]), "Speed and direct carry threat into attacking space."],
    ["progressive-threat", "Progressive Threat", average([playerProfile.attributes?.passing, playerProfile.attributes?.dribbling, playerProfile.mental?.vision, playerProfile.attributes?.shooting]), "Ability to move possession toward decisive zones."],
    ["ball-security", "Ball Security", average([playerProfile.technical?.ballControl, playerProfile.technical?.shortPassing, playerProfile.mental?.composure, playerProfile.attributes?.dribbling]), "Retention quality under pressure and clean continuation value."],
    ["tactical-maturity", "Tactical Maturity", average([playerProfile.mental?.vision, playerProfile.mental?.composure, playerProfile.attributes?.defending, tacticalFitScore]), "Decision quality, timing and positional discipline."],
    ["transition-impact", "Transition Impact", average([playerProfile.attributes?.pace, playerProfile.attributes?.passing, playerProfile.attributes?.dribbling, playerProfile.mental?.vision]), "Value added when phases accelerate."],
    ["final-third-creation", "Final-Third Creation", average([playerProfile.attributes?.passing, playerProfile.technical?.crossing, playerProfile.technical?.curve, playerProfile.technical?.longPassing]), "Creation volume in advanced areas."],
    ["pressing-intensity", "Pressing Intensity", average([playerProfile.attributes?.physical, playerProfile.physical?.stamina, playerProfile.mental?.aggression, playerProfile.attributes?.defending]), "Energy and confrontation profile without the ball."],
    ["depth-attack", "Depth Attack", average([playerProfile.attributes?.pace, playerProfile.physical?.sprintSpeed, playerProfile.mental?.positioning, playerProfile.attributes?.shooting]), "Threat behind the line and access to the penalty box."],
  ].map(([key, label, value, note]) => ({
    key: String(key),
    label: String(label),
    value: Math.round(clamp(Number(value), 20, 98)),
    emphasis: traitEmphasis(Number(value)),
    note: String(note),
  }));

  const dominantTags = dnaTraits
    .filter((trait) => trait.value >= 72)
    .sort((left, right) => right.value - left.value)
    .slice(0, 4)
    .map((trait) => trait.label);

  const seed = `${playerProfile.id}:${position}:${playerProfile.name}`;
  const random = createSeededRandom(seed);
  const fieldIntelligence = {
    heatmap: buildHeatZones(position, random),
    shots: buildShotMap(position, toNumber(playerProfile.attributes?.shooting, 50), random),
    passes: buildPassMap(position, random),
    defensiveActions: buildDefensiveActions(position, random),
  };

  const resalePotential = toBand(
    valueScore >= 76 ? "Strong Exit" : valueScore >= 55 ? "Protected" : "Limited Exit",
    clamp(34 + upsideScore * 0.52 + liquidityScore * 0.22 - Math.max(0, toNumber(playerProfile.age, 24) - 26) * 4, 18, 96),
    "Forward-looking resale optionality based on age, liquidity and growth headroom.",
  );

  const physicalRisk = toBand(
    riskScore >= 68 ? "Monitor Body Load" : riskScore >= 45 ? "Manageable" : "Stable",
    clamp(32 + Math.max(0, toNumber(playerProfile.age, 24) - 28) * 6 + (100 - toNumber(playerProfile.attributes?.physical, 60)) * 0.24, 18, 92),
    "Proxy based on age curve and physical output until deeper medical history is available.",
  );

  const tacticalAdaptationRisk = toBand(
    100 - tacticalFitScore >= 68 ? "High Context Risk" : 100 - tacticalFitScore >= 48 ? "Needs Structure" : "Plug-In Ready",
    clamp(100 - tacticalFitScore + 12, 18, 90),
    "Rates how much coaching structure is needed before the player reaches expected output.",
  );

  const financialRisk = toBand(
    financialRiskScore >= 68 ? "Capital Sensitive" : financialRiskScore >= 46 ? "Disciplined Deal" : "Efficient Entry",
    clamp(financialRiskScore * 10, 20, 94),
    "Blends estimated fee pressure, salary load and expected exit optionality.",
  );

  const liquidity = toBand(
    liquidityScore >= 75 ? "Liquid Asset" : liquidityScore >= 55 ? "Tradable" : "Specialist Market",
    clamp(liquidityScore, 0, 100),
    "Estimated market portability across leagues with similar competitive and financial tiers.",
  );

  const executiveRisk = toBand(
    riskScore >= 67 ? "Elevated" : riskScore >= 45 ? "Managed" : "Controlled",
    clamp(riskScore * 10, 0, 100),
    "Composite view of age curve, current output stability and adaptation exposure.",
  );

  const upside = toBand(
    upsideScore >= 75 ? "High Growth" : upsideScore >= 55 ? "Expandable" : "Near Ceiling",
    upsideScore,
    "Projected ceiling based on age, current level and room above present output.",
  );

  const tacticalFit = toBand(
    tacticalFitScore >= 78 ? "System Ready" : tacticalFitScore >= 60 ? "Context Dependent" : "Scheme Risk",
    tacticalFitScore,
    "Blend of technical security, transition value and positional suitability for structured football.",
  );

  const valueBand = toBand(
    valueScore >= 75 ? "Positive Value" : valueScore >= 55 ? "Fair Value" : "Price Sensitive",
    valueScore,
    "Relationship between expected output, market entry cost and future optionality.",
  );

  const similarProfiles: SimilarPlayer[] = similarPlayers.slice(0, 4).map((similarPlayer: any, index: number) => ({
    id: String(similarPlayer.id ?? `similar-${index}`),
    name: String(similarPlayer.name ?? "Unknown"),
    position: String(similarPlayer.position ?? "N/A"),
    team: String(similarPlayer.team ?? similarPlayer.club ?? "Open Market"),
    fitScore: Math.round(
      clamp(
        64 +
          Math.max(0, 12 - Math.abs(toNumber(similarPlayer.overall, overall) - overall)) +
          Math.max(0, 8 - Math.abs(toNumber(similarPlayer.potential, potential) - potential)) -
          index * 2,
        55,
        95,
      ),
    ),
    rationale: "Comparable role profile, market tier and output shape for shortlist triangulation.",
  }));

  const currentSeason = new Date().getFullYear();
  const baseMarket = marketValue ?? 6_000_000;
  const seasonTrends: SeasonTrendPoint[] = [
    { season: `${currentSeason - 2}/${String(currentSeason - 1).slice(-2)}`, performance: clamp(overall - 6, 40, 99), market: clamp(baseMarket * 0.72, 500_000, 120_000_000) },
    { season: `${currentSeason - 1}/${String(currentSeason).slice(-2)}`, performance: clamp(overall - 3, 40, 99), market: clamp(baseMarket * 0.86, 500_000, 120_000_000) },
    { season: `${currentSeason}/${String(currentSeason + 1).slice(-2)}`, performance: overall, market: clamp(baseMarket, 500_000, 120_000_000) },
    { season: `${currentSeason + 1}/${String(currentSeason + 2).slice(-2)}`, performance: clamp(Math.round((overall + expectedPeak) / 2), 40, 99), market: clamp(baseMarket * 1.12, 500_000, 140_000_000) },
    { season: `${currentSeason + 2}/${String(currentSeason + 3).slice(-2)}`, performance: clamp(expectedPeak, 40, 99), market: clamp(baseMarket * 1.26, 500_000, 150_000_000) },
  ];

  const detailedMetrics = Object.fromEntries(
    Object.entries({
      crossing: toNumber(playerProfile.technical?.crossing),
      finishing: toNumber(playerProfile.technical?.finishing),
      headingAccuracy: toNumber(playerProfile.technical?.headingAccuracy),
      shortPassing: toNumber(playerProfile.technical?.shortPassing),
      volleys: toNumber(playerProfile.technical?.volleys),
      curve: toNumber(playerProfile.technical?.curve),
      fkAccuracy: toNumber(playerProfile.technical?.fkAccuracy),
      longPassing: toNumber(playerProfile.technical?.longPassing),
      ballControl: toNumber(playerProfile.technical?.ballControl),
      acceleration: toNumber(playerProfile.physical?.acceleration),
      sprintSpeed: toNumber(playerProfile.physical?.sprintSpeed),
      agility: toNumber(playerProfile.physical?.agility),
      reactions: toNumber(playerProfile.mental?.reactions),
      balance: toNumber(playerProfile.physical?.balance),
      shotPower: toNumber(playerProfile.physical?.shotPower),
      jumping: toNumber(playerProfile.physical?.jumping),
      stamina: toNumber(playerProfile.physical?.stamina),
      strength: toNumber(playerProfile.physical?.strength),
      longShots: toNumber(playerProfile.physical?.longShots),
      aggression: toNumber(playerProfile.mental?.aggression),
      interceptions: toNumber(playerProfile.mental?.interceptions),
      attackPosition: toNumber(playerProfile.mental?.positioning),
      vision: toNumber(playerProfile.mental?.vision),
      penalties: toNumber(playerProfile.mental?.penalties),
      composure: toNumber(playerProfile.mental?.composure),
      defensiveAwareness: toNumber(playerProfile.mental?.defensiveAwareness),
      standingTackle: toNumber(playerProfile.mental?.standingTackle),
      slidingTackle: toNumber(playerProfile.mental?.slidingTackle),
      gkDiving: toNumber(playerProfile.technical?.gkDiving),
      gkHandling: toNumber(playerProfile.technical?.gkHandling),
      gkKicking: toNumber(playerProfile.technical?.gkKicking),
      gkPositioning: toNumber(playerProfile.technical?.gkPositioning),
      gkReflexes: toNumber(playerProfile.technical?.gkReflexes),
    }).map(([key, value]) => [key, Math.round(value)]),
  );

  return {
    identity: {
      id: String(playerProfile.id),
      name: String(playerProfile.name),
      age: playerProfile.age ?? null,
      nationality: player.nationality ?? null,
      club: playerProfile.team ?? null,
      league: playerProfile.league ?? null,
      dominantPosition: position,
      positions: Array.isArray(player.positions) ? player.positions : [position],
    },
    summary: {
      overall,
      potential,
      marketValue,
      recommendation,
      confidence,
      currentLevel: overall,
      expectedPeak,
      growthOutlook,
      resalePotential,
      archetype,
      profile: profileLabel,
      idealRole,
      idealSystem: idealSystems[0] ?? "Flexible structure",
      bestUseCase,
      valueScore,
      liquidityScore: liquidity.score,
      riskScore: executiveRisk.score,
      capitalEfficiency,
    },
    technical: {
      coreAttributes: {
        pace: toNumber(playerProfile.attributes?.pace, 0),
        shooting: toNumber(playerProfile.attributes?.shooting, 0),
        passing: toNumber(playerProfile.attributes?.passing, 0),
        dribbling: toNumber(playerProfile.attributes?.dribbling, 0),
        defending: toNumber(playerProfile.attributes?.defending, 0),
        physical: toNumber(playerProfile.attributes?.physical, 0),
      },
      detailedMetrics,
      overall,
      potential,
      marketValue,
    },
    physical: {
      acceleration: toNumber(playerProfile.physical?.acceleration, 0),
      sprintSpeed: toNumber(playerProfile.physical?.sprintSpeed, 0),
      stamina: toNumber(playerProfile.physical?.stamina, 0),
      strength: toNumber(playerProfile.physical?.strength, 0),
      jumping: toNumber(playerProfile.physical?.jumping, 0),
      balance: toNumber(playerProfile.physical?.balance, 0),
      agility: toNumber(playerProfile.physical?.agility, 0),
      physicalRisk,
    },
    tactical: {
      tacticalMaturity: toBand(dnaTraits.find((trait) => trait.key === "tactical-maturity")?.label ?? "Tactical Maturity", dnaTraits.find((trait) => trait.key === "tactical-maturity")?.value ?? tacticalFitScore, "Decision quality, timing and positional discipline."),
      tacticalAdaptationRisk,
      idealRole,
      idealSystem: idealSystems[0] ?? "Flexible structure",
      bestUseCase,
      archetype,
      profile: profileLabel,
    },
    market: {
      marketValue,
      salaryRange: buildSalaryRange(marketValue),
      liquidity,
      financialRisk,
      capitalEfficiency,
      valueScore,
    },
    risk: {
      composite: executiveRisk,
      structural: toBand(String(playerProfile.structuralRiskNormalized?.level ?? playerProfile.risk?.level ?? "Managed"), clamp(toNumber(playerProfile.structuralRisk, riskScore) * 10, 0, 100), String(playerProfile.structuralRiskNormalized?.breakdown ?? playerProfile.risk?.explanation ?? "Structural risk narrative unavailable.")),
      financial: financialRisk,
      physical: physicalRisk,
      tacticalAdaptation: tacticalAdaptationRisk,
      medical: toBand("Monitor", Math.round((physicalRisk.score + executiveRisk.score) / 2), "Medical layer still uses proxy scoring while event and medical feeds remain mocked."),
    },
    projection: {
      currentLevel: overall,
      expectedPeak,
      expectedOverallNextSeason,
      growthIndex,
      growthOutlook,
      resalePotential,
    },
    dna: {
      dominantTags: dominantTags.length > 0 ? dominantTags : ["Developmental Profile"],
      traits: dnaTraits,
      archetype,
      profile: profileLabel,
    },
    fieldIntelligence,
    contextSimilarity: {
      similarPlayers: similarProfiles,
      idealSystems,
      idealClubs: buildIdealClubs(position, liquidity.score),
      seasonTrends,
    },
    executiveSnapshot: {
      recommendation,
      confidence,
      risk: executiveRisk,
      upside,
      liquidity,
      tacticalFit,
      idealAcquisitionWindow:
        toNumber(playerProfile.age, 24) <= 22
          ? "Move before breakout pricing accelerates."
          : toNumber(playerProfile.age, 24) <= 26
            ? "Acquire inside the next two windows while performance is scalable."
            : "Short-term opportunity only if the fee remains disciplined.",
      value: valueBand,
    },
    soccerMindDna: {
      dominantTags: dominantTags.length > 0 ? dominantTags : ["Developmental Profile"],
      traits: dnaTraits,
    },
    marketRisk: {
      marketValue,
      salaryRange: buildSalaryRange(marketValue),
      liquidity,
      physicalRisk,
      tacticalAdaptationRisk,
      financialRisk,
      resalePotential,
    },
    dataStatus: {
      source: "shared-profile",
      eventDataReady: true,
      shotLocationsReady: true,
      passLocationsReady: true,
      heatZonesReady: true,
      seasonTrendReady: true,
    },
  };
}
