import { Router } from "express";
import { getRankingByPosition } from "../scout/ranking.service";
import { successResponse } from "../lib/apiResponse";

const router = Router();

router.get("/:position", async (req, res, next) => {
  try {
    const { position } = req.params;

    const page = Number(req.query.page ?? 1);
    const limit = Number(req.query.limit ?? 10);

    const result = await getRankingByPosition(position, page, limit);

    return res.json(successResponse(result));
  } catch (error) {
    next(error);
  }
});

export default router;
