import type { SportmonksStat } from "../sportmonks.types";

// ---------------------------------------------------------------------------
// Extended Sportmonks v3 type_id registry
// Confirmed IDs + plausible IDs (to be validated once API access is granted)
// ---------------------------------------------------------------------------
export const SM_TYPE_ID = {
  // Scoring
  GOALS: 52,
  ASSISTS: 79,
  GOALS_CONCEDED: 57,

  // Passing
  PASSES_TOTAL: 80,
  PASSES_ACCURATE: 81,
  PASS_ACCURACY_PCT: 86,
  KEY_PASSES: 117,
  PROGRESSIVE_PASSES: 120,
  LONG_PASSES: 122,
  LONG_PASS_ACCURACY: 123,
  CROSSES: 90,
  CROSS_ACCURACY: 91,

  // Shooting
  SHOTS_TOTAL: 84,
  SHOTS_ON_TARGET: 85,
  SHOTS_BLOCKED: 92,
  XG: 130,
  XA: 131,
  XG_CHAIN: 132,
  XG_BUILDUP: 133,

  // Dribbling & Carrying
  DRIBBLES_ATTEMPTED: 111,
  DRIBBLES_SUCCESS: 112,
  CARRIES: 124,
  PROGRESSIVE_CARRIES: 125,

  // Defensive
  TACKLES: 78,
  TACKLES_WON: 109,
  INTERCEPTIONS: 99,
  CLEARANCES: 100,
  BLOCKS: 101,
  PRESSURES: 150,
  PRESSURES_SUCCESS: 151,
  RECOVERIES: 152,

  // Duels
  DUELS_TOTAL: 105,
  DUELS_WON: 106,
  AERIAL_DUELS_TOTAL: 108,
  AERIAL_DUELS_WON: 107,
  GROUND_DUELS_WON: 160,

  // Physical
  MINUTES_PLAYED: 119,
  APPEARANCES: 321,
  DISTANCE_COVERED: 200,
  SPRINTS: 201,
  SPRINTS_HIGH_INTENSITY: 202,
  RATING: 118,

  // Discipline
  // Note: 84/83 were placeholders — Sportmonks v3 confirmed card type_ids:
  //   yellow card event type_id varies; use these until API validates
  YELLOW_CARDS: 84,   // ⚠ collides with SHOTS_TOTAL — update when API confirms
  RED_CARDS: 83,
  FOULS_COMMITTED: 95,
  FOULS_DRAWN: 96,

  // Market / Availability
  INJURIES: 300,
  GAMES_MISSED: 301,

  // Goalkeeping (future-proofing)
  SAVES: 58,
  SAVE_PCT: 59,
  CLEAN_SHEETS: 194,
  GOALS_AGAINST_AVG: 175,
} as const;

export type SmTypeId = (typeof SM_TYPE_ID)[keyof typeof SM_TYPE_ID];

// ---------------------------------------------------------------------------
// RawStats — full normalized stat set from a single player season
// ---------------------------------------------------------------------------
export interface RawStats {
  // Scoring
  goals: number;
  assists: number;

  // Passing
  passesTotal: number;
  passesAccurate: number;
  passAccuracyPct: number;
  keyPasses: number;
  progressivePasses: number;
  longPasses: number;
  longPassAccuracy: number;
  crosses: number;
  crossAccuracy: number;

  // Shooting
  shotsTotal: number;
  shotsOnTarget: number;
  shotsBlocked: number;
  xG: number;
  xA: number;
  xGChain: number;
  xGBuildup: number;

  // Dribbling & Carrying
  dribblesAttempted: number;
  dribblesSuccess: number;
  carries: number;
  progressiveCarries: number;

  // Defensive
  tackles: number;
  tacklesWon: number;
  interceptions: number;
  clearances: number;
  blocks: number;
  pressures: number;
  pressuresSuccess: number;
  recoveries: number;

  // Duels
  duelsTotal: number;
  duelsWon: number;
  aerialDuelsTotal: number;
  aerialDuelsWon: number;
  groundDuelsWon: number;

  // Physical
  minutesPlayed: number;
  appearances: number;
  distanceCovered: number;
  sprints: number;
  sprintsHighIntensity: number;
  rating: number;

  // Discipline
  yellowCards: number;
  redCards: number;
  foulsCommitted: number;
  foulsDrawn: number;

  // Availability
  injuries: number;
  gamesMissed: number;
}

