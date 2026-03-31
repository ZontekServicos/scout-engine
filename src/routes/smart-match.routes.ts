import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler";
import { validate } from "../lib/validate";
import { getSmartMatchController } from "../smart-match.controller";
import { smartMatchParamsSchema } from "../validators/smart-match.validators";

const router = Router();

router.get("/:playerId", validate(smartMatchParamsSchema, "params"), asyncHandler(getSmartMatchController));

export default router;
