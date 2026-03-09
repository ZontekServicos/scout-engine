import { Request, Response } from "express";
import { successResponse } from "../lib/apiResponse";
import { withCache } from "../lib/cache";
import { getMarketAlerts } from "../scout/alerts.service";

export async function getAlertsController(_req: Request, res: Response) {
  const alerts = await withCache("alerts:market", 60, () => getMarketAlerts());
  return res.json(successResponse(alerts));
}
