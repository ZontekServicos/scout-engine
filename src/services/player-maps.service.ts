/**
 * player-maps.service.ts
 *
 * Returns structured event data for pitch visualisation:
 *   - getPlayerMapData → raw event arrays (heatmap, shots, passes, defensive)
 *   - getHeatmapData  → aggregated 10×7 grid with intensity, dominant zones,
 *                        action breakdown and season list
 *
 * Coordinates are normalised to 0–100 (Sportmonks already uses this scale).
 */

import { prisma } from "../lib/prisma";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface MapEvent {
  x: number;
  y: number;
  endX: number | null;
  endY: number | null;
  type: string;
  outcome: string | null;
  minute: number | null;
}

export interface PlayerMapData {
  playerId: string;
  totalEvents: number;
  heatmap: MapEvent[];
  shots: MapEvent[];
  passes: MapEvent[];
  defensive: MapEvent[];
}

/**
 * Extension point — add seasonId, leagueId, teamId, matchId filters here
 * when needed without changing the callers.
 */
export interface MapQueryOptions {
  seasonId?: string;
  leagueId?: string;
  teamId?: string;
  matchId?: string;
}

// ---------------------------------------------------------------------------
// Event type sets
// ---------------------------------------------------------------------------

const SHOT_TYPES = new Set(["SHOT", "GOAL", "PENALTY", "PENALTY_MISSED"]);
const PASS_TYPES = new Set(["PASS"]);
const DEFENSIVE_TYPES = new Set([
  "TACKLE",
  "INTERCEPTION",
  "CLEARANCE",
  "SAVE",
  "FOUL",
  "PRESSURE",
]);

// ---------------------------------------------------------------------------
// Coordinate normalisation
// ---------------------------------------------------------------------------

/**
 * Clamps a value to [0, 100] and rounds to 2 decimal places.
 * Sportmonks already uses a 0–100 scale, but this guards against
 * occasional raw values outside that range.
 */
function normaliseCoord(value: number): number {
  return Math.round(Math.max(0, Math.min(100, value)) * 100) / 100;
}

function normaliseOutcome(outcome: string | null): string | null {
  if (!outcome) return null;
  return outcome.toUpperCase().trim();
}

// ---------------------------------------------------------------------------
// Main service function
// ---------------------------------------------------------------------------

export async function getPlayerMapData(
  playerId: string,
  options: MapQueryOptions = {},
): Promise<PlayerMapData> {
  // Build optional filters for future extensibility
  const matchFilter: Record<string, unknown> = {};
  if (options.seasonId) matchFilter["seasonId"] = options.seasonId;
  if (options.matchId) matchFilter["id"] = options.matchId;

  const rows = await prisma.matchEvent.findMany({
    where: {
      playerId,
      // Only events with valid start coordinates
      x: { not: null },
      y: { not: null },
      // Optionally scope to specific matches
      ...(Object.keys(matchFilter).length > 0
        ? { match: matchFilter }
        : {}),
    },
    select: {
      type: true,
      x: true,
      y: true,
      endX: true,
      endY: true,
      outcome: true,
      minute: true,
    },
    // Ordered by match time for future pagination (cursor-based on minute)
    orderBy: [{ minute: "asc" }],
  });

  const heatmap: MapEvent[] = [];
  const shots: MapEvent[] = [];
  const passes: MapEvent[] = [];
  const defensive: MapEvent[] = [];

  for (const row of rows) {
    // x and y are guaranteed non-null by the WHERE clause above,
    // but TypeScript doesn't narrow Prisma nullable fields automatically.
    if (row.x === null || row.y === null) continue;

    const event: MapEvent = {
      x: normaliseCoord(row.x),
      y: normaliseCoord(row.y),
      endX: row.endX !== null ? normaliseCoord(row.endX) : null,
      endY: row.endY !== null ? normaliseCoord(row.endY) : null,
      type: row.type,
      outcome: normaliseOutcome(row.outcome),
      minute: row.minute,
    };

    // Heatmap receives every event (all types)
    heatmap.push(event);

    // Categorise into specific maps
    if (SHOT_TYPES.has(row.type)) {
      shots.push(event);
    } else if (PASS_TYPES.has(row.type)) {
      passes.push(event);
    } else if (DEFENSIVE_TYPES.has(row.type)) {
      defensive.push(event);
    }
  }

  return {
    playerId,
    totalEvents: heatmap.length,
    heatmap,
    shots,
    passes,
    defensive,
  };
}

// ---------------------------------------------------------------------------
// Heatmap grid types & logic
// ---------------------------------------------------------------------------

export interface HeatmapCell {
  col: number;        // 0-9  (x axis, 10 columns)
  row: number;        // 0-6  (y axis, 7 rows)
  intensity: number;  // 0-100 (normalised count)
}

