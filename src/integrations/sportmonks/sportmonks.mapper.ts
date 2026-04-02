import type {
  PlayerIntelligenceProfile,
  ScoreBand,
  TechnicalBlock,
  PhysicalBlock,
  TacticalBlock,
  MarketBlock,
  RiskBlock,
  ProjectionBlock,
  PlayerIntelligenceDna,
  FieldIntelligence,
  ContextBlock,
  NarrativeBlock,
  PlayerIntelligenceSummary,
} from "../../domain/player-intelligence/types";
import type { SportmonksPlayer, SportmonksStat, NormalizedStats } from "./sportmonks.types";
import { SM_STAT } from "./sportmonks.types";

// ---------------------------------------------------------------------------
// normalizeStats
// ---------------------------------------------------------------------------

function extractStatValue(stat: SportmonksStat): number {
  const v = stat.value;
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "object") {
    if (typeof v.total === "number") return v.total;
    if (typeof v.average === "number") return v.average;
  }
  return 0;
}

export function normalizeStats(stats: SportmonksStat[]): NormalizedStats {
  const byType = new Map<number, number>();
  for (const stat of stats) {
    byType.set(stat.type_id, extractStatValue(stat));
  }

  const get = (id: number) => byType.get(id) ?? 0;

  return {
    goals: get(SM_STAT.GOALS),
    assists: get(SM_STAT.ASSISTS),
    passes: get(SM_STAT.PASSES),
    passAccuracy: get(SM_STAT.PASS_ACCURACY),
    keyPasses: get(SM_STAT.KEY_PASSES),
    shotsTotal: get(SM_STAT.SHOTS_TOTAL),
    shotsOnTarget: get(SM_STAT.SHOTS_ON_TARGET),
    dribblesAttempted: get(SM_STAT.DRIBBLES_ATTEMPTED),
    dribblesSuccess: get(SM_STAT.DRIBBLES_SUCCESS),
    interceptions: get(SM_STAT.INTERCEPTIONS),
    tackles: get(SM_STAT.TACKLES),
    clearances: get(SM_STAT.CLEARANCES),
    duelsTotal: get(SM_STAT.DUELS_TOTAL),
    duelsWon: get(SM_STAT.DUELS_WON),
    aerialDuelsWon: get(SM_STAT.AERIAL_DUELS_WON),
    minutesPlayed: get(SM_STAT.MINUTES_PLAYED),
    appearances: get(SM_STAT.APPEARANCES),
    rating: get(SM_STAT.RATING),
    distanceCovered: get(SM_STAT.DISTANCE_COVERED),
    sprints: get(SM_STAT.SPRINTS),
    xG: get(SM_STAT.XG),
    xA: get(SM_STAT.XA),
    yellowCards: get(SM_STAT.YELLOW_CARDS),
    redCards: get(SM_STAT.RED_CARDS),
  };
}

// ---------------------------------------------------------------------------
// Scoring helpers
// ---------------------------------------------------------------------------

function clamp(value: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, value));
}

function scoreBand(score: number, label: string, summary: string): ScoreBand {
  return { score: clamp(Math.round(score)), label, summary };
}

function ratingBand(score: number): { label: string; summary: string } {
  if (score >= 80) return { label: "Elite", summary: "Desempenho de nível elite." };
  if (score >= 65) return { label: "Alto", summary: "Desempenho acima da média." };
  if (score >= 50) return { label: "Médio", summary: "Desempenho dentro da média." };
  return { label: "Baixo", summary: "Desempenho abaixo da média." };
}

function riskBand(score: number): { label: string; summary: string } {
  if (score <= 25) return { label: "Baixo", summary: "Risco controlado." };
  if (score <= 50) return { label: "Moderado", summary: "Risco gerenciável." };
  if (score <= 75) return { label: "Elevado", summary: "Atenção recomendada." };
  return { label: "Crítico", summary: "Risco significativo identificado." };
}

