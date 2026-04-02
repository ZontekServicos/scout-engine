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
  PlayerIntelligenceDnaTrait,
  FieldIntelligence,
  ContextBlock,
  NarrativeBlock,
  PlayerIntelligenceSummary,
} from "../../../domain/player-intelligence/types";
import type { SportmonksPlayerDetails } from "../sportmonks.types";
import type { ComputedMetrics } from "./compute-metrics";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function clamp(v: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, v));
}

function band(score: number, label: string, summary: string): ScoreBand {
  return { score: clamp(Math.round(score)), label, summary };
}

function ratingLabel(score: number): string {
  if (score >= 85) return "Elite";
  if (score >= 72) return "Alto";
  if (score >= 58) return "Médio";
  if (score >= 42) return "Abaixo da média";
  return "Baixo";
}

function ratingLabel_risk(score: number): string {
  if (score <= 20) return "Mínimo";
  if (score <= 40) return "Baixo";
  if (score <= 60) return "Moderado";
  if (score <= 78) return "Elevado";
  return "Crítico";
}

function ratingSummary(score: number): string {
  const label = ratingLabel(score);
  const map: Record<string, string> = {
    Elite: "Desempenho de nível elite. Candidato prioritário.",
    Alto: "Desempenho acima da média. Perfil consistente.",
    Médio: "Desempenho dentro da média. Potencial a desenvolver.",
    "Abaixo da média": "Performance abaixo do esperado. Avaliação criteriosa necessária.",
    Baixo: "Dados insuficientes ou desempenho crítico.",
  };
  return map[label] ?? "Sem resumo disponível.";
}

function riskSummary(score: number): string {
  const label = ratingLabel_risk(score);
  const map: Record<string, string> = {
    Mínimo: "Risco controlado em todas as dimensões.",
    Baixo: "Risco gerenciável. Perfil estável.",
    Moderado: "Risco presente. Monitoramento recomendado.",
    Elevado: "Risco significativo. Análise aprofundada necessária.",
    Crítico: "Risco crítico identificado. Decisão deve ser cautelosa.",
  };
  return map[label] ?? "";
}

function deriveAge(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  if (
    today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())
  ) {
    age--;
  }
  return age;
}

// ---------------------------------------------------------------------------
// Block builders
// ---------------------------------------------------------------------------
function buildTechnical(m: ComputedMetrics): TechnicalBlock {
  const { raw: r, perGame: pg, derived: d, blocks: b } = m;

  return {
    overall: b.technical,
    ballStriking: clamp(Math.round(d.attackingImpact * 0.9)),
    passing: clamp(Math.round(r.passAccuracyPct * 0.7 + pg.keyPasses * 4)),
    carrying: clamp(Math.round(d.transitionScore * 0.85)),
    firstTouch: clamp(Math.round(r.passAccuracyPct * 0.55 + 25)),
    creativity: clamp(Math.round(d.involvementScore * 0.9 + pg.keyPasses * 3)),
    defending: clamp(Math.round(d.defensiveActivity * 0.75)),
    breakdown: {
      goals_per_game: +pg.goals.toFixed(2),
      assists_per_game: +pg.assists.toFixed(2),
      xG_per_game: +pg.xG.toFixed(2),
      xA_per_game: +pg.xA.toFixed(2),
      xG_chain_per_game: +pg.xGChain.toFixed(2),
      xG_buildup_per_game: +pg.xGBuildup.toFixed(2),
      key_passes_per_game: +pg.keyPasses.toFixed(2),
      progressive_passes_per_game: +pg.progressivePasses.toFixed(2),
      pass_accuracy_pct: r.passAccuracyPct,
      shot_accuracy_pct: r.shotsTotal > 0 ? +(r.shotsOnTarget / r.shotsTotal * 100).toFixed(1) : 0,
      dribble_success_rate: r.dribblesAttempted > 0 ? +(r.dribblesSuccess / r.dribblesAttempted * 100).toFixed(1) : 0,
    },
  };
}

