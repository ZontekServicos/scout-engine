import type {
  NormalizedPlayerStats,
  Winner,
  DimensionResult,
  PlayerComparisonOutput,
} from "../types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safe(n: number, d: number): number {
  return d > 0 ? n / d : 0;
}

function clamp(v: number, min = 0, max = 100): number {
  return Math.min(max, Math.max(min, v));
}

function compareValues(a: number, b: number, threshold = 0.04): Winner {
  const diff = a - b;
  const base = Math.max(Math.abs(a), Math.abs(b), 0.01);
  if (Math.abs(diff) / base < threshold) return "tie";
  return diff > 0 ? "A" : "B";
}

function makeDimension(
  a: number,
  b: number,
  label: string,
  threshold?: number,
): DimensionResult {
  return {
    winner: compareValues(a, b, threshold),
    valueA: Math.round(a * 100) / 100,
    valueB: Math.round(b * 100) / 100,
    delta: Math.round((a - b) * 100) / 100,
    label,
  };
}

// ---------------------------------------------------------------------------
// Composite dimension scores
// ---------------------------------------------------------------------------

function scoringScore(p: NormalizedPlayerStats): number {
  const apps = Math.max(p.appearances, 1);
  const shotConversion = safe(p.goals, Math.max(p.shots, 1));
  const xGEfficiency = p.xG > 0 ? safe(p.goals, p.xG) : shotConversion;
  return clamp(
    p.goalsPerGame * 40 +
    xGEfficiency * 25 +
    p.xGPerGame * 20 +
    safe(p.shotsOnTarget, Math.max(p.shots, 1)) * 15,
  );
}

function creationScore(p: NormalizedPlayerStats): number {
  return clamp(
    p.assistsPerGame * 35 +
    p.xAPerGame * 25 +
    p.keyPassesPerGame * 30 +
    safe(p.passes, Math.max(p.appearances, 1)) * 0.05,
  );
}

function defendingScore(p: NormalizedPlayerStats): number {
  const apps = Math.max(p.appearances, 1);
  return clamp(
    safe(p.tackles, apps) * 20 +
    safe(p.interceptions, apps) * 25 +
    safe(p.pressures, apps) * 0.5,
  );
}

function passingScore(p: NormalizedPlayerStats): number {
  return clamp(
    p.passAccuracy * 0.5 +
    p.keyPassesPerGame * 20 +
    safe(p.passes, Math.max(p.appearances, 1)) * 0.03,
  );
}

function physicalityScore(p: NormalizedPlayerStats): number {
  const apps = Math.max(p.appearances, 1);
  const minutesPerGame = safe(p.minutesPlayed, apps);
  return clamp(minutesPerGame * 0.7 + safe(p.appearances, 38) * 30);
}

function efficiencyScore(p: NormalizedPlayerStats): number {
  const shotAcc = safe(p.shotsOnTarget, Math.max(p.shots, 1));
  const passAcc = p.passAccuracy / 100;
  const goalContribution = (p.goalsPerGame + p.assistsPerGame) / 2;
  return clamp(shotAcc * 30 + passAcc * 30 + goalContribution * 40);
}

function involvementScore(p: NormalizedPlayerStats): number {
  return clamp(
    p.goalsPerGame * 20 +
    p.assistsPerGame * 20 +
    p.keyPassesPerGame * 15 +
    p.xGPerGame * 15 +
    p.xAPerGame * 15 +
    p.rating * 1.5,
  );
}

// ---------------------------------------------------------------------------
// Overall score — used for betterOverall
// ---------------------------------------------------------------------------
function overallScore(p: NormalizedPlayerStats): number {
  return (
    scoringScore(p) * 0.25 +
    creationScore(p) * 0.2 +
    defendingScore(p) * 0.15 +
    passingScore(p) * 0.15 +
    physicalityScore(p) * 0.1 +
    efficiencyScore(p) * 0.1 +
    involvementScore(p) * 0.05
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Compare two normalized players across multiple dimensions.
 * Returns a structured result with per-dimension analysis and an analysis string.
 */
export function comparePlayers(
  playerA: NormalizedPlayerStats,
  playerB: NormalizedPlayerStats,
): PlayerComparisonOutput {
  const scoring   = makeDimension(scoringScore(playerA),     scoringScore(playerB),     "Poder de gol");
  const creation  = makeDimension(creationScore(playerA),    creationScore(playerB),    "Criação de jogadas");
  const defending = makeDimension(defendingScore(playerA),   defendingScore(playerB),   "Atividade defensiva");
  const passing   = makeDimension(passingScore(playerA),     passingScore(playerB),     "Qualidade de passe");
  const phys      = makeDimension(physicalityScore(playerA), physicalityScore(playerB), "Presença física");
  const eff       = makeDimension(efficiencyScore(playerA),  efficiencyScore(playerB),  "Eficiência");
  const involve   = makeDimension(involvementScore(playerA), involvementScore(playerB), "Envolvimento no jogo");

  const dimensions = { scoring, creation, defending, passing, physicality: phys, efficiency: eff, involvement: involve };

  // Count wins
  const wins = (player: "A" | "B") =>
    Object.values(dimensions).filter(d => d.winner === player).length;

  const winsA = wins("A");
  const winsB = wins("B");

  const scoreA = Math.round(overallScore(playerA) * 100) / 100;
  const scoreB = Math.round(overallScore(playerB) * 100) / 100;

  const betterScorer: Winner = scoring.winner;
  const betterCreator: Winner = creation.winner;
  const betterOverall: Winner =
    winsA > winsB ? "A" : winsB > winsA ? "B" : compareValues(scoreA, scoreB, 0.02);

  return {
    playerA,
    playerB,
    dimensions,
    betterScorer,
    betterCreator,
    betterOverall,
    scoreA,
    scoreB,
    analysis: "",  // populated by report generator
  };
}
