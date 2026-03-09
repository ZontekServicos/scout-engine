import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler";
import {
  createPlayerNoteController,
  getPlayerProfileController,
  getPlayerProjectionController,
  getPlayerSimilarController,
  listPlayerNotesController,
  listPlayersController,
  searchPlayersController,
} from "../controllers/player.controller";

const router = Router();

router.get("/players", asyncHandler(listPlayersController));
router.get("/players/search", asyncHandler(searchPlayersController));

router.get("/player/:id", asyncHandler(getPlayerProfileController));

router.get("/player/:id/projection", asyncHandler(getPlayerProjectionController));

router.get("/player/:id/similar", asyncHandler(getPlayerSimilarController));

router.get("/player/:id/notes", asyncHandler(listPlayerNotesController));

router.post("/player/:id/notes", asyncHandler(createPlayerNoteController));

export default router;

