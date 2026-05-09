import { Request, Response }       from "express";
import { successResponse }          from "../lib/apiResponse";
import { withCache }                from "../lib/cache";
import { SearchHistoryService }     from "../services/search-history.service";

function asInt(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

// ─── GET /api/search-history ──────────────────────────────────────────────────

export async function getSearchHistoryController(req: Request, res: Response) {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, error: "Nao autenticado" });

  const page  = asInt(req.query.page,  1);
  const limit = asInt(req.query.limit, 20);

  const cacheKey = `search-history:list:${userId}:${page}:${limit}`;
  const result = await withCache(cacheKey, 30, () =>
    SearchHistoryService.getHistory(userId, page, limit),
  );

  return res.json(
    successResponse(result.entries, {
      total:   result.total,
      page:    result.page,
      limit:   result.limit,
      hasMore: result.hasMore,
    }),
  );
}

// ─── DELETE /api/search-history/:id ──────────────────────────────────────────

export async function deleteSearchHistoryEntryController(req: Request, res: Response) {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, error: "Nao autenticado" });

  const id = typeof req.params.id === "string" ? req.params.id : "";
  if (!id) return res.status(400).json({ success: false, error: "ID obrigatorio" });

  await SearchHistoryService.deleteEntry(id, userId);
  return res.json(successResponse(null));
}

// ─── DELETE /api/search-history ───────────────────────────────────────────────

export async function clearSearchHistoryController(req: Request, res: Response) {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, error: "Nao autenticado" });

  await SearchHistoryService.clearHistory(userId);
  return res.json(successResponse(null));
}
