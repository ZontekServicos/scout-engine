import NodeCache from "node-cache";

export const appCache = new NodeCache({
  stdTTL: Number(process.env.CACHE_TTL_SECONDS ?? 120),
  checkperiod: Number(process.env.CACHE_CHECK_PERIOD_SECONDS ?? 60),
  useClones: false,
});

export async function withCache<T>(key: string, ttlSeconds: number, compute: () => Promise<T>): Promise<T> {
  const cached = appCache.get<T>(key);
  if (cached !== undefined) {
    return cached;
  }

  const value = await compute();
  appCache.set(key, value, ttlSeconds);
  return value;
}

export function invalidateCacheByPrefix(prefix: string) {
  const keys = appCache.keys().filter((key) => key.startsWith(prefix));
  if (keys.length) {
    appCache.del(keys);
  }
}
