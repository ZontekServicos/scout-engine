import { NextFunction, Request, Response } from "express";
import { logger } from "../lib/logger";

export function errorMiddleware(error: any, req: Request, res: Response, _next: NextFunction) {
  logger.error("Global error", {
    method: req.method,
    path: req.originalUrl,
    message: error?.message ?? "Unknown error",
  });

  const statusCode = error?.statusCode || 500;

  res.status(statusCode).json({
    success: false,
    error: error?.message || "Internal Server Error",
  });
}

