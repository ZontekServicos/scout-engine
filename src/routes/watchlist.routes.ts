import { Router } from "express";
import { successResponse } from "../lib/apiResponse";
import { listWatchlist, removeWatchlist, upsertWatchlist } from "../scout/watchlist.store";

const router = Router();

router.post("/", (req, res) => {
  const playerId = String(req.body.playerId ?? "");
  const nomeJogador = req.body.nomeJogador ? String(req.body.nomeJogador) : undefined;
  const item = upsertWatchlist(playerId, nomeJogador);
  res.json(successResponse(item));
});

router.get("/", (_req, res) => {
  res.json(successResponse(listWatchlist()));
});

router.delete("/:id", (req, res) => {
  const removed = removeWatchlist(req.params.id);
  res.json(successResponse({ removed }));
});

export default router;

