import { Request, Response } from "express";
import { successResponse } from "../lib/apiResponse";
import { withCache } from "../lib/cache";
import { getRankingByPosition } from "../scout/ranking.service";

export async function getRankingByPositionController(req: Request, res: Response) {
  const position = Array.isArray(req.params.position) ? req.params.position[0] : req.params.position;
  const page = Number(req.query.page ?? 1);
  const limit = Number(req.query.limit ?? 10);
  const cacheKey = `ranking:${position}:${page}:${limit}`;

  const result = await withCache(cacheKey, 120, () => getRankingByPosition(position, page, limit));
  return res.json(successResponse(result));
}
