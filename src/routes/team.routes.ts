import { Router } from "express";
import { successResponse } from "../lib/apiResponse";
import { analyzeTeamByPlayerIds } from "../scout/team-analysis.service";
import { teamAnalysisQuerySchema } from "../validators/simulation.validators";

const router = Router();

router.get("/analysis", async (req, res, next) => {
  try {
    const { playerIds } = teamAnalysisQuerySchema.parse(req.query);
    const result = await analyzeTeamByPlayerIds(playerIds);
    return res.json(successResponse(result));
  } catch (error) {
    next(error);
  }
});

export default router;

