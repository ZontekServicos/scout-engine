import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler";
import { getAlertsController } from "../controllers/alerts.controller";

const router = Router();

router.get("/", asyncHandler(getAlertsController));

export default router;