export interface HeatmapData {
  playerId: string;
  totalEvents: number;
  grid: HeatmapCell[];
  dominantZones: string[];
  actionBreakdown: {
    goals: number;
    shots: number;
    tackles: number;
    passes: number;
    dribbles: number;
    interceptions: number;
    fouls: number;
    saves: number;
  };
  seasons: string[];
}

// Grid dimensions
const COLS = 10;
const ROWS = 7;

/**
 * Maps a (col, row) cell to a human-readable zone name.
 *
 * Pitch orientation: x increases left→right (own goal → opponent goal),
 * y increases bottom→top (right flank → left flank), per Sportmonks docs.
 *
 * Col bands : 0-2 = defensive third, 3-6 = midfield, 7-9 = attacking third
 * Row bands : 0-1 = right flank,     2-4 = centre,   5-6 = left flank
 */
function zoneName(col: number, row: number): string {
  if (col >= 7 && row >= 2 && row <= 4) return "Área adversária";
  if (col >= 7 && row <= 1)             return "Corredor direito no ataque";
  if (col >= 7 && row >= 5)             return "Corredor esquerdo no ataque";
  if (col <= 2 && row >= 2 && row <= 4) return "Área própria";
  if (col <= 2 && row <= 1)             return "Corredor direito defensivo";
  if (col <= 2 && row >= 5)             return "Corredor esquerdo defensivo";
  if (col >= 3 && col <= 6 && row >= 2 && row <= 4) return "Meio-campo central";
  if (row <= 1)  return "Corredor direito";
  if (row >= 5)  return "Corredor esquerdo";
  return "Meio-campo";
}

/**
 * Returns a 10×7 heatmap grid for the given player, plus dominant zones,
 * action breakdown counts and the list of seasons with events.
 *
 * Events without coordinates (x/y null) are counted in actionBreakdown
 * but excluded from the grid.
 */
export async function getHeatmapData(playerId: string): Promise<HeatmapData> {
  const rows = await prisma.matchEvent.findMany({
    where: { playerId },
    select: {
      type: true,
      x: true,
      y: true,
      match: {
        select: {
          seasonId: true,
        },
      },
    },
  });

  // Grid: [col][row] raw counts
  const counts: number[][] = Array.from({ length: COLS }, () =>
    new Array<number>(ROWS).fill(0),
  );

  // Action breakdown counters
  let goals = 0;
  let shots = 0;
  let tackles = 0;
  let passes = 0;
  let dribbles = 0;
  let interceptions = 0;
  let fouls = 0;
  let saves = 0;

  // Unique season IDs
  const seasonSet = new Set<string>();

  let totalEvents = 0;

  for (const row of rows) {
    totalEvents++;

    // Track seasons
    if (row.match.seasonId) seasonSet.add(row.match.seasonId);

    // Action breakdown (all events, with or without coordinates)
    switch (row.type) {
      case "GOAL":          goals++;         break;
      case "SHOT":          shots++;         break;
      case "TACKLE":        tackles++;       break;
      case "PASS":          passes++;        break;
      case "DRIBBLE":       dribbles++;      break;
      case "INTERCEPTION":  interceptions++; break;
      case "FOUL":          fouls++;         break;
      case "SAVE":          saves++;         break;
    }

    // Grid: only events with valid coordinates
    if (row.x === null || row.y === null) continue;

    const col = Math.min(COLS - 1, Math.floor(row.x / 10));
    const r   = Math.min(ROWS - 1, Math.floor(row.y / (100 / ROWS)));
    counts[col][r]++;
  }

  // Flatten grid and normalise to 0-100
  let maxCount = 0;
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      if (counts[c][r] > maxCount) maxCount = counts[c][r];
    }
  }

  const grid: HeatmapCell[] = [];
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      if (counts[c][r] === 0) continue; // omit empty cells to reduce payload
      grid.push({
        col: c,
        row: r,
        intensity: maxCount > 0 ? Math.round((counts[c][r] / maxCount) * 100) : 0,
      });
    }
  }

  // Dominant zones: top-3 cells by count, deduplicated by zone name
  const sorted = grid.slice().sort((a, b) => b.intensity - a.intensity);
  const dominantZones: string[] = [];
  for (const cell of sorted) {
    const name = zoneName(cell.col, cell.row);
    if (!dominantZones.includes(name)) dominantZones.push(name);
    if (dominantZones.length === 3) break;
  }

  return {
    playerId,
    totalEvents,
    grid,
    dominantZones,
    actionBreakdown: { goals, shots, tackles, passes, dribbles, interceptions, fouls, saves },
    seasons: [...seasonSet],
  };
}
