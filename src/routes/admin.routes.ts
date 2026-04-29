import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler";
import {
  adminGetUserController,
  adminUpdateUserController,
  grantTrialController,
  revokeTrialController,
} from "../controllers/user-profile.controller";

const router = Router();

router.get("/user/:id", asyncHandler(adminGetUserController));
router.patch("/user/:id", asyncHandler(adminUpdateUserController));
router.post("/users/:id/grant-trial", asyncHandler(grantTrialController));
router.post("/users/:id/revoke-trial", asyncHandler(revokeTrialController));

export default router;
