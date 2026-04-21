import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler";
import { adminGetUserController, adminUpdateUserController } from "../controllers/user-profile.controller";

const router = Router();

router.get("/user/:id", asyncHandler(adminGetUserController));
router.patch("/user/:id", asyncHandler(adminUpdateUserController));

export default router;
