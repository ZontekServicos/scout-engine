import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler";
import {
  createPlayerNoteController,
  createPlayerReportController,
  getPlayerEventsController,
  getPlayerProfileController,
  getPlayerProjectionController,
  getPlayerSimilarController,
  getTruePerformanceController,
  listPlayerNotesController,
  listPlayersController,
  searchPlayersController,
} from "../controllers/player.controller";

const router = Router();

router.get("/players", asyncHandler(listPlayersController));
router.get("/players/search", asyncHandler(searchPlayersController));

router.get("/player/:id", asyncHandler(getPlayerProfileController));

router.post("/player/:id/report", asyncHandler(createPlayerReportController));

router.get("/player/:id/projection", asyncHandler(getPlayerProjectionController));

router.get("/player/:id/similar", asyncHandler(getPlayerSimilarController));

router.get("/player/:id/notes", asyncHandler(listPlayerNotesController));

router.post("/player/:id/notes", asyncHandler(createPlayerNoteController));

router.get("/player/:id/true-performance", asyncHandler(getTruePerformanceController));

router.get("/players/:id/events", asyncHandler(getPlayerEventsController));

export default router;
