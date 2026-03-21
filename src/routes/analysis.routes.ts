import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler";
import { validate } from "../lib/validate";
import {
  createComparisonAnalysisController,
  deleteAnalysisController,
  getAnalysisByIdController,
  listAnalysesController,
} from "../controllers/analysis.controller";
import {
  analysisListQuerySchema,
  analysisParamsSchema,
  createComparisonAnalysisSchema,
} from "../validators/analysis.validators";

const router = Router();

router.get("/", validate(analysisListQuerySchema, "query"), asyncHandler(listAnalysesController));

router.get("/:id", validate(analysisParamsSchema, "params"), asyncHandler(getAnalysisByIdController));

router.post("/comparison", validate(createComparisonAnalysisSchema, "body"), asyncHandler(createComparisonAnalysisController));

router.delete("/:id", validate(analysisParamsSchema, "params"), asyncHandler(deleteAnalysisController));

export default router;
