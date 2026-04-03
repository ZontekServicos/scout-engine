import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler";
import { getPlayerMapsController } from "../controllers/maps.controller";

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

export default router;
