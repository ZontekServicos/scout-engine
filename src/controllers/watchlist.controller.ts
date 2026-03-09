import { Request, Response } from "express";
import { successResponse } from "../lib/apiResponse";
import { listWatchlist, removeWatchlist, upsertWatchlist } from "../scout/watchlist.store";

function mapWatchlistItem(item: { id: string; playerId: string; nomeJogador?: string; createdAt: string }) {
  return {
    id: item.id,
    playerId: item.playerId,
    playerName: item.nomeJogador ?? null,
    nomeJogador: item.nomeJogador ?? null,
    createdAt: item.createdAt,
  };
}

export async function addWatchlistItemController(req: Request, res: Response) {
  const playerId = String(req.body.playerId ?? "");
  const playerNameValue = req.body.playerName ?? req.body.nomeJogador;
  const nomeJogador = playerNameValue ? String(playerNameValue) : undefined;
  const item = upsertWatchlist(playerId, nomeJogador);
  return res.json(successResponse(mapWatchlistItem(item)));
}

export async function listWatchlistController(_req: Request, res: Response) {
  return res.json(successResponse(listWatchlist().map(mapWatchlistItem)));
}

export async function removeWatchlistItemController(req: Request, res: Response) {
  const watchlistId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const removed = removeWatchlist(watchlistId);
  return res.json(successResponse({ removed }));
}
