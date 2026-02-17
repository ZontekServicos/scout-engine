import { Router } from "express";
import { getReports, getReportById, deleteReport } from "../reports/reports.service";
import { successResponse } from "../lib/apiResponse";

const router = Router();

/**
 * GET /api/reports
 */
router.get("/", async (req, res, next) => {
  try {
    const { page, limit, type, playerId } = req.query;

    const result = await getReports({
      page: Number(page) || 1,
      limit: Number(limit) || 10,
      type: type as "COMPARE" | "RANKING",
      playerId: playerId as string,
    });

    res.json(successResponse(result));
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/reports/:id
 */
router.get("/:id", async (req, res, next) => {
  try {
    const result = await getReportById(req.params.id);
    res.json(successResponse(result));
  } catch (error) {
    next(error);
  }
});

export default router;

/**
 * DELETE /api/reports/:id
 */
router.delete("/:id", async (req, res, next) => {
  try {
    const result = await deleteReport(req.params.id);
    res.json(successResponse(result));
  } catch (error) {
    next(error);
  }
});
