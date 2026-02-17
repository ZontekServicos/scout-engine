import { Router, Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";
import { successResponse } from "../lib/apiResponse";

const router = Router();

router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { position, page = "1", limit = "10" } = req.query;

    const pageNumber = Number(page);
    const limitNumber = Number(limit);
    const skip = (pageNumber - 1) * limitNumber;

    const where = position ? { position: String(position) } : {};

    const [players, total] = await Promise.all([
      prisma.player.findMany({
        where,
        skip,
        take: limitNumber,
      }),
      prisma.player.count({ where }),
    ]);

    return res.json(
      successResponse({
        page: pageNumber,
        limit: limitNumber,
        total,
        players,
      }),
    );
  } catch (error) {
    next(error);
  }
});

export default router;