// ---------------------------------------------------------------------------
// Stat extraction — handles both object ({total, average}) and scalar shapes
// ---------------------------------------------------------------------------
function extractValue(stat: SportmonksStat): number {
  const v = stat.value;
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "object") {
    if (typeof v.total === "number") return v.total;
    if (typeof v.average === "number") return v.average;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// normalizeStats — main export
// ---------------------------------------------------------------------------
export function normalizeStats(stats: SportmonksStat[]): RawStats {
  const map = new Map<number, number>();
  for (const stat of stats) {
    map.set(stat.type_id, extractValue(stat));
  }

  const get = (id: number) => map.get(id) ?? 0;

  return {
    goals: get(SM_TYPE_ID.GOALS),
    assists: get(SM_TYPE_ID.ASSISTS),

    passesTotal: get(SM_TYPE_ID.PASSES_TOTAL),
    passesAccurate: get(SM_TYPE_ID.PASSES_ACCURATE),
    passAccuracyPct: get(SM_TYPE_ID.PASS_ACCURACY_PCT),
    keyPasses: get(SM_TYPE_ID.KEY_PASSES),
    progressivePasses: get(SM_TYPE_ID.PROGRESSIVE_PASSES),
    longPasses: get(SM_TYPE_ID.LONG_PASSES),
    longPassAccuracy: get(SM_TYPE_ID.LONG_PASS_ACCURACY),
    crosses: get(SM_TYPE_ID.CROSSES),
    crossAccuracy: get(SM_TYPE_ID.CROSS_ACCURACY),

    shotsTotal: get(SM_TYPE_ID.SHOTS_TOTAL),
    shotsOnTarget: get(SM_TYPE_ID.SHOTS_ON_TARGET),
    shotsBlocked: get(SM_TYPE_ID.SHOTS_BLOCKED),
    xG: get(SM_TYPE_ID.XG),
    xA: get(SM_TYPE_ID.XA),
    xGChain: get(SM_TYPE_ID.XG_CHAIN),
    xGBuildup: get(SM_TYPE_ID.XG_BUILDUP),

    dribblesAttempted: get(SM_TYPE_ID.DRIBBLES_ATTEMPTED),
    dribblesSuccess: get(SM_TYPE_ID.DRIBBLES_SUCCESS),
    carries: get(SM_TYPE_ID.CARRIES),
    progressiveCarries: get(SM_TYPE_ID.PROGRESSIVE_CARRIES),

    tackles: get(SM_TYPE_ID.TACKLES),
    tacklesWon: get(SM_TYPE_ID.TACKLES_WON),
    interceptions: get(SM_TYPE_ID.INTERCEPTIONS),
    clearances: get(SM_TYPE_ID.CLEARANCES),
    blocks: get(SM_TYPE_ID.BLOCKS),
    pressures: get(SM_TYPE_ID.PRESSURES),
    pressuresSuccess: get(SM_TYPE_ID.PRESSURES_SUCCESS),
    recoveries: get(SM_TYPE_ID.RECOVERIES),

    duelsTotal: get(SM_TYPE_ID.DUELS_TOTAL),
    duelsWon: get(SM_TYPE_ID.DUELS_WON),
    aerialDuelsTotal: get(SM_TYPE_ID.AERIAL_DUELS_TOTAL),
    aerialDuelsWon: get(SM_TYPE_ID.AERIAL_DUELS_WON),
    groundDuelsWon: get(SM_TYPE_ID.GROUND_DUELS_WON),

    minutesPlayed: get(SM_TYPE_ID.MINUTES_PLAYED),
    appearances: get(SM_TYPE_ID.APPEARANCES),
    distanceCovered: get(SM_TYPE_ID.DISTANCE_COVERED),
    sprints: get(SM_TYPE_ID.SPRINTS),
    sprintsHighIntensity: get(SM_TYPE_ID.SPRINTS_HIGH_INTENSITY),
    rating: get(SM_TYPE_ID.RATING),

    yellowCards: get(SM_TYPE_ID.YELLOW_CARDS),
    redCards: get(SM_TYPE_ID.RED_CARDS),
    foulsCommitted: get(SM_TYPE_ID.FOULS_COMMITTED),
    foulsDrawn: get(SM_TYPE_ID.FOULS_DRAWN),

    injuries: get(SM_TYPE_ID.INJURIES),
    gamesMissed: get(SM_TYPE_ID.GAMES_MISSED),
  };
}
