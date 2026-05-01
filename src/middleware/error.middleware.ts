import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { logger } from "../lib/logger";
import { errorResponse } from "../lib/apiResponse";

export function errorMiddleware(error: any, req: Request, res: Response, _next: NextFunction) {
  logger.error("Global error", {
    method: req.method,
    path: req.originalUrl,
    message: error?.message ?? "Unknown error",
  });

  if (error instanceof ZodError) {
    const message = error.issues.map((issue) => issue.message).join("; ");
    return res.status(400).json(errorResponse(message || "Invalid request parameters"));
  }

  const statusCode = error?.statusCode || 500;

  res.status(statusCode).json(errorResponse(error?.message || "Internal Server Error"));
}

