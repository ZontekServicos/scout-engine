import { Router, Request, Response, NextFunction } from "express";
import { applyReportDecision, deleteReport, getReportById, getReports } from "../reports/reports.service";
import { decisionSchema } from "../validators/decision.validator";
import { validate } from "../lib/validate";
import { successResponse } from "../lib/apiResponse";

const router = Router();

router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, limit, type, playerId } = req.query;

    const result = await getReports({
      page: Number(page) || 1,
      limit: Number(limit) || 10,
      type: typeof type === "string" ? type : undefined,
      playerId: typeof playerId === "string" ? playerId : undefined,
    });

    res.json(successResponse(result));
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reportId = typeof req.params.id === "string" ? req.params.id : req.params.id[0];

    const result = await getReportById(reportId);
    res.json(successResponse(result));
  } catch (error) {
    next(error);
  }
});

router.get("/:id/explainability", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reportId = typeof req.params.id === "string" ? req.params.id : req.params.id[0];
    const report: any = await getReportById(reportId);

    const explainability = report?.output?.explainability?.playerA ??
      report?.output?.explainability ?? {
        topFactors: [],
        riskDrivers: [],
        positiveSignals: [],
        negativeSignals: [],
      };

    res.json(successResponse(explainability));
  } catch (error) {
    next(error);
  }
});

router.patch(
  "/:id/decision",
  validate(decisionSchema, "body"),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const reportId = typeof req.params.id === "string" ? req.params.id : req.params.id[0];

      const updated = await applyReportDecision(reportId, req.body);

      res.json(successResponse(updated));
    } catch (error) {
      next(error);
    }
  },
);

router.delete("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reportId = typeof req.params.id === "string" ? req.params.id : req.params.id[0];

    const result = await deleteReport(reportId);

    res.json(successResponse(result));
  } catch (error) {
    next(error);
  }
});

export default router;
