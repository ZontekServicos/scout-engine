import { Router, Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";
import { successResponse } from "../lib/apiResponse";

const router = Router();

router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { position, name, page = "1", limit = "10" } = req.query;

    const pageNumber = Number(page);
    const limitNumber = Number(limit);
    const skip = (pageNumber - 1) * limitNumber;

    const where: any = {};

    if (position) {
      where.positions = { has: String(position) };
    }

    if (typeof name === "string" && name.trim().length > 0) {
      where.name = {
        contains: name.trim(),
        mode: "insensitive",
      };
    }

    const [players, total] = await Promise.all([
      prisma.player.findMany({
        where,
        skip,
        take: limitNumber,
      }),
      prisma.player.count({ where }),
    ]);

    const playersWithIdentity = players.map((player) => ({
      ...player,
      playerKey: player.id,
      nomeJogador: player.name,
    }));
    return res.json(
      successResponse({
        page: pageNumber,
        limit: limitNumber,
        total,
        players: playersWithIdentity,
      }),
    );
  } catch (error) {
    next(error);
  }
});

export default router;
