import { Router, Request, Response } from "express";
import { getAnalyticsOverview } from "../analytics/analytics.service";
import { successResponse } from "../lib/apiResponse";
import { asyncHandler } from "../lib/asyncHandler";

const router = Router();

router.get(
  "/overview",
  asyncHandler(async (req: Request, res: Response) => {
    const { from, to, days } = req.query;

    const result = await getAnalyticsOverview({
      from: from as string,
      to: to as string,
      days: days ? Number(days) : undefined,
    });

    res.json(successResponse(result));
  }),
);

export default router;
