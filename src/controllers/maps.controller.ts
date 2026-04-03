import { Request, Response } from "express";
import { successResponse, errorResponse } from "../lib/apiResponse";
import { getPlayerMapData } from "../services/player-maps.service";
import type { MapQueryOptions } from "../services/player-maps.service";

/**
 * GET /api/maps/player/:playerId
 *
 * Optional query params (all future-ready, pass-through to service):
 *   seasonId  — scope events to a specific season (DB uuid)
 *   leagueId  — scope via match.season.leagueId (service will extend)
 *   teamId    — scope to matches where this team participated
 *   matchId   — scope to a single match
 */
export async function getPlayerMapsController(req: Request, res: Response) {
  const playerId = req.params["playerId"] as string;

  if (!playerId || typeof playerId !== "string" || playerId.trim() === "") {
    return res.status(400).json(errorResponse("playerId is required"));
  }

  const options: MapQueryOptions = {
    seasonId: req.query["seasonId"] as string | undefined,
    leagueId: req.query["leagueId"] as string | undefined,
    teamId: req.query["teamId"] as string | undefined,
    matchId: req.query["matchId"] as string | undefined,
  };

  // Remove undefined keys so the service can check Object.keys safely
  for (const key of Object.keys(options) as (keyof MapQueryOptions)[]) {
    if (options[key] === undefined) delete options[key];
  }

  const data = await getPlayerMapData(playerId, options);

  return res.json(
    successResponse(data, {
      filters: options,
    }),
  );
}
