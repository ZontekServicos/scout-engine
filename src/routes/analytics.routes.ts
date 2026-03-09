import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler";
import { getAnalyticsOverviewController } from "../controllers/analytics.controller";

const router = Router();

router.get("/overview", asyncHandler(getAnalyticsOverviewController));

export default router;
