import { Router, Request, Response } from "express";
import { asyncHandler } from "../lib/asyncHandler";
import { successResponse } from "../lib/apiResponse";

// Ingestion services
import { ingestPlayerFromSportmonks } from "../ingestion/player.ingestion.service";
import {
  runHighlightsBulkIngestion,
  runHighlightsIncrementalSync,
} from "../ingestion/highlights.ingestion";
import {
  ingestCountry,
  ingestLeague,
  ingestLeaguesByCountry,
  ingestSeasonsByLeague,
  ingestTeamsBySeason,
  ingestPlayersByTeam,
  ingestLeagueFull,
} from "../ingestion/hierarchy.ingestion.service";
import {
  ingestMatch,
  ingestMatchFull,
  ingestMatchesBySeason,
  ingestMatchEvents,
} from "../ingestion/match.ingestion.service";

const router = Router();

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function parseId(raw: string | string[] | undefined): number {
  const val = Array.isArray(raw) ? (raw[0] ?? "") : (raw ?? "");
  return parseInt(val, 10);
}

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------

/**
 * POST /api/ingest/player/:id
 * Manually ingests a player from Sportmonks and creates a stats snapshot.
 */
router.post(
  "/player/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseId(req.params["id"]);
    if (isNaN(id)) return res.status(400).json({ error: "id must be a valid integer" });

    const player = await ingestPlayerFromSportmonks(id);

    return res.json(
      successResponse({
        playerId: player.id,
        name: player.name,
        team: player.team,
        statsSnapshots: player.statsSnapshots.length,
      }),
    );
  }),
);

// ---------------------------------------------------------------------------
// Country
// ---------------------------------------------------------------------------

/**
 * POST /api/ingest/country/:id
 */
router.post(
  "/country/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseId(req.params["id"]);
    if (isNaN(id)) return res.status(400).json({ error: "id must be a valid integer" });

    const country = await ingestCountry(id);
    return res.json(successResponse({ id: country.id, name: country.name }));
  }),
);

// ---------------------------------------------------------------------------
// League
// ---------------------------------------------------------------------------

/**
 * POST /api/ingest/league/:id
 * Ingests a single league (and its country if available).
 */
router.post(
  "/league/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseId(req.params["id"]);
    if (isNaN(id)) return res.status(400).json({ error: "id must be a valid integer" });

    const league = await ingestLeague(id);
    return res.json(successResponse({ id: league.id, name: league.name }));
  }),
);

/**
 * POST /api/ingest/country/:id/leagues
 * Ingests all leagues for a country.
 */
router.post(
  "/country/:id/leagues",
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseId(req.params["id"]);
    if (isNaN(id)) return res.status(400).json({ error: "id must be a valid integer" });

    const leagues = await ingestLeaguesByCountry(id);
    return res.json(successResponse({ total: leagues.length, leagues: leagues.map((l) => l.name) }));
  }),
);

// ---------------------------------------------------------------------------
// Season
// ---------------------------------------------------------------------------

/**
 * POST /api/ingest/league/:id/seasons
 * Ingests all seasons for a league.
 */
router.post(
  "/league/:id/seasons",
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseId(req.params["id"]);
    if (isNaN(id)) return res.status(400).json({ error: "id must be a valid integer" });

    const seasons = await ingestSeasonsByLeague(id);
    return res.json(successResponse({ total: seasons.length, seasons: seasons.map((s) => s.name) }));
  }),
);

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

/**
 * POST /api/ingest/season/:id/teams
 * Ingests all teams for a season and links them.
 */
router.post(
  "/season/:id/teams",
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseId(req.params["id"]);
    if (isNaN(id)) return res.status(400).json({ error: "id must be a valid integer" });

    const teams = await ingestTeamsBySeason(id);
    return res.json(successResponse({ total: teams.length, teams: teams.map((t) => t.name) }));
  }),
);

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------

/**
 * POST /api/ingest/team/:teamId/season/:seasonId/players
 * Ingests all players for a team in a specific season.
 */
router.post(
  "/team/:teamId/season/:seasonId/players",
  asyncHandler(async (req: Request, res: Response) => {
    const teamId = parseId(req.params["teamId"]);
    const seasonId = parseId(req.params["seasonId"]);
    if (isNaN(teamId) || isNaN(seasonId))
      return res.status(400).json({ error: "teamId and seasonId must be valid integers" });

    const players = await ingestPlayersByTeam(teamId, seasonId);
    return res.json(successResponse({ total: players.length, players: players.map((p) => p.name) }));
  }),
);

// ---------------------------------------------------------------------------
// Match
// ---------------------------------------------------------------------------

/**
 * POST /api/ingest/match/:id
 * Ingests a single match (fixture) without events.
 */
router.post(
  "/match/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseId(req.params["id"]);
    if (isNaN(id)) return res.status(400).json({ error: "id must be a valid integer" });

    const match = await ingestMatch(id);
    return res.json(successResponse({ id: match.id, externalId: match.externalId, status: match.status }));
  }),
);

/**
 * POST /api/ingest/match/:id/full
 * Ingests a match and all its events.
 */
