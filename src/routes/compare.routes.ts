import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler";
import { compareByIdsController, compareByNamesController } from "../controllers/compare.controller";

const router = Router();
router.get("/by-name/:nameA/:nameB", asyncHandler(compareByNamesController));

router.get("/:idA/:idB", asyncHandler(compareByIdsController));

export default router;
