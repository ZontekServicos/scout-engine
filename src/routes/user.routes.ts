import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler";
import { getProfileController, updateProfileController } from "../controllers/user-profile.controller";

const router = Router();

router.get("/profile", asyncHandler(getProfileController));
router.patch("/profile", asyncHandler(updateProfileController));

export default router;
