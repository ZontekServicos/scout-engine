import { Router } from "express";
import { runScout } from "../scout/archetype.engine";

const router = Router();

router.get("/:playerId", async (req, res) => {
  const { playerId } = req.params;

  const result = await runScout(playerId);

  res.json(result);
});

export default router;
