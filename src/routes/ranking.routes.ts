import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler";
import { getRankingByPositionController } from "../controllers/ranking.controller";

const router = Router();

router.get("/:position", asyncHandler(getRankingByPositionController));

export default router;