router.post(
  "/match/:id/full",
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseId(req.params["id"]);
    if (isNaN(id)) return res.status(400).json({ error: "id must be a valid integer" });

    const result = await ingestMatchFull(id);
    return res.json(successResponse(result));
  }),
);

/**
 * POST /api/ingest/match/:id/events
 * Ingests only the events for an already-ingested match.
 */
router.post(
  "/match/:id/events",
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseId(req.params["id"]);
    if (isNaN(id)) return res.status(400).json({ error: "id must be a valid integer" });

    const events = await ingestMatchEvents(id);
    return res.json(successResponse({ eventsIngested: events.length }));
  }),
);

/**
 * POST /api/ingest/season/:id/matches
 * Ingests all matches for a season.
 */
router.post(
  "/season/:id/matches",
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseId(req.params["id"]);
    if (isNaN(id)) return res.status(400).json({ error: "id must be a valid integer" });

    const matches = await ingestMatchesBySeason(id);
    return res.json(successResponse({ total: matches.length }));
  }),
);

// ---------------------------------------------------------------------------
// Highlights
// ---------------------------------------------------------------------------

/**
 * POST /api/ingest/highlights/bulk
 * First-time bootstrap: fetches all Sportmonks highlights (paginated) and
 * saves them as PlayerVideo records linked via fixture → match events.
 * Safe to call multiple times — already-ingested URLs are skipped.
 */
router.post(
  "/highlights/bulk",
  asyncHandler(async (_req: Request, res: Response) => {
    const summary = await runHighlightsBulkIngestion();
    return res.json(
      successResponse({
        mode: summary.mode,
        totalFixtures: summary.totalFetched,
        totalIngested: summary.totalIngested,
        totalSkipped: summary.totalSkipped,
        planRestricted: summary.planRestricted ?? false,
        message: summary.planRestricted
          ? "Plano Sportmonks não inclui highlights. Atualize o plano para acessar highlights."
          : `${summary.totalIngested} highlights ingeridos, ${summary.totalSkipped} ignorados`,
      }),
    );
  }),
);

/**
 * POST /api/ingest/highlights/sync
 * Incremental sync: processes the N most recent fixtures (default: 100).
 * Body: { limit?: number }
 */
router.post(
  "/highlights/sync",
  asyncHandler(async (req: Request, res: Response) => {
    const limit = typeof req.body?.limit === "number" ? req.body.limit : 100;
    const summary = await runHighlightsIncrementalSync(limit);
    return res.json(
      successResponse({
        mode: summary.mode,
        totalFixtures: summary.totalFetched,
        totalIngested: summary.totalIngested,
        totalSkipped: summary.totalSkipped,
        planRestricted: summary.planRestricted ?? false,
        message: summary.planRestricted
          ? "Plano Sportmonks não inclui highlights."
          : `${summary.totalIngested} highlights sincronizados`,
      }),
    );
  }),
);

// ---------------------------------------------------------------------------
// Full cascade
// ---------------------------------------------------------------------------

/**
 * POST /api/ingest/league/:id/full
 * Full cascade: league → seasons → teams → players.
 * Body: { onlyCurrentSeason?: boolean } (default: true)
 */
router.post(
  "/league/:id/full",
  asyncHandler(async (req: Request, res: Response) => {
    const id = parseId(req.params["id"]);
    if (isNaN(id)) return res.status(400).json({ error: "id must be a valid integer" });

    const onlyCurrentSeason = req.body?.onlyCurrentSeason !== false;
    const summary = await ingestLeagueFull(id, onlyCurrentSeason);
    return res.json(successResponse(summary));
  }),
);

// ---------------------------------------------------------------------------
// Bulk events — all finished matches across all leagues
// ---------------------------------------------------------------------------

/**
 * POST /api/ingest/events/all
 * Ingests events for every past match that has none yet.
 * Runs in background — responds immediately.
 */
router.post(
  "/events/all",
  asyncHandler(async (_req: Request, res: Response) => {
    res.json(
      successResponse({
        message: "Ingestão de eventos iniciada em background",
        tip: "Acompanhe o progresso nos logs do servidor",
      }),
    );

    setImmediate(async () => {
      try {
        const { ingestAllMatchEvents } = await import("../scripts/ingest-all-events");
        await ingestAllMatchEvents();
      } catch (err) {
        console.error("[ingest/events/all] Erro:", err instanceof Error ? err.message : err);
      }
    });
  }),
);

// ---------------------------------------------------------------------------
// Player stats aggregation
// ---------------------------------------------------------------------------

/**
 * POST /api/ingest/stats/aggregate
 * Aggregates MatchEvents into PlayerStats for all players/seasons.
 * Runs in background — responds immediately.
 */
router.post(
  "/stats/aggregate",
  asyncHandler(async (_req: Request, res: Response) => {
    res.json(
      successResponse({
        message: "Agregação de stats iniciada em background",
        tip: "Acompanhe o progresso nos logs do servidor",
      }),
    );

    setImmediate(async () => {
      try {
        const { aggregatePlayerStats } = await import("../scripts/aggregate-player-stats");
        await aggregatePlayerStats();
      } catch (err) {
        console.error("[ingest/stats/aggregate] Erro:", err instanceof Error ? err.message : err);
      }
    });
  }),
);

export default router;
