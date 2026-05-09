import { Request, Response } from "express";
import { successResponse } from "../lib/apiResponse";
import { prisma } from "../lib/prisma";
import { mapEvent } from "../mappers/event.mapper";

function asInt(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

const VALID_TYPES = new Set([
  "PLAYER_VIEWED",
  "PLAYER_COMPARED",
  "SEARCH_PERFORMED",
  "REPORT_GENERATED",
  "GEM_OPENED",
]);

export async function getEventHistoryController(req: Request, res: Response) {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ success: false, error: "Nao autenticado" });
  }

  const limit = Math.min(asInt(req.query.limit, 20), 100);
  const typeFilter = typeof req.query.type === "string" && VALID_TYPES.has(req.query.type)
    ? req.query.type
    : undefined;

  const events = await prisma.event.findMany({
    where: {
      userId,
      ...(typeFilter ? { type: typeFilter } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return res.json(successResponse(events.map(mapEvent)));
}
