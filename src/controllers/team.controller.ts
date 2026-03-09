import { Request, Response } from "express";
import { successResponse } from "../lib/apiResponse";
import { withCache } from "../lib/cache";
import { analyzeTeamByPlayerIds } from "../scout/team-analysis.service";
import { teamAnalysisQuerySchema } from "../validators/simulation.validators";

export async function analyzeTeamController(req: Request, res: Response) {
  const { playerIds } = teamAnalysisQuerySchema.parse(req.query);
  const cacheKey = `team:analysis:${playerIds.join(",")}`;
  const result = await withCache(cacheKey, 120, () => analyzeTeamByPlayerIds(playerIds));
  return res.json(successResponse(result));
}
