import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler";
import { getPlayerMapsController, getHeatmapController } from "../controllers/maps.controller";

const router = Router();

/**
 * GET /api/maps/player/:playerId
 *
 * Returns structured event data for pitch maps.
 *
 * Response:
 * {
 *   success: true,
 *   data: {
 *     playerId: string,
 *     totalEvents: number,
 *     heatmap:   [{ x, y, endX?, endY?, type, outcome, minute }],
 *     shots:     [{ x, y, endX?, endY?, type, outcome, minute }],
 *     passes:    [{ x, y, endX?, endY?, type, outcome, minute }],
 *     defensive: [{ x, y, endX?, endY?, type, outcome, minute }]
 *   },
 *   meta: { filters: { seasonId?, leagueId?, teamId?, matchId? } }
 * }
 *
 * Optional query params:
 *   seasonId, leagueId, teamId, matchId
 */
router.get("/player/:playerId", asyncHandler(getPlayerMapsController));

/**
 * GET /api/maps/heatmap/:playerId
 *
 * Returns an aggregated 10×7 intensity grid, dominant zones,
 * action breakdown counts and the player's season list.
 *
 * Response:
 * {
 *   success: true,
 *   data: {
 *     playerId: string,
 *     totalEvents: number,
 *     grid: [{ col, row, intensity }],       // only non-zero cells
 *     dominantZones: string[],               // top-3 zone names
 *     actionBreakdown: { goals, shots, tackles, passes, dribbles, interceptions, fouls, saves },
 *     seasons: string[]
 *   }
 * }
 */
router.get("/heatmap/:playerId", asyncHandler(getHeatmapController));

export default router;
