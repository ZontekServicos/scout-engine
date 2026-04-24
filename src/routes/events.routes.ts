import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler";
import { getUserEventHistoryController } from "../controllers/user-event.controller";

const router = Router();

router.get("/history", asyncHandler(getUserEventHistoryController));

export default router;
