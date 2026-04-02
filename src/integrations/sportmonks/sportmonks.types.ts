export interface SportmonksStat {
  type_id: number;
  value: {
    total?: number | null;
    average?: number | null;
    [key: string]: unknown;
  } | number | null;
}

export interface SportmonksPlayerDetails {
  id: number;
  display_name: string;
  firstname?: string | null;
  lastname?: string | null;
  date_of_birth?: string | null;
  nationality_id?: number | null;
  nationality?: { name: string } | null;
  position_id?: number | null;
  position?: { name: string } | null;
  detailed_position_id?: number | null;
  detailedPosition?: { name: string } | null;
  height?: number | null;
  weight?: number | null;
  foot?: "left" | "right" | "both" | null;
  image_path?: string | null;
  team?: { name: string } | null;
  league?: { name: string } | null;
  contract_until?: string | null;
  market_value?: number | null;
  market_value_currency?: string | null;
}

export interface SportmonksPlayer {
  player: SportmonksPlayerDetails;
  stats: SportmonksStat[];
}

// Stat type_id constants from Sportmonks v3 API
export const SM_STAT = {
  GOALS: 52,
  ASSISTS: 79,
  PASSES: 80,
  PASS_ACCURACY: 86,
  KEY_PASSES: 117,
  SHOTS_TOTAL: 84,
  SHOTS_ON_TARGET: 85,
  DRIBBLES_ATTEMPTED: 111,
  DRIBBLES_SUCCESS: 112,
  INTERCEPTIONS: 99,
  TACKLES: 78,
  CLEARANCES: 100,
  DUELS_TOTAL: 105,
  DUELS_WON: 106,
  AERIAL_DUELS_WON: 107,
  MINUTES_PLAYED: 119,
  APPEARANCES: 321,
  RATING: 118,
  DISTANCE_COVERED: 200,
  SPRINTS: 201,
  XG: 130,
  XA: 131,
  YELLOW_CARDS: 84,
  RED_CARDS: 83,
} as const;

export interface NormalizedStats {
  goals: number;
  assists: number;
  passes: number;
  passAccuracy: number;
  keyPasses: number;
  shotsTotal: number;
  shotsOnTarget: number;
  dribblesAttempted: number;
  dribblesSuccess: number;
  interceptions: number;
  tackles: number;
  clearances: number;
  duelsTotal: number;
  duelsWon: number;
  aerialDuelsWon: number;
  minutesPlayed: number;
  appearances: number;
  rating: number;
  distanceCovered: number;
  sprints: number;
  xG: number;
  xA: number;
  yellowCards: number;
  redCards: number;
}
