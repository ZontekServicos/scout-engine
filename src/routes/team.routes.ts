import { Request, Response, Router } from "express";
import { asyncHandler } from "../lib/asyncHandler";
import { analyzeTeamController } from "../controllers/team.controller";
import { teamAnalysisQuerySchema } from "../validators/simulation.validators";

const router = Router();

router.get("/analysis", asyncHandler(async (req: Request, res: Response) => {
  teamAnalysisQuerySchema.parse(req.query);
  return analyzeTeamController(req, res);
}));

export default router;

