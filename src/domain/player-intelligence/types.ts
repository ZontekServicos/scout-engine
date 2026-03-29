export interface ScoreBand {
  score: number;
  label: string;
  summary: string;
}

export interface PlayerIdentity {
  id: string;
  slug: string | null;
  name: string;
  age: number | null;
  nationality: string | null;
  club: string | null;
  league: string | null;
  primaryPosition: string | null;
  secondaryPositions: string[];
  preferredFoot: string | null;
  heightCm: number | null;
  weightKg: number | null;
  imagePath: string | null;
}

export interface ExecutiveSnapshot {
  status: "elite_target" | "priority_watch" | "monitor" | "data_gap";
  recommendation: string;
  confidence: number;
  summary: string;
  decisionWindow: string;
  currentLevel: ScoreBand;
  upside: ScoreBand;
  risk: ScoreBand;
  marketOpportunity: ScoreBand;
}

export interface TechnicalBlock {
  overall: number;
  ballStriking: number;
  passing: number;
  carrying: number;
  firstTouch: number;
  creativity: number;
  defending: number;
  breakdown: Record<string, number>;
}

export interface PhysicalBlock {
  overall: number;
  acceleration: number;
  sprintSpeed: number;
  agility: number;
  balance: number;
  strength: number;
  stamina: number;
  aerial: number;
}

export interface TacticalBlock {
  overall: number;
  positioning: number;
  decisionMaking: number;
  defensiveAwareness: number;
  transitionImpact: number;
  tacticalFlexibility: number;
  roleDiscipline: number;
  bestRole: string;
  bestSystem: string;
}

export interface MarketBlock {
  currentValue: number | null;
  estimatedTransferValue: number | null;
  salaryEstimateAnnual: number | null;
  liquidity: ScoreBand;
  valueRetention: ScoreBand;
  contractPressure: ScoreBand;
}

export interface RiskBlock {
  overall: ScoreBand;
  physical: ScoreBand;
  tactical: ScoreBand;
  financial: ScoreBand;
  availability: ScoreBand;
  volatility: ScoreBand;
}

export interface ProjectionBlock {
  currentOverall: number;
  nextSeasonOverall: number;
  expectedPeakOverall: number;
  growthIndex: number;
  ceilingLabel: string;
  developmentCurve: "accelerating" | "steady" | "plateau";
  resaleOutlook: ScoreBand;
}

export interface SoccerMindDNATrait {
  key: string;
  label: string;
  value: number;
  interpretation: string;
}

export interface SoccerMindDNA {
  archetype: string;
  profileLabel: string;
  dominantTraits: string[];
  traits: SoccerMindDNATrait[];
}

export interface FieldZoneIntensity {
  x: number;
  y: number;
  width: number;
  height: number;
  intensity: number;
}

export interface FieldEventPoint {
  x: number;
  y: number;
  endX?: number;
  endY?: number;
  outcome?: "success" | "fail" | "goal" | "saved" | "blocked" | "won" | "lost";
  value?: number;
  label?: string;
}

export interface FieldIntelligence {
  isMocked: boolean;
  heatmap: FieldZoneIntensity[];
  passes: FieldEventPoint[];
  shots: FieldEventPoint[];
  defensiveActions: FieldEventPoint[];
}

export interface SeasonTrendPoint {
  season: string;
  overall: number;
  marketValue: number | null;
  riskScore: number;
}

export interface ContextBlock {
  sourceAnalysisId: string | null;
  sourceAnalysisType: string | null;
  sourceUpdatedAt: string | null;
  competitionLevel: string;
  sampleConfidence: number;
  seasonTrend: SeasonTrendPoint[];
}

export interface NarrativeBlock {
  headline: string;
  executiveSummary: string;
  strengths: string[];
  concerns: string[];
  developmentFocus: string[];
  aiInsights: string[];
}

export interface PlayerIntelligenceProfile {
  generatedAt: string;
  identity: PlayerIdentity;
  executiveSnapshot: ExecutiveSnapshot;
  technical: TechnicalBlock;
  physical: PhysicalBlock;
  tactical: TacticalBlock;
  market: MarketBlock;
  risk: RiskBlock;
  projection: ProjectionBlock;
  soccerMindDNA: SoccerMindDNA;
  fieldIntelligence: FieldIntelligence;
  context: ContextBlock;
  narrative: NarrativeBlock;
}
