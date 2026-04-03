/**
 * player-maps.service.ts
 *
 * Returns structured event data for pitch visualisation:
 *   - heatmap   → all events with valid coordinates
 *   - shots     → SHOT | GOAL
 *   - passes    → PASS
 *   - defensive → TACKLE | INTERCEPTION | CLEARANCE | SAVE | FOUL | PRESSURE
 *
 * Coordinates are normalised to 0–100 (Sportmonks already uses this scale).
 * The response shape is intentionally stable so the frontend can evolve
 * independently (Player-vs-Player, season filter, zone aggregation) without
 * a breaking change to this service — just extend MapQueryOptions.
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
