import { Router } from "express";
import { asyncHandler }                   from "../lib/asyncHandler";
import { getScoutingRankingController }   from "../controllers/scouting.controller";

const router = Router();

/**
 * GET /api/scouting/ranking
 *
 * Smart ranking combining overall, trend and value efficiency.
 *
 * Query params:
 *   position    — position code filter (e.g. "ST")
 *   leagueId    — league DB id filter
 *   ageMin      — minimum age
 *   ageMax      — maximum age
 *   overallMin  — minimum overall (default 55)
 *   label       — ScoutingLabel filter (ELITE_PROSPECT | RISING_STAR | VALUE_PICK | STABLE | DECLINING)
 *   limit       — max results (default 50, max 100)
 */
router.get("/ranking", asyncHandler(getScoutingRankingController));

export default router;
