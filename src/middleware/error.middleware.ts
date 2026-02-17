import { Request, Response, NextFunction } from "express";

export function errorMiddleware(error: any, req: Request, res: Response, next: NextFunction) {
  console.error("🔥 GLOBAL ERROR:", error);

  const statusCode = error.statusCode || 500;

  res.status(statusCode).json({
    success: false,
    error: error.message || "Internal Server Error",
  });
}