function buildPhysical(m: ComputedMetrics): PhysicalBlock {
  const { raw: r, perGame: pg, blocks: b } = m;

  const aerialWinRate = r.aerialDuelsTotal > 0 ? r.aerialDuelsWon / r.aerialDuelsTotal : 0.5;
  const duelWinRate = r.duelsTotal > 0 ? r.duelsWon / r.duelsTotal : 0.5;

  return {
    overall: b.physical,
    acceleration: clamp(Math.round(pg.sprints * 0.85 + 25)),
    sprintSpeed: clamp(Math.round(pg.sprints * 0.9 + 20)),
    agility: clamp(Math.round(pg.sprints * 0.75 + pg.progressiveCarries * 2 + 20)),
    balance: clamp(Math.round(duelWinRate * 70 + 20)),
    strength: clamp(Math.round(duelWinRate * 60 + aerialWinRate * 30 + 10)),
    stamina: clamp(Math.round(pg.distanceCovered * 0.85 + 15)),
    aerial: clamp(Math.round(aerialWinRate * 90 + 5)),
  };
}

function buildTactical(m: ComputedMetrics): TacticalBlock {
  const { raw: r, perGame: pg, derived: d, context, blocks: b } = m;
  const pos = context.position;

  const bestRole = resolveBestRole(pos, d);
  const bestSystem = resolveBestSystem(pos, d);

  return {
    overall: b.tactical,
    positioning: clamp(Math.round(d.buildUpScore * 0.5 + d.defensiveActivity * 0.5)),
    decisionMaking: clamp(Math.round(d.decisionScore)),
    defensiveAwareness: clamp(Math.round(d.defensiveActivity * 0.8 + 10)),
    transitionImpact: clamp(Math.round(d.transitionScore)),
    tacticalFlexibility: clamp(Math.round((d.buildUpScore + d.defensiveActivity) / 2)),
    roleDiscipline: clamp(Math.round(d.consistencyScore * 0.8 + d.decisionScore * 0.2)),
    bestRole,
    bestSystem,
  };
}

function resolveBestRole(position: string | null, d: ComputedMetrics["derived"]): string {
  const pos = position?.toLowerCase() ?? "";
  if (/striker|cf|centre.forward/.test(pos)) return d.buildUpScore > 60 ? "False 9" : "Centroavante";
  if (/winger|lw|rw/.test(pos)) return d.transitionScore > 65 ? "Extremo de Ruptura" : "Extremo de Combinação";
  if (/attacking.mid|cam/.test(pos)) return d.involvementScore > 65 ? "Meia Criativo" : "Segundo Atacante";
  if (/central.mid|cm|box/.test(pos)) return d.defensiveActivity > 55 ? "Box-to-Box" : "Meia Construtor";
  if (/defensive.mid|cdm|dm/.test(pos)) return d.buildUpScore > 60 ? "Pivô Construtor" : "Volante Destruidor";
  if (/full.back|lb|rb/.test(pos)) return d.attackingImpact > 50 ? "Lateral Ofensivo" : "Lateral Defensivo";
  if (/centre.back|cb/.test(pos)) return d.buildUpScore > 55 ? "Zagueiro Construtor" : "Zagueiro Clássico";
  return position ?? "Indefinido";
}

function resolveBestSystem(position: string | null, d: ComputedMetrics["derived"]): string {
  const pos = position?.toLowerCase() ?? "";
  if (/striker|cf/.test(pos)) return d.buildUpScore > 60 ? "4-3-3" : "4-4-2";
  if (/winger/.test(pos)) return "4-3-3";
  if (/attacking.mid|cam/.test(pos)) return "4-2-3-1";
  if (/central.mid|cm/.test(pos)) return d.defensiveActivity > 55 ? "4-3-3" : "3-5-2";
  if (/defensive.mid|cdm/.test(pos)) return "4-2-3-1";
  if (/full.back|lb|rb/.test(pos)) return d.attackingImpact > 50 ? "3-4-3" : "4-4-2";
  if (/centre.back|cb/.test(pos)) return d.buildUpScore > 55 ? "4-3-3" : "4-4-2";
  return "4-3-3";
}

