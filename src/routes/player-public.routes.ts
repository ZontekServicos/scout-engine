import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler";
import {
  getEmergingImpactController,
  getHiddenGemsController,
  getPlayerBioController,
  getPlayerEventsController,
  getPlayerEvolutionController,
  getPlayerProfileController,
  getPlayerProjectionController,
  getPlayerSimilarController,
  getTruePerformanceController,
  listPlayersController,
  searchPlayersController,
} from "../controllers/player.controller";

// Rotas publicas de leitura: dados de scouting sem informacao pessoal do
// usuario. Nenhuma escrita neste router — ver player.routes.ts para as rotas
// privadas (relatorio, notas).
const router = Router();

router.get("/players",             asyncHandler(listPlayersController));
router.get("/players/search",      asyncHandler(searchPlayersController));
router.get("/players/hidden-gems", asyncHandler(getHiddenGemsController));

router.get("/player/:id", asyncHandler(getPlayerProfileController));

router.get("/player/:id/projection", asyncHandler(getPlayerProjectionController));
router.get("/player/:id/similar", asyncHandler(getPlayerSimilarController));

router.get("/player/:id/true-performance",  asyncHandler(getTruePerformanceController));
router.get("/player/:id/emerging-impact",  asyncHandler(getEmergingImpactController));
router.get("/player/:id/bio",              asyncHandler(getPlayerBioController));
router.get("/player/:id/evolution",        asyncHandler(getPlayerEvolutionController));

router.get("/players/:id/events", asyncHandler(getPlayerEventsController));

export default router;
