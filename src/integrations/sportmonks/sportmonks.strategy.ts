/**
 * sportmonks.strategy.ts — Strategy layer for fixture fetching
 *
 * Sits above sportmonks.client.ts. Adds:
 *   - Filter capability discovery via /filters endpoint + file-based cache
 *   - Multi-strategy fixture fetching with automatic fallback
 *   - Bulk and incremental sync wrappers
 *
 * Strategy priority for fetching fixtures by league:
 *   1. FILTER_LEAGUE_ID  — /fixtures?filters=league_id:X          ← confirmed working
 *   2. FILTER_SEASON_ID  — /fixtures?filters=season_id:Y          ← needs seasonId
 *   3. BULK_CLIENT_SIDE  — /fixtures?filters=populate, filter JS  ← last resort
 *
 * Cache file: src/integrations/sportmonks/filter-support.json (TTL: 24 h)
 */

import * as fs from "fs";
import * as path from "path";
import {
  fetchAvailableFilters,
  fetchFixturesByLeague,
  fetchFixturesBySeason,
  fetchAllFixturesBulk,
  fetchFixturesAfterById,
} from "./sportmonks.client";
import type { SportmonksFixture } from "./sportmonks.types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FixtureStrategy =
  | "FILTER_LEAGUE_ID"   // /fixtures?filters=league_id:X
  | "FILTER_SEASON_ID"   // /fixtures?filters=season_id:Y
  | "BULK_CLIENT_SIDE";  // /fixtures?filters=populate → filter in JS

interface StrategyEntry {
  strategy: FixtureStrategy;
  supportsFilters: boolean;
  confirmedAt: string;
  expiresAt: string;
  note?: string;
}

interface EndpointFilterInfo {
  endpoint: string;
  supportedFilters: string[];
  expiresAt: string;
}

interface SupportCache {
  _version: 3;
  strategies: Record<string, StrategyEntry>;
  endpointFilters: Record<string, EndpointFilterInfo>;
}

// ---------------------------------------------------------------------------
// Cache I/O
// ---------------------------------------------------------------------------

const CACHE_FILE    = path.resolve(__dirname, "filter-support.json");
const TTL_HOURS     = 24;
const CACHE_VERSION = 3 as const;

function readCache(): SupportCache {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const raw = JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8")) as SupportCache;
      if (raw._version === CACHE_VERSION) return raw;
    }
  } catch { /* corrupt — rebuild */ }
  return { _version: CACHE_VERSION, strategies: {}, endpointFilters: {} };
}

function writeCache(cache: SupportCache): void {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), "utf-8");
}

function futureIso(hours = TTL_HOURS): string {
  return new Date(Date.now() + hours * 3_600_000).toISOString();
}

function isStale(entry: { expiresAt: string }): boolean {
  return new Date(entry.expiresAt) < new Date();
}

// ---------------------------------------------------------------------------
// detectSupportedFilters — /filters API + cache
// ---------------------------------------------------------------------------

/**
 * Returns the list of filter names supported by a given endpoint path,
 * as reported by the Sportmonks /filters discovery endpoint.
 *
 * Results are cached in filter-support.json for TTL_HOURS hours.
 * If /filters fails (plan restriction, network error), returns an empty array.
 *
 * @example
 * const info = await detectSupportedFilters("/fixtures");
 * info.supportedFilters  // ["idAfter", "leagueIds", "populate", ...]
 */
