// ---------------------------------------------------------------------------
// analysis-engine — shared types
// ---------------------------------------------------------------------------

/** Internal normalized player stat model used across the engine */
export interface NormalizedPlayerStats {
  playerId: string;
  playerName: string;
  teamId: string | null;
  teamName: string | null;
  position: string | null;
  age: number | null;
  season: string;

  // Core stats
  goals: number;
  assists: number;
  shots: number;
  shotsOnTarget: number;
  keyPasses: number;
  passes: number;
  passAccuracy: number;

  // xStats
  xG: number;
  xA: number;

  // Defensive
  tackles: number;
  interceptions: number;
  pressures: number;

  // Physical
  minutesPlayed: number;
  appearances: number;
  rating: number;

  // Computed (per game)
  goalsPerGame: number;
  assistsPerGame: number;
  xGPerGame: number;
  xAPerGame: number;
  keyPassesPerGame: number;
}

/** Dimension winner: which player won this category */
export type Winner = "A" | "B" | "tie";

/** Per-dimension comparison entry */
export interface DimensionResult {
  winner: Winner;
  valueA: number;
  valueB: number;
  delta: number;
  label: string;
}

/** Full output of comparePlayers() */
export interface PlayerComparisonOutput {
  playerA: NormalizedPlayerStats;
  playerB: NormalizedPlayerStats;

  dimensions: {
    scoring: DimensionResult;
    creation: DimensionResult;
    defending: DimensionResult;
    passing: DimensionResult;
    physicality: DimensionResult;
    efficiency: DimensionResult;
    involvement: DimensionResult;
  };

  betterScorer: Winner;
  betterCreator: Winner;
  betterOverall: Winner;

  scoreA: number;
  scoreB: number;

  analysis: string;
}

/** Mock player for offline/dev use */
export interface MockPlayer {
  id: string;
  name: string;
  teamId: string;
  teamName: string;
  position: string;
  age: number;
  stats: Omit<NormalizedPlayerStats, "playerId" | "playerName" | "teamId" | "teamName" | "position" | "age" | "season" | "goalsPerGame" | "assistsPerGame" | "xGPerGame" | "xAPerGame" | "keyPassesPerGame">;
}
