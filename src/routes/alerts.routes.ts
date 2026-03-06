import { Router } from "express";
import { successResponse } from "../lib/apiResponse";
import { getMarketAlerts } from "../scout/alerts.service";

const router = Router();

router.get("/", async (_req, res, next) => {
  try {
    const alerts = await getMarketAlerts();
    res.json(successResponse(alerts));
  } catch (error) {
    next(error);
  }
});

export default router;

