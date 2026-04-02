import { Router, Request, Response } from "express";
import { asyncHandler } from "../lib/asyncHandler";
import { ingestPlayerFromSportmonks } from "../ingestion/player.ingestion.service";
import { successResponse } from "../lib/apiResponse";

const router = Router();

/**
 * POST /api/ingest/player/:id
 *
 * Manually triggers ingestion of a player from Sportmonks.
 * Always re-fetches from the API and creates a new stats snapshot.
 * Useful for populating the DB before enabling USE_DB_CACHE.
 *
 * Example: POST /api/ingest/player/14079
 */
router.post(
  "/player/:id",
  asyncHandler(async (req: Request, res: Response) => {
    const sportmonksId = parseInt(req.params["id"] as string, 10);
    if (isNaN(sportmonksId)) {
      return res.status(400).json({ error: "id must be a valid Sportmonks integer" });
    }

    const player = await ingestPlayerFromSportmonks(sportmonksId);

    return res.json(
      successResponse({
        playerId: player.id,
        name: player.name,
        team: player.team,
        statsSnapshots: player.statsSnapshots.length,
        message: `Player ingested successfully`,
      }),
    );
  }),
);

export default router;
