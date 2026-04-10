// ---------------------------------------------------------------------------
// Sportmonks v3 API types
// ---------------------------------------------------------------------------

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
  team?: { id?: number; name: string } | null;
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

// ---------------------------------------------------------------------------
// Hierarchy types
// ---------------------------------------------------------------------------

export interface SportmonksCountry {
  id: number;
  name: string;
  official_name?: string | null;
  iso2?: string | null;
  iso3?: string | null;
  image_path?: string | null;
}

export interface SportmonksLeague {
  id: number;
  name: string;
  country_id?: number | null;
  country?: SportmonksCountry | null;
  type?: string | null;
  sub_type?: string | null;
  logo_path?: string | null;
  image_path?: string | null;
}

export interface SportmonksSeason {
  id: number;
  name: string;
  league_id?: number | null;
  year?: number | null;
  is_current_season?: boolean | null;
  starting_at?: string | null;
  ending_at?: string | null;
}

export interface SportmonksTeam {
  id: number;
  name: string;
  short_code?: string | null;
  country_id?: number | null;
  country?: SportmonksCountry | null;
  image_path?: string | null;
}

// ---------------------------------------------------------------------------
// Squad types (GET /squads/seasons/{seasonId}/teams/{teamId})
// ---------------------------------------------------------------------------

export interface SportmonksSquadPlayerStatistic {
  season_id?: number | null;
  details?: SportmonksStat[] | null;
}

export interface SportmonksSquadPlayerDetails {
  id: number;
  display_name?: string | null;
  firstname?: string | null;
  lastname?: string | null;
  date_of_birth?: string | null;
  height?: number | null;
  weight?: number | null;
  foot?: "left" | "right" | "both" | null;
  image_path?: string | null;
  contract_until?: string | null;
  market_value?: number | null;
  nationality?: { name: string } | null;
  position?: { name: string } | null;
  detailedPosition?: { name: string } | null;
  // stats come as nested statistics → details
  statistics?: SportmonksSquadPlayerStatistic[] | null;
}

export interface SportmonksSquadEntry {
  player_id: number;
  team_id?: number | null;
  season_id?: number | null;
  position_id?: number | null;
  detailed_position_id?: number | null;
  number?: number | null;
  player?: SportmonksSquadPlayerDetails | null;
}

// ---------------------------------------------------------------------------
// Match (fixture) types
// ---------------------------------------------------------------------------

export interface SportmonksScore {
  type_id: number;
  participant: "home" | "away";
  score: { goals: number; participant: string };
}

export interface SportmonksParticipant {
  id: number;
  name: string;
  meta?: { location?: "home" | "away" };
}

export interface SportmonksFixtureState {
  id?: number | null;
  state?: string | null;        // e.g. "FT", "NS", "LIVE"
  short_name?: string | null;   // e.g. "FT"
  developer_name?: string | null; // e.g. "finished"
  name?: string | null;
}

export interface SportmonksFixture {
  id: number;
  season_id?: number | null;
  league_id?: number | null;
  starting_at?: string | null;
  result_info?: string | null;
  // state can be a nested object OR a flat string depending on include
  state?: SportmonksFixtureState | string | null;
  scores?: SportmonksScore[] | null;
  participants?: SportmonksParticipant[] | null;
  events?: SportmonksEvent[] | null;
}

// ---------------------------------------------------------------------------
// Event types (for heatmap / shot map / pass map / defensive map)
// ---------------------------------------------------------------------------

export type SportmonksEventType =
  | "goal"
  | "goal-allowed"
  | "yellowcard"
  | "redcard"
  | "yellowredcard"
  | "substitution"
  | "penalty"
  | "penalty-missed"
  | "shot-offgoal"
  | "shot-ongoal"
  | "shot-blocked"
  | "pass"
  | "cross"
  | "tackle"
  | "interception"
  | "clearance"
  | "save"
  | "foul"
  | "dribble"
  | string;

export interface SportmonksEvent {
  id: number;
  fixture_id?: number | null;
  period_id?: number | null;
  participant_id?: number | null; // team id
  player_id?: number | null;
  type?: { developer_name?: SportmonksEventType | null } | null;
  minute?: number | null;
  extra_minute?: number | null;
  // Spatial — not always provided; present in advanced plans
  coordinates?: {
    x?: number | null;
    y?: number | null;
    end_x?: number | null;
    end_y?: number | null;
  } | null;
  result?: string | null; // outcome
  info?: string | null;
  addition?: string | null;
  // Raw remaining fields for `meta` Json
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Highlights (GET /highlights, GET /fixtures/{id}/highlights)
// ---------------------------------------------------------------------------

export interface SportmonksHighlight {
  id: number;
  fixture_id: number;
  quality: string | null;
  scoreboard: string | null;
  /** URL of the video/embed */
  location: string;
  created_at: string;
  updated_at: string;
  // populated via include or filters=populate
  fixture?: {
    id: number;
    name?: string | null;
    season_id?: number | null;
  } | null;
}
