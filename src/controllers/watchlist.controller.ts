import { Request, Response } from "express";
import { successResponse } from "../lib/apiResponse";
import { listWatchlist, removeWatchlist, upsertWatchlist } from "../scout/watchlist.store";

export async function addWatchlistItemController(req: Request, res: Response) {
  const playerId = String(req.body.playerId ?? "");
  const nomeJogador = req.body.nomeJogador ? String(req.body.nomeJogador) : undefined;
  const item = upsertWatchlist(playerId, nomeJogador);
  return res.json(successResponse(item));
}

export async function listWatchlistController(_req: Request, res: Response) {
  return res.json(successResponse(listWatchlist()));
}

export async function removeWatchlistItemController(req: Request, res: Response) {
  const watchlistId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const removed = removeWatchlist(watchlistId);
  return res.json(successResponse({ removed }));
}
