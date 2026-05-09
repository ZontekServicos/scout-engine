import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler";
import { getEventHistoryController } from "../controllers/event.controller";

const router = Router();

router.get("/history", asyncHandler(getEventHistoryController));

export default router;
