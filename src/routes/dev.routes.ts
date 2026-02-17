import { Router } from "express";
import { prisma } from "../lib/prisma";

const router = Router();

router.post("/dev/player", async (_req, res) => {
  const player = await prisma.player.create({
    data: {
      name: "Scout Engine Test",
      position: "ST",
      attributes: {
        pace: 90,
        shooting: 85,
      },
      archetype: {
        role: "Finisher",
      },
    },
  });

  res.json(player);
});

export default router;