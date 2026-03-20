import { Router, Request, Response, NextFunction } from "express";
import { successResponse } from "../lib/apiResponse";
import { validate } from "../lib/validate";
import { createComparisonAnalysis, deleteAnalysis, getAnalysisById, listAnalyses } from "../analysis/analysis.service";
import { analysisParamsSchema, createComparisonAnalysisSchema } from "../validators/analysis.validators";

const router = Router();

router.get("/", async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const analyses = await listAnalyses();
    res.json(successResponse(analyses));
  } catch (error) {
    next(error);
  }
});

router.get("/:id", validate(analysisParamsSchema, "params"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = (req as any).validated.params;
    const analysis = await getAnalysisById(id);
    res.json(successResponse(analysis));
  } catch (error) {
    next(error);
  }
});

router.post(
  "/comparison",
  validate(createComparisonAnalysisSchema, "body"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const analysis = await createComparisonAnalysis((req as any).validated.body);
      res.status(201).json(successResponse(analysis));
    } catch (error) {
      next(error);
    }
  },
);

router.delete("/:id", validate(analysisParamsSchema, "params"), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = (req as any).validated.params;
    const result = await deleteAnalysis(id);
    res.json(successResponse(result));
  } catch (error) {
    next(error);
  }
});

export default router;
