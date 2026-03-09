import { Router } from "express";
import { successResponse } from "../lib/apiResponse";
import { prisma } from "../lib/prisma";

const startedAt = Date.now();
const router = Router();

router.get("/", async (_req, res) => {
  let databaseStatus = "down";

  try {
    await prisma.$queryRaw`SELECT 1`;
    databaseStatus = "up";
  } catch {
    databaseStatus = "down";
  }

  const payload = {
    status: databaseStatus === "up" ? "ok" : "degraded",
    uptime: process.uptime(),
    database: databaseStatus,
    engines: "up",
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    timestamp: new Date().toISOString(),
  };

  res.json(successResponse(payload));
});

export default router;

