/**
 * sportmonks.strategy.ts — Strategy layer for fixture fetching
 *
 * Sits above sportmonks.client.ts. Adds:
 *   - Filter capability discovery via /filters endpoint + DB cache
 *   - Multi-strategy fixture fetching with automatic fallback
 *   - Bulk and incremental sync wrappers
 *
 * Cache: stored in ApiStrategyCache (PostgreSQL via Prisma).
 * Survives deploys. TTL: 24 h.
 *
 * Strategy priority for fetching fixtures by league:
 *   1. FILTER_LEAGUE_ID  — /fixtures?filters=league_id:X          ← confirmed working
 *   2. FILTER_SEASON_ID  — /fixtures?filters=season_id:Y          ← needs seasonId
 *   3. BULK_CLIENT_SIDE  — /fixtures?filters=populate, filter JS  ← last resort
 */

import { prisma } from "../../lib/prisma";
import {
  fetchAvailableFilters,
  fetchFixturesByLeague,
  fetchFixturesBySeason,
  fetchAllFixturesBulk,
  fetchFixturesAfterById,
} from "./sportmonks.client";
import { isTransientError, errorLabel } from "../../lib/errors";
import type { SportmonksFixture } from "./sportmonks.types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FixtureStrategy =
  | "FILTER_LEAGUE_ID"   // /fixtures?filters=league_id:X
  | "FILTER_SEASON_ID"   // /fixtures?filters=season_id:Y
  | "BULK_CLIENT_SIDE";  // /fixtures?filters=populate → filter in JS

export interface StrategyEntry {
  strategy: FixtureStrategy;
  supportsFilters: boolean;
  confirmedAt: string;
  expiresAt: string;
  note?: string;
}

export interface EndpointFilterInfo {
  endpoint: string;
  supportedFilters: string[];
  expiresAt: string;
}

// ---------------------------------------------------------------------------
// DB cache helpers
// ---------------------------------------------------------------------------

const TTL_HOURS     = 24;
const STRATEGY_KEY  = "fixtures_by_league_v3";

function futureIso(hours = TTL_HOURS): string {
  return new Date(Date.now() + hours * 3_600_000).toISOString();
}

function isStale(entry: { expiresAt: string }): boolean {
  return new Date(entry.expiresAt) < new Date();
}

async function dbRead<T>(key: string): Promise<T | null> {
  try {
    const row = await prisma.apiStrategyCache.findUnique({ where: { key } });
    if (!row) return null;
    if (new Date(row.expiresAt) < new Date()) return null; // expired
    return row.data as T;
  } catch {
    return null; // DB unavailable — treat as cache miss
  }
}

async function dbWrite(key: string, data: unknown, expiresAt: string): Promise<void> {
  try {
    await prisma.apiStrategyCache.upsert({
      where: { key },
      update: { data: data as never, expiresAt: new Date(expiresAt) },
      create: { key, data: data as never, expiresAt: new Date(expiresAt) },
    });
  } catch (err) {
    // Non-fatal — cache miss on next call is recoverable
    console.warn(`[strategy] Failed to write cache key "${key}": ${(err as Error).message}`);
  }
}

// ---------------------------------------------------------------------------
// detectSupportedFilters — /filters API + DB cache
// ---------------------------------------------------------------------------

/**
 * Returns the list of filter names supported by a given endpoint path,
 * as reported by the Sportmonks /filters discovery endpoint.
 *
 * Results are cached in ApiStrategyCache for TTL_HOURS hours.
 * If /filters fails (plan restriction, network error), returns an empty array.
 *
 * @example
 * const info = await detectSupportedFilters("/fixtures");
 * info.supportedFilters  // ["idAfter", "leagueIds", "populate", ...]
 */
