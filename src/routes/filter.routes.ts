import { Router, Request, Response } from "express";
import { asyncHandler } from "../lib/asyncHandler";
import { successResponse } from "../lib/apiResponse";
import { filterPlayers, getPlayerFacets } from "../services/player.filter.service";
import type { PlayerFilterInput } from "../services/player.filter.service";

const router = Router();

/**
 * GET /api/filter/players
 *
 * Hierarchical + faceted player search.
 *
 * Query params (all optional):
 *   Hierarchy:   countryId, leagueId, seasonId, teamId
 *   Facets:      positions (comma-separated), nationality, ageMin, ageMax,
 *                ratingMin, ratingMax, minutesMin, marketValueMin, marketValueMax, source
 *   Pagination:  page (default 1), pageSize (default 20, max 100)
 *   Sorting:     sortBy (overall|rating|age|marketValue|name), sortDir (asc|desc)
 *
 * Example:
 *   GET /api/filter/players?leagueId=<uuid>&positions=Midfielder,Striker&ageMax=25&sortBy=rating
 */
router.get(
  "/players",
  asyncHandler(async (req: Request, res: Response) => {
    const q = req.query as Record<string, string>;

    const input: PlayerFilterInput = {
      countryId: q["countryId"],
      leagueId: q["leagueId"],
      seasonId: q["seasonId"],
      teamId: q["teamId"],

      positions: q["positions"] ? q["positions"].split(",").map((p) => p.trim()) : undefined,
      nationality: q["nationality"],
      ageMin: q["ageMin"] ? Number(q["ageMin"]) : undefined,
      ageMax: q["ageMax"] ? Number(q["ageMax"]) : undefined,
      ratingMin: q["ratingMin"] ? Number(q["ratingMin"]) : undefined,
      ratingMax: q["ratingMax"] ? Number(q["ratingMax"]) : undefined,
      minutesMin: q["minutesMin"] ? Number(q["minutesMin"]) : undefined,
      marketValueMin: q["marketValueMin"] ? Number(q["marketValueMin"]) : undefined,
      marketValueMax: q["marketValueMax"] ? Number(q["marketValueMax"]) : undefined,
      source: q["source"],

      page: q["page"] ? Number(q["page"]) : 1,
      pageSize: q["pageSize"] ? Number(q["pageSize"]) : 20,

      sortBy: (q["sortBy"] as PlayerFilterInput["sortBy"]) ?? "overall",
      sortDir: (q["sortDir"] as "asc" | "desc") ?? "desc",
    };

    const result = await filterPlayers(input);
    return res.json(successResponse(result));
  }),
);

/**
 * GET /api/filter/facets
 *
 * Returns facet counts for the filter UI (countries, leagues, seasons, teams,
 * positions, nationalities).
 *
 * Accepts the same hierarchy query params as /players to scope the facets.
 */
router.get(
  "/facets",
  asyncHandler(async (req: Request, res: Response) => {
    const q = req.query as Record<string, string>;

    const facets = await getPlayerFacets({
      countryId: q["countryId"],
      leagueId: q["leagueId"],
      seasonId: q["seasonId"],
      teamId: q["teamId"],
    });

    return res.json(successResponse(facets));
  }),
);

export default router;
