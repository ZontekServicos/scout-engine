import { NextFunction, Request, Response } from "express";

const requestsByIp = new Map<string, { count: number; windowStart: number }>();

const WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS ?? 60_000);
const LIMIT = Number(process.env.RATE_LIMIT_MAX ?? 120);

export function secureHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Content-Security-Policy", "default-src 'self'");
  next();
}

export function corsControl(req: Request, res: Response, next: NextFunction) {
  const allowedOrigins = (process.env.CORS_ORIGINS ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  const origin = req.headers.origin;

  if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin ?? "*");
  }

  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  next();
}

export function rateLimiter(req: Request, res: Response, next: NextFunction) {
  const ip = req.ip || "unknown";
  const now = Date.now();
  const current = requestsByIp.get(ip);

  if (!current || now - current.windowStart >= WINDOW_MS) {
    requestsByIp.set(ip, { count: 1, windowStart: now });
    next();
    return;
  }

  if (current.count >= LIMIT) {
    res.status(429).json({
      success: false,
      data: null,
      error: "Too many requests. Please try again later.",
    });
    return;
  }

  current.count += 1;
  requestsByIp.set(ip, current);
  next();
}