function deriveAge(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

// ---------------------------------------------------------------------------
// Block builders
// ---------------------------------------------------------------------------

function buildTechnical(s: NormalizedStats): TechnicalBlock {
  const passingScore = clamp((s.passAccuracy / 100) * 80 + (s.keyPasses / Math.max(s.appearances, 1)) * 5);
  const creativityScore = clamp(s.keyPasses / Math.max(s.appearances, 1) * 10 + (s.xA / Math.max(s.appearances, 1)) * 15);
  const ballStrikingScore = clamp((s.shotsOnTarget / Math.max(s.shotsTotal, 1)) * 60 + (s.xG / Math.max(s.appearances, 1)) * 10);
  const carryingScore = clamp((s.dribblesSuccess / Math.max(s.dribblesAttempted, 1)) * 70 + 20);
  const firstTouchScore = clamp(s.passAccuracy * 0.6 + 20);
  const defendingScore = clamp((s.tackles + s.interceptions + s.clearances) / Math.max(s.appearances, 1) * 6);
  const overall = clamp(
    passingScore * 0.2 + creativityScore * 0.15 + ballStrikingScore * 0.2 +
    carryingScore * 0.15 + firstTouchScore * 0.15 + defendingScore * 0.15,
  );

  return {
    overall: Math.round(overall),
    ballStriking: Math.round(ballStrikingScore),
    passing: Math.round(passingScore),
    carrying: Math.round(carryingScore),
    firstTouch: Math.round(firstTouchScore),
    creativity: Math.round(creativityScore),
    defending: Math.round(defendingScore),
    breakdown: {
      goals_per_game: +(s.goals / Math.max(s.appearances, 1)).toFixed(2),
      assists_per_game: +(s.assists / Math.max(s.appearances, 1)).toFixed(2),
      xG_per_game: +(s.xG / Math.max(s.appearances, 1)).toFixed(2),
      xA_per_game: +(s.xA / Math.max(s.appearances, 1)).toFixed(2),
      pass_accuracy_pct: s.passAccuracy,
    },
  };
}

function buildPhysical(s: NormalizedStats): PhysicalBlock {
  const distancePerGame = s.distanceCovered / Math.max(s.appearances, 1);
  const staminaScore = clamp(distancePerGame * 0.9);
  const sprintScore = clamp((s.sprints / Math.max(s.appearances, 1)) * 0.8);
  const aerialScore = clamp((s.aerialDuelsWon / Math.max(s.duelsTotal, 1)) * 100);
  const strengthScore = clamp((s.duelsWon / Math.max(s.duelsTotal, 1)) * 100);
  const overall = clamp((staminaScore + sprintScore + aerialScore + strengthScore) / 4);

  return {
    overall: Math.round(overall),
    acceleration: Math.round(sprintScore * 0.9),
    sprintSpeed: Math.round(sprintScore),
    agility: Math.round(sprintScore * 0.85),
    balance: Math.round(strengthScore * 0.8),
    strength: Math.round(strengthScore),
    stamina: Math.round(staminaScore),
    aerial: Math.round(aerialScore),
  };
}

function buildTactical(s: NormalizedStats, position: string | null): TacticalBlock {
  const isDefensive = /defender|back|cb|lb|rb|wb/i.test(position ?? "");
  const positioningScore = clamp(isDefensive
    ? (s.clearances / Math.max(s.appearances, 1)) * 8 + 40
    : (s.keyPasses / Math.max(s.appearances, 1)) * 8 + 40,
  );
  const decisionScore = clamp(s.passAccuracy * 0.5 + 30);
  const defensiveAwarenessScore = clamp((s.interceptions + s.tackles) / Math.max(s.appearances, 1) * 7 + 30);
  const transitionScore = clamp((s.dribblesSuccess + s.keyPasses) / Math.max(s.appearances, 1) * 5 + 35);
  const flexibilityScore = 60;
  const roleDisciplineScore = clamp(s.rating > 0 ? s.rating * 0.85 : 55);
  const overall = clamp(
    positioningScore * 0.2 + decisionScore * 0.2 + defensiveAwarenessScore * 0.2 +
    transitionScore * 0.15 + flexibilityScore * 0.1 + roleDisciplineScore * 0.15,
  );

  return {
    overall: Math.round(overall),
    positioning: Math.round(positioningScore),
    decisionMaking: Math.round(decisionScore),
    defensiveAwareness: Math.round(defensiveAwarenessScore),
    transitionImpact: Math.round(transitionScore),
    tacticalFlexibility: flexibilityScore,
    roleDiscipline: Math.round(roleDisciplineScore),
    bestRole: position ?? "Unknown",
    bestSystem: "4-3-3",
  };
}

function buildMarket(player: SportmonksPlayer["player"]): MarketBlock {
  const mv = player.market_value ?? null;
  return {
    currentValue: mv,
    estimatedTransferValue: mv,
    salaryEstimateAnnual: mv ? Math.round(mv * 0.08) : null,
    liquidity: scoreBand(mv ? Math.min(100, mv / 1_000_000) : 30, "Liquidez", "Estimativa de liquidez de mercado."),
    valueRetention: scoreBand(60, "Estável", "Retenção de valor estimada."),
    contractPressure: scoreBand(
      player.contract_until
        ? clamp(100 - (new Date(player.contract_until).getFullYear() - new Date().getFullYear()) * 20)
        : 50,
      "Contrato",
      "Pressão contratual estimada.",
    ),
  };
}

function buildRisk(s: NormalizedStats, age: number | null): RiskBlock {
  const cardRisk = clamp((s.yellowCards + s.redCards * 3) / Math.max(s.appearances, 1) * 30);
  const availabilityRisk = clamp(100 - (s.minutesPlayed / Math.max(s.appearances * 90, 1)) * 100);
  const ageRisk = age ? clamp((age - 28) * 5 + 30) : 40;
  const overallScore = clamp((cardRisk + availabilityRisk + ageRisk) / 3);

  const overall = riskBand(overallScore);
  return {
    overall: scoreBand(overallScore, overall.label, overall.summary),
    physical: scoreBand(availabilityRisk, ...Object.values(riskBand(availabilityRisk)) as [string, string]),
    tactical: scoreBand(cardRisk, ...Object.values(riskBand(cardRisk)) as [string, string]),
    financial: scoreBand(40, "Moderado", "Risco financeiro estimado."),
    availability: scoreBand(availabilityRisk, ...Object.values(riskBand(availabilityRisk)) as [string, string]),
    volatility: scoreBand(cardRisk, ...Object.values(riskBand(cardRisk)) as [string, string]),
  };
}

function buildProjection(s: NormalizedStats, technical: TechnicalBlock, age: number | null): ProjectionBlock {
  const current = technical.overall;
  const growthFactor = age ? Math.max(0, 1 - (age - 22) * 0.04) : 0.5;
  const next = clamp(current + growthFactor * 5);
  const peak = clamp(current + growthFactor * 12);
  const growthIndex = clamp(growthFactor * 100);

  const band = ratingBand(peak);
  return {
    currentOverall: current,
    nextSeasonOverall: Math.round(next),
    expectedPeakOverall: Math.round(peak),
    growthIndex: Math.round(growthIndex),
    ceilingLabel: band.label,
    developmentCurve: growthFactor > 0.6 ? "accelerating" : growthFactor > 0.3 ? "steady" : "plateau",
    resaleOutlook: scoreBand(growthIndex, band.label, "Perspectiva de revenda baseada em projeção de desempenho."),
  };
}

function buildDna(s: NormalizedStats, position: string | null): PlayerIntelligenceDna {
  const goalsPerGame = s.goals / Math.max(s.appearances, 1);
  const assistsPerGame = s.assists / Math.max(s.appearances, 1);
  const defensivePerGame = (s.tackles + s.interceptions) / Math.max(s.appearances, 1);
  const isForward = /forward|striker|winger|cf|lw|rw/i.test(position ?? "");
  const archetype = isForward
    ? goalsPerGame > 0.5 ? "Finalizador" : "Criador"
    : defensivePerGame > 3 ? "Destruidor" : "Construtor";

  return {
    archetype,
    profileLabel: `${archetype} — ${position ?? "Posição não informada"}`,
    dominantTraits: [
      goalsPerGame > 0.4 ? "Finalizador clínico" : null,
      assistsPerGame > 0.3 ? "Assistidor frequente" : null,
      s.passAccuracy > 85 ? "Distribuição precisa" : null,
      defensivePerGame > 3 ? "Pressão alta" : null,
    ].filter((t): t is string => t !== null),
    traits: [
      { key: "progression", label: "Progressão", value: clamp(goalsPerGame * 80 + assistsPerGame * 50), interpretation: "Contribuição ofensiva por partida." },
      { key: "pressing", label: "Pressing", value: clamp(defensivePerGame * 15 + 30), interpretation: "Intensidade defensiva e recuperação de bola." },
      { key: "creativity", label: "Criatividade", value: clamp((s.keyPasses / Math.max(s.appearances, 1)) * 10 + s.xA * 5), interpretation: "Geração de oportunidades de gol." },
      { key: "duel_dominance", label: "Domínio de Duelos", value: clamp((s.duelsWon / Math.max(s.duelsTotal, 1)) * 100), interpretation: "Taxa de vitória em disputas." },
    ],
  };
}

function buildFieldIntelligence(): FieldIntelligence {
  return {
    isMocked: true,
    heatmap: [],
    passes: [],
    shots: [],
    defensiveActions: [],
  };
}

function buildContext(): ContextBlock {
  return {
    sourceAnalysisId: null,
    sourceAnalysisType: "sportmonks_import",
    sourceUpdatedAt: new Date().toISOString(),
    competitionLevel: "Unknown",
    sampleConfidence: 0.6,
    seasonTrend: [],
  };
}

function buildNarrative(
  name: string,
  technical: TechnicalBlock,
  physical: PhysicalBlock,
  s: NormalizedStats,
): NarrativeBlock {
  const strengths: string[] = [];
  const concerns: string[] = [];

  if (technical.passing > 70) strengths.push("Distribuição de bola acima da média.");
  if (technical.creativity > 65) strengths.push("Alta capacidade criativa e geração de jogadas.");
  if (physical.stamina > 65) strengths.push("Resistência física consistente.");
  if (s.passAccuracy < 75) concerns.push("Precisão de passe abaixo da média.");
  if (s.yellowCards / Math.max(s.appearances, 1) > 0.3) concerns.push("Alto índice de cartões amarelos.");
  if (s.minutesPlayed / Math.max(s.appearances, 1) < 60) concerns.push("Baixo aproveitamento de minutos por partida.");

  return {
    headline: `${name} — Perfil gerado via Sportmonks`,
    executiveSummary: `Análise técnica baseada em dados estatísticos importados do Sportmonks. Confiança: média.`,
    strengths: strengths.length > 0 ? strengths : ["Dados insuficientes para pontos fortes detalhados."],
    concerns: concerns.length > 0 ? concerns : ["Nenhuma preocupação crítica identificada nos dados disponíveis."],
    developmentFocus: ["Validar dados com observação técnica presencial."],
    aiInsights: ["Perfil importado automaticamente. Revisão humana recomendada."],
  };
}

function buildSummary(
  technical: TechnicalBlock,
  physical: PhysicalBlock,
  risk: RiskBlock,
  projection: ProjectionBlock,
): PlayerIntelligenceSummary {
  const level = technical.overall;
  const { label, summary } = ratingBand(level);

  const status: PlayerIntelligenceSummary["status"] =
    level >= 80 ? "elite_target"
    : level >= 65 ? "priority_watch"
    : level >= 50 ? "monitor"
    : "data_gap";

  return {
    status,
    recommendation: `Jogador classificado como ${label}. Análise via dados Sportmonks.`,
    confidence: 0.6,
    summary,
    decisionWindow: "Curto prazo",
    currentLevel: scoreBand(level, label, summary),
    upside: scoreBand(projection.expectedPeakOverall, ratingBand(projection.expectedPeakOverall).label, "Teto projetado."),
    risk: risk.overall,
    marketOpportunity: scoreBand(60, "Moderada", "Oportunidade de mercado estimada."),
  };
}

// ---------------------------------------------------------------------------
// mapToPlayerIntelligence
// ---------------------------------------------------------------------------

export function mapToPlayerIntelligence(raw: SportmonksPlayer): PlayerIntelligenceProfile {
  const { player, stats } = raw;
  const normalized = normalizeStats(stats);
  const age = deriveAge(player.date_of_birth);
  const position = player.detailedPosition?.name ?? player.position?.name ?? null;

  const technical = buildTechnical(normalized);
  const physical = buildPhysical(normalized);
  const tactical = buildTactical(normalized, position);
  const market = buildMarket(player);
  const risk = buildRisk(normalized, age);
  const projection = buildProjection(normalized, technical, age);
  const dna = buildDna(normalized, position);
  const narrative = buildNarrative(player.display_name, technical, physical, normalized);
  const summary = buildSummary(technical, physical, risk, projection);

  const identity = {
    id: String(player.id),
    slug: player.display_name.toLowerCase().replace(/\s+/g, "-"),
    name: player.display_name,
    age,
    nationality: player.nationality?.name ?? null,
    club: player.team?.name ?? null,
    league: player.league?.name ?? null,
    primaryPosition: position,
    secondaryPositions: [],
    preferredFoot: player.foot ?? null,
    heightCm: player.height ?? null,
    weightKg: player.weight ?? null,
    imagePath: player.image_path ?? null,
  };

  return {
    generatedAt: new Date().toISOString(),
    identity,
    summary,
    technical,
    physical,
    tactical,
    market,
    risk,
    projection,
    dna,
    fieldIntelligence: buildFieldIntelligence(),
    context: buildContext(),
    narrative,
    executiveSnapshot: summary,
    soccerMindDNA: dna,
  };
}
