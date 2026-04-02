import { Request, Response } from "express";
import { successResponse } from "../lib/apiResponse";
import { buildPlayerIntelligenceProfile } from "../domain/player-intelligence/buildPlayerIntelligenceProfile";
import { profileToNormalized } from "../analysis-engine/adapters/profile.adapter";
import { comparePlayers } from "../analysis-engine/comparators/player.comparator";
import { generateComparisonReport } from "../analysis-engine/report-generator/comparison.report";
import { compareParamsSchema } from "../validators/compare.validators";

/**
 * GET /compare/engine/:idA/:idB
 *
 * Returns a PlayerComparisonOutput produced by the analysis-engine.
 * Uses PlayerIntelligenceProfile blocks → NormalizedPlayerStats → engine comparator.
 */
export async function compareEngineByIdsController(req: Request, res: Response) {
  const { idA, idB } = compareParamsSchema.parse(req.params);

  const [profileA, profileB] = await Promise.all([
    buildPlayerIntelligenceProfile(idA),
    buildPlayerIntelligenceProfile(idB),
  ]);

  const statsA = profileToNormalized(profileA);
  const statsB = profileToNormalized(profileB);

  const raw = comparePlayers(statsA, statsB);
  const result = generateComparisonReport(raw);

  return res.json(successResponse(result));
}
