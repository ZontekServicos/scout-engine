import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler";
import { compareByIdsController, compareByNamesController } from "../controllers/compare.controller";
import { compareEngineByIdsController } from "../controllers/compare-engine.controller";

const router = Router();
router.get("/by-name/:nameA/:nameB", asyncHandler(compareByNamesController));

// Engine endpoint — must be registered BEFORE the generic /:idA/:idB pattern
router.get("/engine/:idA/:idB", asyncHandler(compareEngineByIdsController));

router.get("/:idA/:idB", asyncHandler(compareByIdsController));

export default router;
