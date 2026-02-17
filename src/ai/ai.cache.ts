type CacheEntry = {
  value: string;
  createdAt: number;
};

const cache = new Map<string, CacheEntry>();

const TTL = 1000 * 60 * 60; // 1 hora

export function getFromCache(key: string): string | null {
  const entry = cache.get(key);

  if (!entry) return null;

  const isExpired = Date.now() - entry.createdAt > TTL;

  if (isExpired) {
    cache.delete(key);
    return null;
  }

  return entry.value;
}

export function saveToCache(key: string, value: string) {
  cache.set(key, {
    value,
    createdAt: Date.now()
  });
}