export async function detectSupportedFilters(endpoint: string): Promise<EndpointFilterInfo> {
  const cache = readCache();
  const existing = cache.endpointFilters[endpoint];

  if (existing && !isStale(existing)) {
    console.log(`[strategy] /filters cache hit: ${endpoint} (${existing.supportedFilters.length} filters)`);
    return existing;
  }

  console.log(`[strategy] Querying /filters for ${endpoint}…`);
  const supportedFilters: string[] = [];

  try {
    const all = await fetchAvailableFilters();
    // Normalise: route may be "/fixtures" or "fixtures" (without leading slash)
    const normalised = endpoint.replace(/^\//, "");
    const matched = all.filter(
      (f) => f.route === endpoint || f.route === normalised,
    );
    supportedFilters.push(...matched.map((f) => f.name));
    console.log(`[strategy] Found ${supportedFilters.length} filter(s) for ${endpoint}`);
  } catch (err) {
    console.warn(`[strategy] /filters query failed: ${(err as Error).message}`);
    console.warn("[strategy] Continuing without filter capability info");
  }

  const entry: EndpointFilterInfo = {
    endpoint,
    supportedFilters,
    expiresAt: futureIso(),
  };

  cache.endpointFilters[endpoint] = entry;
  writeCache(cache);
  return entry;
}

// ---------------------------------------------------------------------------
// detectFixtureStrategy — probe + cache
// ---------------------------------------------------------------------------

const STRATEGY_KEY = "fixtures_by_league_v3";

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
 * Probes the API once and caches the result for TTL_HOURS.
 * On cache hit, returns immediately without any API call.
 *
 * @param probeLeagueId   League ID used for the probe request (must have fixtures)
 * @param probeSeasonId   Optional — enables FILTER_SEASON_ID as a candidate
 */
export async function detectFixtureStrategy(
  probeLeagueId: number,
  probeSeasonId?: number,
): Promise<StrategyEntry> {
  const cache = readCache();
  const hit = cache.strategies[STRATEGY_KEY];

  if (hit && !isStale(hit)) {
    console.log(`[strategy] Strategy cache hit: ${hit.strategy}`);
    return hit;
  }

  console.log("[strategy] Probing fixture strategy…");

  const save = (entry: StrategyEntry) => {
    cache.strategies[STRATEGY_KEY] = entry;
    writeCache(cache);
    return entry;
  };

  // 1 — filters=league_id:X
  try {
    await fetchFixturesByLeague(probeLeagueId, 1);
    console.log("[strategy] ✓ FILTER_LEAGUE_ID confirmed");
    return save(makeEntry("FILTER_LEAGUE_ID", "filters=league_id:X works"));
  } catch (err) {
    console.warn(`[strategy] ✗ FILTER_LEAGUE_ID: ${(err as Error).message}`);
  }

  // 2 — filters=season_id:Y
  if (probeSeasonId != null) {
    try {
      await fetchFixturesBySeason(probeSeasonId, 1);
      console.log("[strategy] ✓ FILTER_SEASON_ID confirmed");
      return save(makeEntry("FILTER_SEASON_ID", `filters=season_id:Y works (probe=${probeSeasonId})`));
    } catch (err) {
      console.warn(`[strategy] ✗ FILTER_SEASON_ID: ${(err as Error).message}`);
    }
  }

  // 3 — bulk + client-side filter
  console.warn("[strategy] ⚠ Using BULK_CLIENT_SIDE (expensive — no server-side filter works)");
  return save(makeEntry("BULK_CLIENT_SIDE", "No server-side filter available"));
}

// ---------------------------------------------------------------------------
// clearStrategyCache / getStrategyCache
// ---------------------------------------------------------------------------

/** Force re-detection on next call. Pass `endpoint` to clear only filter info. */
export function clearStrategyCache(endpoint?: string): void {
  const cache = readCache();
  if (endpoint) {
    delete cache.endpointFilters[endpoint];
  } else {
    cache.strategies = {};
    cache.endpointFilters = {};
  }
  writeCache(cache);
  console.log(`[strategy] Cache cleared${endpoint ? ` (${endpoint})` : " (all)"}`);
}

/** Inspect current cached strategy without triggering a probe. */
export function getStrategyCache(): StrategyEntry | null {
  return readCache().strategies[STRATEGY_KEY] ?? null;
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
 * First call: probes the API and caches the working strategy.
 * Subsequent calls: reads from cache, no probe needed.
 * If the cached strategy fails at runtime, auto-rotates to the next strategy.
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
    console.warn(`[strategy] ${entry.strategy} failed at runtime: ${(err as Error).message}`);

    // Rotate to next strategy and persist
    const next: FixtureStrategy =
      entry.strategy === "FILTER_LEAGUE_ID"
        ? seasonId ? "FILTER_SEASON_ID" : "BULK_CLIENT_SIDE"
        : "BULK_CLIENT_SIDE";

    const cache = readCache();
    entry = makeEntry(next, `Auto-rotated from ${entry.strategy}`);
    cache.strategies[STRATEGY_KEY] = entry;
    writeCache(cache);

    return run(next);
  }
}

// ---------------------------------------------------------------------------
// Bulk + incremental wrappers (clean API for the ingestion layer)
// ---------------------------------------------------------------------------

/**
 * Full bulk fixture sync.
 * Uses filters=populate → no includes, per_page=1000.
 * Ideal for initial DB bootstrap.
 *
 * Docs: "For your initial sync, use filters=populate to bootstrap your
 *        dataset quickly and with fewer API calls."
 */
export async function fetchAllFixturesBulkSync(maxPages = 10): Promise<SportmonksFixture[]> {
  return fetchAllFixturesBulk(maxPages);
}

/**
 * Incremental fixture sync — only new fixtures since lastKnownId.
 * Uses filters=populate;idAfter:X → lightweight, 1000/page.
 *
 * Docs: "Use filters=idAfter:12345 to fetch only those records whose IDs
 *        are greater than the last known ID."
 *
 * @example
 * const lastId = await getMaxFixtureIdFromDb();
 * const newFixtures = await fetchFixturesIncremental(lastId);
 */
export async function fetchFixturesIncremental(
  lastKnownId: number,
  maxPages = 10,
): Promise<SportmonksFixture[]> {
  return fetchFixturesAfterById(lastKnownId, maxPages);
}