function buildMarket(player: SportmonksPlayerDetails): MarketBlock {
  const mv = player.market_value ?? null;
  const contractYearsLeft = player.contract_until
    ? Math.max(0, new Date(player.contract_until).getFullYear() - new Date().getFullYear())
    : null;

  const liquidityScore = mv ? clamp(Math.log10(mv / 100_000 + 1) * 40) : 25;
  const contractPressureScore = contractYearsLeft !== null
    ? clamp(100 - contractYearsLeft * 22)
    : 50;

  return {
    currentValue: mv,
    estimatedTransferValue: mv,
    salaryEstimateAnnual: mv ? Math.round(mv * 0.07) : null,
    liquidity: band(liquidityScore, liquidityScore > 60 ? "Alta" : liquidityScore > 40 ? "Média" : "Baixa", "Liquidez estimada no mercado de transferências."),
    valueRetention: band(55, "Estável", "Retenção de valor estimada baseada em dados de mercado."),
    contractPressure: band(
      contractPressureScore,
      ratingLabel_risk(contractPressureScore),
      contractYearsLeft === null
        ? "Contrato não informado."
        : contractYearsLeft <= 1
        ? "Contrato prestes a vencer. Janela de oportunidade."
        : `Contrato válido por ~${contractYearsLeft} ano(s).`,
    ),
  };
}

function buildRisk(m: ComputedMetrics): RiskBlock {
  const { raw: r, blocks: b, context } = m;
  const apps = Math.max(r.appearances, 1);

  const disciplineScore = clamp((r.yellowCards * 8 + r.redCards * 25) / apps * 10);
  const availabilityScore = clamp(100 - (r.minutesPlayed / Math.max(apps * 90, 1)) * 100);
  const injuryScore = clamp(r.gamesMissed > 0 ? r.gamesMissed / (apps + r.gamesMissed) * 100 : 15);
  const ageRiskScore = context.age ? clamp((context.age - 28) * 4 + 25) : 35;

  const overall = b.riskScore;

  return {
    overall: band(overall, ratingLabel_risk(overall), riskSummary(overall)),
    physical: band(availabilityScore, ratingLabel_risk(availabilityScore), "Risco físico baseado em disponibilidade e minutos."),
    tactical: band(disciplineScore, ratingLabel_risk(disciplineScore), "Risco disciplinar e comportamental."),
    financial: band(40, "Moderado", "Risco financeiro estimado."),
    availability: band(
      clamp((availabilityScore + injuryScore) / 2),
      ratingLabel_risk(clamp((availabilityScore + injuryScore) / 2)),
      "Disponibilidade combinada: minutos e histórico de lesões.",
    ),
    volatility: band(disciplineScore, ratingLabel_risk(disciplineScore), "Volatilidade comportamental estimada."),
  };
}

function buildProjection(m: ComputedMetrics): ProjectionBlock {
  const { context, blocks: b } = m;
  const age = context.age;
  const current = b.technical;
  const growthFactor = age ? Math.max(0, 1 - (age - 22) * 0.045) : 0.5;

  const next = clamp(current + growthFactor * 6);
  const peak = clamp(current + growthFactor * 14);
  const growthIndex = clamp(growthFactor * 100);

  const curve: ProjectionBlock["developmentCurve"] =
    growthFactor > 0.65 ? "accelerating"
    : growthFactor > 0.3 ? "steady"
    : "plateau";

  const ceilingLabel = ratingLabel(peak);

  return {
    currentOverall: current,
    nextSeasonOverall: Math.round(next),
    expectedPeakOverall: Math.round(peak),
    growthIndex: Math.round(growthIndex),
    ceilingLabel,
    developmentCurve: curve,
    resaleOutlook: band(growthIndex, ceilingLabel, "Perspectiva de revenda baseada em trajetória de desenvolvimento."),
  };
}

function buildDna(m: ComputedMetrics, position: string | null): PlayerIntelligenceDna {
  const { derived: d, perGame: pg } = m;

  const archetype = resolveArchetype(position, d);
  const dominantTraits = resolveDominantTraits(d, pg);

  const traits: PlayerIntelligenceDnaTrait[] = [
    { key: "attacking_impact", label: "Impacto Ofensivo", value: d.attackingImpact, interpretation: "Contribuição direta e indireta para gols." },
    { key: "build_up", label: "Construção", value: d.buildUpScore, interpretation: "Qualidade na distribuição e progressão da bola." },
    { key: "transition", label: "Transição", value: d.transitionScore, interpretation: "Capacidade de progressão vertical com bola." },
    { key: "defensive_activity", label: "Atividade Defensiva", value: d.defensiveActivity, interpretation: "Pressão, recuperação e ações defensivas." },
    { key: "decision_making", label: "Tomada de Decisão", value: d.decisionScore, interpretation: "Qualidade das escolhas sob pressão." },
    { key: "efficiency", label: "Eficiência", value: d.efficiencyScore, interpretation: "Conversão de oportunidades em resultados." },
    { key: "consistency", label: "Consistência", value: d.consistencyScore, interpretation: "Regularidade de desempenho ao longo da temporada." },
    { key: "involvement", label: "Envolvimento", value: d.involvementScore, interpretation: "Participação nas cadeias ofensivas da equipe." },
  ];

  return {
    archetype,
    profileLabel: `${archetype} — ${position ?? "Posição não informada"}`,
    dominantTraits,
    traits,
  };
}

