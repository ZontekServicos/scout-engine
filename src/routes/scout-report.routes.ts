import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler";
import { validate } from "../lib/validate";
import {
  createScoutReportController,
  deleteScoutReportController,
  generateScoutReportController,
  getScoutReportByIdController,
  listScoutReportsController,
} from "../scout-report.controller";
import {
  createScoutReportSchema,
  generateScoutReportSchema,
  scoutReportParamsSchema,
} from "../validators/report.validators";

const router = Router();

router.post("/", validate(createScoutReportSchema, "body"), asyncHandler(createScoutReportController));
router.get("/", asyncHandler(listScoutReportsController));
router.post("/generate", validate(generateScoutReportSchema, "body"), asyncHandler(generateScoutReportController));
router.get("/:id", validate(scoutReportParamsSchema, "params"), asyncHandler(getScoutReportByIdController));
router.delete("/:id", validate(scoutReportParamsSchema, "params"), asyncHandler(deleteScoutReportController));

export default router;
