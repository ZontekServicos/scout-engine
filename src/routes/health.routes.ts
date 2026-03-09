import { Router } from "express";
import { successResponse } from "../lib/apiResponse";
const router = Router();

router.get("/", (_req, res) => {
  const payload = {
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  };

  res.json(successResponse(payload));
});

export default router;