function resolveArchetype(position: string | null, d: ComputedMetrics["derived"]): string {
  const pos = position?.toLowerCase() ?? "";
  if (/striker|cf/.test(pos)) return d.efficiencyScore > 65 ? "Finalizador Clínico" : "Atacante de Área";
  if (/winger/.test(pos)) return d.transitionScore > 65 ? "Extremo Explosivo" : "Extremo Técnico";
  if (/cam|attacking/.test(pos)) return d.involvementScore > 60 ? "Criador de Jogo" : "Meia Avançado";
  if (/cm|central.mid/.test(pos)) return d.defensiveActivity > 55 ? "Box-to-Box" : "Construtor";
  if (/cdm|defensive/.test(pos)) return d.buildUpScore > 60 ? "Pivô" : "Volante";
  if (/lb|rb|full/.test(pos)) return d.attackingImpact > 50 ? "Lateral Dinâmico" : "Lateral Equilibrado";
  if (/cb|centre.back/.test(pos)) return d.buildUpScore > 55 ? "Líbero" : "Zagueiro";
  if (d.attackingImpact > d.defensiveActivity + 20) return "Perfil Ofensivo";
  if (d.defensiveActivity > d.attackingImpact + 20) return "Perfil Defensivo";
  return "Perfil Equilibrado";
}

function resolveDominantTraits(d: ComputedMetrics["derived"], pg: PerGameRates): string[] {
  const traits: string[] = [];
  if (d.attackingImpact >= 70) traits.push("Decisivo ofensivamente");
  if (d.buildUpScore >= 68) traits.push("Distribuição de alta qualidade");
  if (d.transitionScore >= 65) traits.push("Explosão em transição");
  if (d.defensiveActivity >= 65) traits.push("Pressão intensa");
  if (d.efficiencyScore >= 70) traits.push("Alta eficiência de conversão");
  if (d.consistencyScore >= 72) traits.push("Desempenho consistente");
  if (d.involvementScore >= 65) traits.push("Alta participação ofensiva");
  if (pg.keyPasses >= 2.5) traits.push("Criação frequente de chances");
  return traits.slice(0, 4);
}

type PerGameRates = ComputedMetrics["perGame"];

function buildFieldIntelligence(): FieldIntelligence {
  return { isMocked: true, heatmap: [], passes: [], shots: [], defensiveActions: [] };
}

function buildContext(): ContextBlock {
  return {
    sourceAnalysisId: null,
    sourceAnalysisType: "sportmonks_pipeline",
    sourceUpdatedAt: new Date().toISOString(),
    competitionLevel: "Unknown",
    sampleConfidence: 0.65,
    seasonTrend: [],
  };
}

