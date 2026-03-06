type WatchlistItem = {
  id: string;
  playerId: string;
  nomeJogador?: string;
  createdAt: string;
};

const watchlist = new Map<string, WatchlistItem>();

export function upsertWatchlist(playerId: string, nomeJogador?: string): WatchlistItem {
  const existing = watchlist.get(playerId);
  if (existing) return existing;

  const item: WatchlistItem = {
    id: `${playerId}-${Date.now()}`,
    playerId,
    nomeJogador,
    createdAt: new Date().toISOString(),
  };

  watchlist.set(playerId, item);
  return item;
}

export function listWatchlist(): WatchlistItem[] {
  return Array.from(watchlist.values());
}

export function removeWatchlist(playerId: string): boolean {
  return watchlist.delete(playerId);
}

