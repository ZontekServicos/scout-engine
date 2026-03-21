import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler";
import { validate } from "../lib/validate";
import { deleteScoutReportController } from "../scout-report.controller";
import { scoutReportParamsSchema } from "../validators/report.validators";

const router = Router();

router.delete("/:id", validate(scoutReportParamsSchema, "params"), asyncHandler(deleteScoutReportController));

export default router;