function buildNarrative(
  name: string,
  technical: TechnicalBlock,
  physical: PhysicalBlock,
  m: ComputedMetrics,
): NarrativeBlock {
  const { derived: d, perGame: pg } = m;
  const strengths: string[] = [];
  const concerns: string[] = [];

  if (d.attackingImpact >= 68) strengths.push("Alto impacto ofensivo: contribuição direta e indireta para gols.");
  if (d.buildUpScore >= 65) strengths.push("Construção de jogo sólida com distribuição qualificada.");
  if (d.defensiveActivity >= 65) strengths.push("Intensa atividade defensiva e pressão.");
  if (d.efficiencyScore >= 70) strengths.push("Eficiência elevada na conversão de oportunidades.");
  if (d.consistencyScore >= 70) strengths.push("Regularidade de desempenho ao longo da temporada.");
  if (pg.progressivePasses >= 3) strengths.push("Alta frequência de passes progressivos — rompe linhas com consistência.");

  if (d.attackingImpact < 35) concerns.push("Contribuição ofensiva abaixo da média esperada.");
  if (m.raw.passAccuracyPct < 72) concerns.push("Precisão de passe insuficiente — risco de perda de posse.");
  if (m.raw.yellowCards / Math.max(m.raw.appearances, 1) > 0.3) concerns.push("Índice de cartões amarelos elevado.");
  if (m.blocks.riskScore > 60) concerns.push("Perfil de risco elevado: disponibilidade ou disciplina comprometidas.");
  if (d.involvementScore < 30) concerns.push("Baixo envolvimento nas cadeias ofensivas da equipe.");

  const status = resolveStatus(technical.overall);

  return {
    headline: `${name} — Perfil de Inteligência SoccerMind`,
    executiveSummary: `${name} é classificado como ${ratingLabel(technical.overall)}. ${ratingSummary(technical.overall)} Análise gerada via pipeline Sportmonks. Confiança: média-alta.`,
    strengths: strengths.length > 0 ? strengths : ["Dados insuficientes para pontos fortes detalhados."],
    concerns: concerns.length > 0 ? concerns : ["Nenhuma preocupação crítica identificada."],
    developmentFocus: resolveDevelopmentFocus(d),
    aiInsights: [
      `Perfil de DNA: ${resolveArchetype(m.context.position, d)}.`,
      `Teto projetado: ${ratingLabel(m.blocks.projectionScore)} (${m.blocks.projectionScore}/100).`,
      status === "elite_target"
        ? "Candidato de alta prioridade. Janela de decisão imediata."
        : status === "priority_watch"
        ? "Perfil a monitorar ativamente."
        : "Recomenda-se validação com observação presencial.",
    ],
  };
}

function resolveDevelopmentFocus(d: ComputedMetrics["derived"]): string[] {
  const focus: string[] = [];
  if (d.efficiencyScore < 50) focus.push("Finalização e conversão de xG.");
  if (d.buildUpScore < 50) focus.push("Qualidade de passe e progressão com bola.");
  if (d.defensiveActivity < 45) focus.push("Pressão e recuperação defensiva.");
  if (d.consistencyScore < 55) focus.push("Regularidade e gestão de minutos.");
  return focus.length > 0 ? focus : ["Manutenção do nível atual e especialização tática."];
}

function resolveStatus(score: number): PlayerIntelligenceSummary["status"] {
  if (score >= 80) return "elite_target";
  if (score >= 65) return "priority_watch";
  if (score >= 48) return "monitor";
  return "data_gap";
}

function buildSummary(
  technical: TechnicalBlock,
  risk: RiskBlock,
  projection: ProjectionBlock,
  m: ComputedMetrics,
): PlayerIntelligenceSummary {
  const score = technical.overall;
  const status = resolveStatus(score);
  const label = ratingLabel(score);
  const summary = ratingSummary(score);

  return {
    status,
    recommendation: `${label} — ${summary}`,
    confidence: 0.65,
    summary,
    decisionWindow: m.context.age && m.context.age >= 30 ? "Imediato" : m.context.age && m.context.age <= 23 ? "Médio prazo" : "Curto prazo",
    currentLevel: band(score, label, summary),
    upside: band(projection.expectedPeakOverall, ratingLabel(projection.expectedPeakOverall), "Teto projetado baseado em trajetória."),
    risk: risk.overall,
    marketOpportunity: band(m.blocks.projectionScore > 60 ? 65 : 45, "Moderada", "Oportunidade estimada de mercado."),
  };
}

// ---------------------------------------------------------------------------
// buildProfile — main export
// ---------------------------------------------------------------------------
export function buildProfile(
  player: SportmonksPlayerDetails,
  metrics: ComputedMetrics,
): PlayerIntelligenceProfile {
  const age = deriveAge(player.date_of_birth);
  const position = player.detailedPosition?.name ?? player.position?.name ?? null;

  const technical    = buildTechnical(metrics);
  const physical     = buildPhysical(metrics);
  const tactical     = buildTactical(metrics);
  const market       = buildMarket(player);
  const risk         = buildRisk(metrics);
  const projection   = buildProjection(metrics);
  const dna          = buildDna(metrics, position);
  const narrative    = buildNarrative(player.display_name, technical, physical, metrics);
  const summary      = buildSummary(technical, risk, projection, metrics);

  const identity = {
    id: String(player.id),
    slug: player.display_name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
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
