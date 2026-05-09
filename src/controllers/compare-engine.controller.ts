import { Request, Response } from "express";
import { successResponse } from "../lib/apiResponse";
import { buildPlayerIntelligenceProfile } from "../domain/player-intelligence/buildPlayerIntelligenceProfile";
import { profileToNormalized } from "../analysis-engine/adapters/profile.adapter";
import { dbPlayerToNormalized } from "../ingestion/db-to-normalized.adapter";
import { getOrIngestPlayer } from "../ingestion/player.ingestion.service";
import { comparePlayers } from "../analysis-engine/comparators/player.comparator";
import { generateComparisonReport } from "../analysis-engine/report-generator/comparison.report";
import { compareParamsSchema } from "../validators/compare.validators";
import { emit } from "../services/event.service";
import type { NormalizedPlayerStats } from "../analysis-engine/types";

// ---------------------------------------------------------------------------
// Feature flag
// Set USE_DB_CACHE=true in .env to load from DB (Sportmonks fallback on miss)
// instead of re-running the full pipeline on every request.
// ---------------------------------------------------------------------------
const USE_DB_CACHE = process.env.USE_DB_CACHE === "true";

async function resolveStats(id: string): Promise<NormalizedPlayerStats> {
  if (USE_DB_CACHE) {
    const sportmonksId = parseInt(id, 10);
    if (!isNaN(sportmonksId)) {
      const dbPlayer = await getOrIngestPlayer(sportmonksId);
      return dbPlayerToNormalized(dbPlayer);
    }
  }

  // Default: full PlayerIntelligenceProfile pipeline (no DB dependency)
  const profile = await buildPlayerIntelligenceProfile(id);
  return profileToNormalized(profile);
}

/**
 * GET /compare/engine/:idA/:idB
 *
 * Flow (USE_DB_CACHE=false, default):
 *   buildPlayerIntelligenceProfile → profileToNormalized → comparePlayers
 *
 * Flow (USE_DB_CACHE=true):
 *   getOrIngestPlayer (DB cache → Sportmonks fallback) → dbPlayerToNormalized → comparePlayers
 */
export async function compareEngineByIdsController(req: Request, res: Response) {
  const { idA, idB } = compareParamsSchema.parse(req.params);

  const [statsA, statsB] = await Promise.all([
    resolveStats(idA),
    resolveStats(idB),
  ]);

  const raw = comparePlayers(statsA, statsB);
  const result = generateComparisonReport(raw);

  if (req.user?.id) {
    emit({
      userId: req.user.id,
      type: "PLAYER_COMPARED",
      payload: {
        playerIdA: statsA.playerId,
        playerNameA: statsA.playerName,
        playerIdB: statsB.playerId,
        playerNameB: statsB.playerName,
      },
    });
  }

  return res.json(successResponse(result));
}
