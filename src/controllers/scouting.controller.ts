import { Request, Response } from "express";
import { successResponse }         from "../lib/apiResponse";
import { withCache }               from "../lib/cache";
import { getScoutingRanking }      from "../services/scouting-ranking.service";
import type { ScoutingLabel }      from "../analytics/scouting-score.engine";

const VALID_LABELS: ScoutingLabel[] = [
  "ELITE_PROSPECT", "RISING_STAR", "VALUE_PICK", "STABLE", "DECLINING",
];

function asNumber(v: unknown): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

// ─── GET /api/scouting/ranking ────────────────────────────────────────────────

export async function getScoutingRankingController(req: Request, res: Response) {
  const position   = typeof req.query.position  === "string" ? req.query.position  : undefined;
  const leagueId   = typeof req.query.leagueId  === "string" ? req.query.leagueId  : undefined;
  const labelRaw   = typeof req.query.label     === "string" ? req.query.label     : undefined;
  const ageMin     = asNumber(req.query.ageMin);
  const ageMax     = asNumber(req.query.ageMax);
  const overallMin = asNumber(req.query.overallMin);
  const limit      = asNumber(req.query.limit);

  const label = VALID_LABELS.includes(labelRaw as ScoutingLabel)
    ? (labelRaw as ScoutingLabel)
    : undefined;

  const cacheKey = `scouting:ranking:${position ?? "all"}:${leagueId ?? ""}:${ageMin ?? ""}:${ageMax ?? ""}:${overallMin ?? ""}:${label ?? ""}:${limit ?? 50}`;

  const result = await withCache(cacheKey, 120, () =>
    getScoutingRanking({ position, leagueId, ageMin, ageMax, overallMin, label, limit }),
  );

  return res.json(successResponse(result.results, { total: result.total }));
}
