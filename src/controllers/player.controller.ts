import { Request, Response } from "express";
import { successResponse } from "../lib/apiResponse";
import { withCache } from "../lib/cache";
import { generatePlayerReportAnalysis } from "../scout/player-report.service";
import { getPlayerProfile, getPlayerProjection, getSimilarPlayers, listPlayers } from "../scout/player.service";
import { addScoutNote, getScoutNotes } from "../scout/scout-notes.store";
import { prisma } from "../lib/prisma";
import { calculateOverallV2 } from "../analytics/overall-v2.engine";
import { searchPlayers } from "../modules/player/player.search.service";
import { getHeatmapData, getPlayerMapData, type MapEvent } from "../services/player-maps.service";
import { generatePlayerEvents } from "../services/synthetic-events.service";
import { resolvePositionGroup } from "../analytics/soccermind-overall.engine";
import { findHiddenGems } from "../services/hidden-gems.service";
import { generatePlayerBio } from "../services/player-bio.service";
import { getPlayerEvolution } from "../services/player-evolution.service";
import { calculateEmergingImpact } from "../analytics/emerging-impact.engine";
import { emit }                   from "../services/event.service";
import { SearchHistoryService }  from "../services/search-history.service";

function getParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function asNumber(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function getStringQuery(req: Request, ...keys: string[]) {
  for (const key of keys) {
    const value = req.query[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function getNumericQuery(req: Request, ...keys: string[]) {
  for (const key of keys) {
    const parsed = asNumber(req.query[key]);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function getArrayQuery(req: Request, ...keys: string[]) {
  const value = getStringQuery(req, ...keys);
  if (!value) {
    return undefined;
  }

  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  return items.length > 0 ? items : undefined;
}

function buildListPlayersParams(req: Request) {
  const positions = getArrayQuery(req, "positions");
  const position = getStringQuery(req, "position");

  return {
    search: getStringQuery(req, "search", "query"),
    positions,
    position,
    nationality: getStringQuery(req, "nationality"),
    team: getStringQuery(req, "team"),
    league: getStringQuery(req, "league"),
    source: getStringQuery(req, "source"),
    overallMin: getNumericQuery(req, "overallMin", "minOverall"),
    overallMax: getNumericQuery(req, "overallMax", "maxOverall"),
    potentialMin: getNumericQuery(req, "potentialMin", "minPotential"),
    potentialMax: getNumericQuery(req, "potentialMax", "maxPotential"),
    marketValueMin: getNumericQuery(req, "marketValueMin", "minValue"),
    marketValueMax: getNumericQuery(req, "marketValueMax", "maxValue"),
    ageMin: getNumericQuery(req, "ageMin", "minAge"),
    ageMax: getNumericQuery(req, "ageMax", "maxAge"),
    page: getNumericQuery(req, "page"),
    limit: getNumericQuery(req, "limit"),
  };
}

export async function listPlayersController(req: Request, res: Response) {
  const result = await listPlayers(buildListPlayersParams(req));
  return res.json(successResponse(result.items, { ...result.pagination, filters: result.filters, filterOptions: result.filterOptions }));
}

export async function searchPlayersController(req: Request, res: Response) {
  const sortByRaw = getStringQuery(req, "sortBy");
  const validSort = ["overall", "valueScore", "potential", "age"] as const;
  type SortBy = typeof validSort[number];
  const sortBy: SortBy | undefined = validSort.includes(sortByRaw as SortBy)
    ? (sortByRaw as SortBy)
    : undefined;

  const query = getStringQuery(req, "search", "q");

  const results = await searchPlayers({
    search:          query,
    name:            getStringQuery(req, "name"),
    team:            getStringQuery(req, "team"),
    position:        getStringQuery(req, "position"),
    ageMin:          getNumericQuery(req, "ageMin"),
    ageMax:          getNumericQuery(req, "ageMax"),
    overallMin:      getNumericQuery(req, "overallMin"),
    overallMax:      getNumericQuery(req, "overallMax"),
    potentialMin:    getNumericQuery(req, "potentialMin"),
    marketValueMin:  getNumericQuery(req, "marketValueMin"),
    marketValueMax:  getNumericQuery(req, "marketValueMax"),
    league:          getStringQuery(req, "league"),
    nationality:     getStringQuery(req, "nationality"),
    dnaMin:          getNumericQuery(req, "dnaMin"),
    sortBy,
    limit:           getNumericQuery(req, "limit"),
  });

  if (req.user?.id) {
    const userId = req.user.id;
    if (query) {
      SearchHistoryService.record({
        userId,
        query,
        filters: {
          position:    getStringQuery(req, "position") ?? undefined,
          nationality: getStringQuery(req, "nationality") ?? undefined,
          ageMin:      getNumericQuery(req, "ageMin"),
          ageMax:      getNumericQuery(req, "ageMax"),
          overallMin:  getNumericQuery(req, "overallMin"),
        },
        resultCount: results.length,
      }).catch((err) => console.error("[search-history] record failed:", err));
    }
    emit({ userId, type: "SEARCH_PERFORMED", payload: { query } });
  }

  return res.json(
    successResponse(results, { total: results.length }),
  );
}

export async function getPlayerProfileController(req: Request, res: Response) {
  const playerId = getParam(req.params.id);
  const cacheKey = `player:profile:${playerId}`;
  const data = await withCache(cacheKey, 120, () => getPlayerProfile(playerId));

  if (req.user?.id) {
    const playerName = (data as { name?: string })?.name;
    emit({ userId: req.user.id, type: "PLAYER_VIEWED", payload: { playerId, playerName } });
  }

  return res.json(successResponse(data));
}

export async function getPlayerProjectionController(req: Request, res: Response) {
  const playerId = getParam(req.params.id);
  const cacheKey = `player:projection:${playerId}`;
  const data = await withCache(cacheKey, 120, () => getPlayerProjection(playerId));
  return res.json(successResponse(data));
}

export async function getPlayerSimilarController(req: Request, res: Response) {
  const playerId = getParam(req.params.id);
  const cacheKey = `player:similar:${playerId}`;
  const data = await withCache(cacheKey, 120, () => getSimilarPlayers(playerId));
  return res.json(successResponse(data));
}

export async function listPlayerNotesController(req: Request, res: Response) {
  const playerId = getParam(req.params.id);
  const notes = getScoutNotes(playerId);
  return res.json(successResponse(notes));
}

export async function createPlayerNoteController(req: Request, res: Response) {
  const playerId = getParam(req.params.id);
  const note = addScoutNote(playerId, String(req.body.note ?? ""), String(req.body.createdBy ?? "analyst"));
  return res.json(successResponse(note));
}

export async function createPlayerReportController(req: Request, res: Response) {
  const playerId = getParam(req.params.id);
  const data = await generatePlayerReportAnalysis(playerId, {
    analyst: typeof req.body?.analyst === "string" ? req.body.analyst : undefined,
  });

  if (req.user?.id) {
    emit({
      userId: req.user.id,
      type: "REPORT_GENERATED",
      payload: {
        playerId,
        playerName: data.player?.name ?? data.player?.nomeJogador,
        analysisId: data.analysisId,
        title: data.player?.name ? `Relatorio Executivo - ${data.player.name}` : undefined,
      },
    });
  }

  return res.status(201).json(successResponse(data));
}

export async function getTruePerformanceController(req: Request, res: Response) {
  const playerId = getParam(req.params.id);

  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: {
      id: true,
      positions: true,
      age: true,
      league: true,
      overall:          true,
      overallPace:      true,
      overallShooting:  true,
      overallPassing:   true,
      overallDribbling: true,
      overallDefending: true,
      overallPhysical:  true,
    },
  });

  if (!player) {
    return res.status(404).json({ success: false, data: null, error: "Player not found" });
  }

  // Most recent PlayerStats record for this player
  const stats = await prisma.playerStats.findFirst({
    where: { playerId },
    orderBy: { createdAt: "desc" },
    select: {
      goals: true, assists: true, xG: true, xA: true,
      passAccuracy: true, passes: true, tackles: true, interceptions: true,
      rating: true, minutes: true, appearances: true,
    },
  });

  const result = calculateOverallV2(player, stats);

  return res.json(successResponse(result));
}

// ---------------------------------------------------------------------------
// Normalise a MapEvent outcome to lowercase for the frontend
// ---------------------------------------------------------------------------

function toFrontendEvent(e: MapEvent) {
  return {
    x:       e.x,
    y:       e.y,
    endX:    e.endX,
    endY:    e.endY,
    outcome: e.outcome?.toLowerCase() ?? null,
  };
}

/**
 * GET /players/:id/events
 *
 * Returns structured spatial data for the three pitch maps:
 *   heatmap — aggregated 10×7 grid (canvas Wyscout)
 *   passes  — pass routes with success/fail outcome
 *   shots   — shot positions with goal/saved/other outcome
 *
 * Fallback: when no MatchEvent rows exist for this player (e.g. Sportmonks
 * plan without per-match event feed), generates synthetic events derived from
 * the player's real PlayerStats — making maps data-driven, never empty.
 */
export async function getPlayerEventsController(req: Request, res: Response) {
  const playerId = getParam(req.params.id);

  // Fetch real event data and player stats in parallel
  const [heatmap, mapData, player] = await Promise.all([
    getHeatmapData(playerId),
    getPlayerMapData(playerId),
    prisma.player.findUnique({
      where:  { id: playerId },
      select: { positions: true },
    }),
  ]);

  // ── Real data path ───────────────────────────────────────────────────────
  if (heatmap.totalEvents > 0) {
    // Derive raw points from the real event coordinates so the canvas renderer
    // has individual (x,y) positions to work with instead of the aggregated grid.
    const heatmapPoints = [
      ...mapData.passes.map(e => ({ x: e.x, y: e.y })),
      ...mapData.shots.map(e => ({ x: e.x, y: e.y })),
    ];
    return res.json(
      successResponse({
        heatmap,
        heatmapPoints,
        passes:    mapData.passes.map(toFrontendEvent),
        shots:     mapData.shots.map(toFrontendEvent),
        synthetic: false,
      }),
    );
  }

  // ── Synthetic fallback ───────────────────────────────────────────────────
  // Pull the most recent PlayerStats to drive generation
  const stats = await prisma.playerStats.findFirst({
    where:   { playerId },
    orderBy: { createdAt: "desc" },
    select: {
      goals: true, shots: true, shotsOnTarget: true,
      passes: true, keyPasses: true, crosses: true,
      tackles: true, interceptions: true,
      dribblesSuccess: true,
      saves: true, foulsCommitted: true,
    },
  });

  const positionGroup = resolvePositionGroup(player?.positions ?? []);

  const synthetic = generatePlayerEvents(
    playerId,
    {
      goals:          stats?.goals,
      shots:          stats?.shots,
      shotsOnTarget:  stats?.shotsOnTarget,
      passes:         stats?.passes,
      keyPasses:      stats?.keyPasses,
      crosses:        stats?.crosses,
      tackles:        stats?.tackles,
      interceptions:  stats?.interceptions,
      dribbles:       stats?.dribblesSuccess,
      saves:          stats?.saves,
      foulsCommitted: stats?.foulsCommitted,
    },
    positionGroup,
  );

  return res.json(
    successResponse({
      heatmap:       synthetic.heatmap,
      heatmapPoints: synthetic.rawPoints,
      passes:        synthetic.passes,
      shots:         synthetic.shots,
      synthetic:     true,
    }),
  );
}

// ---------------------------------------------------------------------------
// GET /players/hidden-gems
// ---------------------------------------------------------------------------

export async function getHiddenGemsController(req: Request, res: Response) {
  const limit = asNumber(req.query.limit) ?? 20;
  const gems  = await findHiddenGems(Math.min(limit, 50));

  if (req.user?.id) {
    emit({ userId: req.user.id, type: "GEM_OPENED", payload: { count: gems.length } });
  }

  return res.json(successResponse(gems, { total: gems.length }));
}

// ---------------------------------------------------------------------------
// GET /player/:id/evolution
// ---------------------------------------------------------------------------

export async function getPlayerEvolutionController(req: Request, res: Response) {
  const playerId = getParam(req.params.id);
  const cacheKey = `player:evolution:${playerId}`;
  const data     = await withCache(cacheKey, 180, () => getPlayerEvolution(playerId));
  if (!data) {
    return res.status(404).json({ success: false, data: null, error: "Player not found" });
  }
  return res.json(successResponse(data));
}

// ---------------------------------------------------------------------------
// GET /player/:id/emerging-impact
// ---------------------------------------------------------------------------

export async function getEmergingImpactController(req: Request, res: Response) {
  const playerId = getParam(req.params.id);

  const [player, stats] = await Promise.all([
    prisma.player.findUnique({
      where:  { id: playerId },
      select: { positions: true },
    }),
    prisma.playerStats.findFirst({
      where:   { playerId },
      orderBy: { createdAt: "desc" },
      select: {
        goals: true, assists: true, rating: true, minutes: true,
        appearances: true, saves: true, cleanSheets: true,
        duelsTotal: true, duelsWon: true,
      },
    }),
  ]);

  if (!player) {
    return res.status(404).json({ success: false, data: null, error: "Player not found" });
  }

  const result = calculateEmergingImpact(stats ?? {}, player.positions[0] ?? null);

  return res.json(successResponse(result));
}

// ---------------------------------------------------------------------------
// GET /player/:id/bio
// ---------------------------------------------------------------------------

export async function getPlayerBioController(req: Request, res: Response) {
  const playerId = getParam(req.params.id);
  const cacheKey = `player:bio:${playerId}`;
  const data     = await withCache(cacheKey, 300, () => generatePlayerBio(playerId));
  return res.json(successResponse(data));
}
