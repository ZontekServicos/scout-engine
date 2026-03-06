import { Router, Request, Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";
import { successResponse } from "../lib/apiResponse";

const router = Router();

router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
<<<<<<< HEAD
    const { position, page = "1", limit = "10" } = req.query;
=======
    const { position, name, page = "1", limit = "10" } = req.query;
>>>>>>> 0e7fe83 (feat: update scout engine and prisma schema)

    const pageNumber = Number(page);
    const limitNumber = Number(limit);
    const skip = (pageNumber - 1) * limitNumber;

<<<<<<< HEAD
    const where = position ? { position: String(position) } : {};
=======
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
>>>>>>> 0e7fe83 (feat: update scout engine and prisma schema)

    const [players, total] = await Promise.all([
      prisma.player.findMany({
        where,
        skip,
        take: limitNumber,
      }),
      prisma.player.count({ where }),
    ]);

<<<<<<< HEAD
=======
    const playersWithIdentity = players.map((player) => ({
      ...player,
      playerKey: player.id,
      nomeJogador: player.name,
    }));

>>>>>>> 0e7fe83 (feat: update scout engine and prisma schema)
    return res.json(
      successResponse({
        page: pageNumber,
        limit: limitNumber,
        total,
<<<<<<< HEAD
        players,
=======
        players: playersWithIdentity,
>>>>>>> 0e7fe83 (feat: update scout engine and prisma schema)
      }),
    );
  } catch (error) {
    next(error);
  }
});

export default router;
