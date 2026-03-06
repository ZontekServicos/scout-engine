import { Router } from "express";
import { prisma } from "../lib/prisma";
import { nameToSlug, normalizeName } from "../utils/normalizeName";

const router = Router();

router.post("/dev/player", async (_req, res) => {
  // Cria um registro mínimo de teste compatível com o novo schema do Player.
  const player = await prisma.player.create({
    data: {
      name: "Scout Engine Test",
      slug: nameToSlug("Scout Engine Test"),
      nameNormalized: normalizeName("Scout Engine Test"),
      positions: ["ST"],
      age: 24,
      nationality: "Brazil",
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