export async function detectSupportedFilters(endpoint: string): Promise<EndpointFilterInfo> {
  const cacheKey = `endpoint_filters:${endpoint}`;
  const cached = await dbRead<EndpointFilterInfo>(cacheKey);

  if (cached && !isStale(cached)) {
    console.log(`[strategy] /filters cache hit: ${endpoint} (${cached.supportedFilters.length} filters)`);
    return cached;
  }

  console.log(`[strategy] Querying /filters for ${endpoint}…`);
  const supportedFilters: string[] = [];

  try {
    const all = await fetchAvailableFilters();
    const normalised = endpoint.replace(/^\//, "");
    const matched = all.filter((f) => f.route === endpoint || f.route === normalised);
    supportedFilters.push(...matched.map((f) => f.name));
    console.log(`[strategy] Found ${supportedFilters.length} filter(s) for ${endpoint}`);
  } catch (err) {
    console.warn(`[strategy] /filters query failed: ${errorLabel(err)}`);
    console.warn("[strategy] Continuing without filter capability info");
  }

  const entry: EndpointFilterInfo = {
    endpoint,
    supportedFilters,
    expiresAt: futureIso(),
  };

  await dbWrite(cacheKey, entry, entry.expiresAt);
  return entry;
}

// ---------------------------------------------------------------------------
// detectFixtureStrategy — probe + DB cache
// ---------------------------------------------------------------------------

function makeEntry(strategy: FixtureStrategy, note?: string): StrategyEntry {
  return {
    strategy,
    supportsFilters: strategy !== "BULK_CLIENT_SIDE",
    confirmedAt: new Date().toISOString(),
    expiresAt: futureIso(),
    note,
  };
}

/**
 * Determines the best strategy for fetching fixtures by league.
 * Probes the API once and caches the result in ApiStrategyCache (DB).
 * Cache survives deploys — no re-probe on each Railway restart.
 *
 * @param probeLeagueId   League ID used for the probe (must have fixtures)
 * @param probeSeasonId   Optional — enables FILTER_SEASON_ID as a candidate
 */
export async function detectFixtureStrategy(
  probeLeagueId: number,
  probeSeasonId?: number,
): Promise<StrategyEntry> {
  const cached = await dbRead<StrategyEntry>(STRATEGY_KEY);

  if (cached && !isStale(cached)) {
    console.log(`[strategy] Strategy cache hit: ${cached.strategy}`);
    return cached;
  }

  console.log("[strategy] Probing fixture strategy…");

  const save = async (entry: StrategyEntry): Promise<StrategyEntry> => {
    await dbWrite(STRATEGY_KEY, entry, entry.expiresAt);
    return entry;
  };

  // 1 — filters=league_id:X
  try {
    await fetchFixturesByLeague(probeLeagueId, 1);
    console.log("[strategy] ✓ FILTER_LEAGUE_ID confirmed");
    return save(makeEntry("FILTER_LEAGUE_ID", "filters=league_id:X works"));
  } catch (err) {
    const cls = isTransientError(err) ? "transient" : "permanent";
    console.warn(`[strategy] ✗ FILTER_LEAGUE_ID (${cls}): ${(err as Error).message}`);
    // Only skip to next strategy if error is permanent (permanent = filter unsupported)
    // Transient errors (429, 5xx) mean we should still try this strategy next time
    if (!isTransientError(err) && probeSeasonId == null) {
      // No seasonId fallback available — go straight to BULK
    }
  }

  // 2 — filters=season_id:Y
  if (probeSeasonId != null) {
    try {
      await fetchFixturesBySeason(probeSeasonId, 1);
      console.log("[strategy] ✓ FILTER_SEASON_ID confirmed");
      return save(makeEntry("FILTER_SEASON_ID", `filters=season_id:Y works (probe=${probeSeasonId})`));
    } catch (err) {
      console.warn(`[strategy] ✗ FILTER_SEASON_ID (${isTransientError(err) ? "transient" : "permanent"}): ${(err as Error).message}`);
    }
  }

  // 3 — bulk + client-side filter (always works)
  console.warn("[strategy] ⚠ Using BULK_CLIENT_SIDE (no server-side filter works)");
  return save(makeEntry("BULK_CLIENT_SIDE", "No server-side filter available"));
}

// ---------------------------------------------------------------------------
// clearStrategyCache / getStrategyCache
// ---------------------------------------------------------------------------

/** Force re-detection on next call. Pass `endpoint` to clear only filter info. */
export async function clearStrategyCache(endpoint?: string): Promise<void> {
  try {
    if (endpoint) {
      await prisma.apiStrategyCache.deleteMany({ where: { key: `endpoint_filters:${endpoint}` } });
    } else {
      await prisma.apiStrategyCache.deleteMany({
        where: { key: { in: [STRATEGY_KEY, `endpoint_filters:/fixtures`] } },
      });
    }
    console.log(`[strategy] Cache cleared${endpoint ? ` (${endpoint})` : " (all)"}`);
  } catch (err) {
    console.warn(`[strategy] clearStrategyCache failed: ${(err as Error).message}`);
  }
}

/** Inspect current cached strategy without triggering a probe. */
export async function getStrategyCache(): Promise<StrategyEntry | null> {
  return dbRead<StrategyEntry>(STRATEGY_KEY);
}

// ---------------------------------------------------------------------------
// fetchFixturesSmart — multi-strategy with runtime fallback
// ---------------------------------------------------------------------------

export interface FetchFixturesSmartOptions {
  leagueId: number;
  seasonId?: number;
  maxPages?: number;
}

/**
 * Fetches fixtures using the best available strategy.
 *
 * First call: probes the API and caches the working strategy in DB.
 * Subsequent calls (same deploy or new deploy): reads from DB cache.
 * If the cached strategy fails at runtime, auto-rotates to the next strategy
 * and updates the DB cache.
 *
 * @example
 * const fixtures = await fetchFixturesSmart({ leagueId: 648 });
 * const fixtures = await fetchFixturesSmart({ leagueId: 648, seasonId: 25580, maxPages: 6 });
 */
export async function fetchFixturesSmart(
  opts: FetchFixturesSmartOptions,
): Promise<SportmonksFixture[]> {
  const { leagueId, seasonId, maxPages = 4 } = opts;
  let entry = await detectFixtureStrategy(leagueId, seasonId);

  const run = async (strategy: FixtureStrategy): Promise<SportmonksFixture[]> => {
    switch (strategy) {
      case "FILTER_LEAGUE_ID":
        return fetchFixturesByLeague(leagueId, maxPages);

      case "FILTER_SEASON_ID":
        if (!seasonId) {
          console.warn("[strategy] FILTER_SEASON_ID requires seasonId — falling back");
          return run("BULK_CLIENT_SIDE");
        }
        return fetchFixturesBySeason(seasonId, maxPages);

      case "BULK_CLIENT_SIDE": {
        console.warn("[strategy] BULK_CLIENT_SIDE: fetching all fixtures, filtering in memory");
        const all = await fetchAllFixturesBulk(maxPages);
        return all.filter((f) => f.league_id === leagueId);
      }
    }
  };

  try {
    return await run(entry.strategy);
  } catch (err) {
    const cls = isTransientError(err) ? "transient" : "permanent";
    console.warn(`[strategy] ${entry.strategy} failed at runtime (${cls}): ${(err as Error).message}`);

    // Only rotate on permanent failures — transient errors should be retried as-is
    if (isTransientError(err)) throw err;

    const next: FixtureStrategy =
      entry.strategy === "FILTER_LEAGUE_ID"
        ? seasonId ? "FILTER_SEASON_ID" : "BULK_CLIENT_SIDE"
        : "BULK_CLIENT_SIDE";

    entry = makeEntry(next, `Auto-rotated from ${entry.strategy} (permanent failure)`);
    await dbWrite(STRATEGY_KEY, entry, entry.expiresAt);

    return run(next);
  }
}

// ---------------------------------------------------------------------------
// Bulk + incremental wrappers
// ---------------------------------------------------------------------------

export async function fetchAllFixturesBulkSync(maxPages = 10): Promise<SportmonksFixture[]> {
  return fetchAllFixturesBulk(maxPages);
}

export async function fetchFixturesIncremental(
  lastKnownId: number,
  maxPages = 10,
): Promise<SportmonksFixture[]> {
  return fetchFixturesAfterById(lastKnownId, maxPages);
}
