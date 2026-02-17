import { Router, Request, Response } from "express";
import { getLeaderboard } from "../scout/ranking.service";
import { successResponse } from "../lib/apiResponse";
import { asyncHandler } from "../lib/asyncHandler";
import { validate } from "../lib/validate";
import { leaderboardQuerySchema } from "../validators/leaderboard.validator";

const router = Router();

router.get(
  "/",
  validate(leaderboardQuerySchema, "query"),
  asyncHandler(async (req: Request, res: Response) => {
    const { position, limit } = req.query as {
      position?: string;
      limit?: number;
    };

    const result = await getLeaderboard(position, limit ?? 10);

    res.json(successResponse(result));
  }),
);

export default router;
