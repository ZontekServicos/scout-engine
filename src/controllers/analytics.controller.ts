import { Request, Response } from "express";
import { successResponse } from "../lib/apiResponse";
import { getAnalyticsOverview } from "../analytics/analytics.service";

export async function getAnalyticsOverviewController(req: Request, res: Response) {
  const { from, to, days } = req.query;
  const result = await getAnalyticsOverview({
    from: from as string,
    to: to as string,
    days: typeof days === "string" ? Number(days) : undefined,
  });

  return res.json(successResponse(result));
}
