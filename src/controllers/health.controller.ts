import { Request, Response } from "express";
import { successResponse } from "../lib/apiResponse";

export function getHealthController(_req: Request, res: Response) {
  return res.json(
    successResponse({
      status: "ok",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    }),
  );
}
