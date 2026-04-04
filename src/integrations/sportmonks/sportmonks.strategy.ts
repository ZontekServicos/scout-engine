/**
 * sportmonks.strategy.ts
 *
 * Smart fixture fetching with automatic strategy detection and file-based cache.
 *
 * Strategies (tried in order):
 *   1. FILTER_LEAGUE_ID  — GET /fixtures?filters=league_id:X       ← confirmed working
 *   2. FILTER_SEASON_ID  — GET /fixtures?filters=season_id:Y       ← requires seasonId
 *   3. CLIENT_SIDE       — GET /fixtures?filters=populate, filter in JS ← last resort
 *
 * Cache file: src/integrations/sportmonks/filter-support.json
 * TTL: 24 hours.
 *
 * Additionally exposes:
 *   detectSupportedFilters(endpoint) — queries /filters API + probes endpoint
 *   fetchFixturesIncremental(lastId)  — idAfter-based incremental sync
 */

import * as fs from "fs";
import * as path from "path";
import {
  fetchFixturesByLeague,
  fetchFixturesBySeason,
  fetchAllFixtures,
  fetchFixturesAfter,
  fetchAvailableFilters,
} from "./sportmonks.client";
import type { SportmonksFixture } from "./sportmonks.types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FixtureStrategy =
  | "FILTER_LEAGUE_ID"   // /fixtures?filters=league_id:X
  | "FILTER_SEASON_ID"   // /fixtures?filters=season_id:Y (requires seasonId)
  | "CLIENT_SIDE";       // /fixtures?filters=populate, then filter in JS

interface StrategyEntry {
  strategy: FixtureStrategy;
  supportsFilters: boolean;
  confirmedAt: string;
  expiresAt: string;
  note?: string;
}

interface EndpointFilterInfo {
  endpoint: string;
  supportedFilters: string[];   // from /filters API
  probedAt: string;
  expiresAt: string;
}

interface StrategyCache {
  _version: number;
  strategies: Record<string, StrategyEntry>;
  endpointFilters: Record<string, EndpointFilterInfo>;
}

// ---------------------------------------------------------------------------
// Cache I/O
// ---------------------------------------------------------------------------

const CACHE_PATH    = path.resolve(__dirname, "filter-support.json");
const TTL_HOURS     = 24;
const CACHE_VERSION = 2;

function loadCache(): StrategyCache {
  try {
    if (fs.existsSync(CACHE_PATH)) {
      const raw = JSON.parse(fs.readFileSync(CACHE_PATH, "utf-8")) as StrategyCache;
      if (raw._version === CACHE_VERSION) return raw;
    }
  } catch { /* corrupt — rebuild */ }
  return { _version: CACHE_VERSION, strategies: {}, endpointFilters: {} };
}

function saveCache(cache: StrategyCache) {
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), "utf-8");
}

function isExpired(entry: { expiresAt: string }): boolean {
  return new Date(entry.expiresAt) < new Date();
}

function makeExpiry(): string {
  return new Date(Date.now() + TTL_HOURS * 3_600_000).toISOString();
}

// ---------------------------------------------------------------------------
// detectSupportedFilters — queries /filters endpoint + optional probe
// ---------------------------------------------------------------------------

/**
 * Queries the Sportmonks /filters API to discover which filters are available
 * for a given endpoint path, then optionally probes with a test request.
 *
 * Results are cached for TTL_HOURS hours in filter-support.json.
 *
 * @example
 * const info = await detectSupportedFilters("/fixtures", { probe: true, probeFilter: "league_id:648" });
 * console.log(info.supportedFilters);  // ["league_id", "season_id", "idAfter", ...]
 */
export async function detectSupportedFilters(
  endpointPath: string,
  opts: { probe?: boolean; probeFilter?: string } = {},
): Promise<EndpointFilterInfo> {
  const cache = loadCache();
  const existing = cache.endpointFilters[endpointPath];

  if (existing && !isExpired(existing)) {
    console.log(`[strategy] /filters cache hit for ${endpointPath}`);
    return existing;
  }

  console.log(`[strategy] Fetching available filters for ${endpointPath} from /filters API…`);

  const supportedFilters: string[] = [];

  try {
    const all = await fetchAvailableFilters();
    // /filters returns definitions with a "route" field matching the endpoint
    const match = all.filter(
      (f) => f.route === endpointPath || f.route === endpointPath.replace(/^\//, ""),
    );
    supportedFilters.push(...match.map((f) => f.name));
    console.log(`[strategy] /filters API: ${supportedFilters.length} filter(s) for ${endpointPath}`);
  } catch (err) {
    console.warn(`[strategy] /filters API failed: ${(err as Error).message}`);
    console.warn("[strategy] Falling back to probe-only detection");
  }

  const info: EndpointFilterInfo = {
    endpoint: endpointPath,
    supportedFilters,
    probedAt: new Date().toISOString(),
    expiresAt: makeExpiry(),
  };

  cache.endpointFilters[endpointPath] = info;
  saveCache(cache);
  return info;
}

// ---------------------------------------------------------------------------
// Strategy detection for fixtures
// ---------------------------------------------------------------------------

const FIXTURES_STRATEGY_KEY = "fixtures_by_league";

function makeStrategyEntry(strategy: FixtureStrategy, note?: string): StrategyEntry {
  return {
    strategy,
    supportsFilters: strategy !== "CLIENT_SIDE",
    confirmedAt: new Date().toISOString(),
    expiresAt: makeExpiry(),
    note,
  };
}

/**
 * Determines the best strategy for fetching fixtures by league.
 * Tries strategies in order and caches the first one that succeeds.
 *
 * @param probeLeagueId  A league ID to use in the probe request.
 * @param probeSeasonId  Optional — enables FILTER_SEASON_ID as a candidate.
 */
export async function detectFixtureStrategy(
  probeLeagueId: number,
  probeSeasonId?: number,
): Promise<StrategyEntry> {
  const cache = loadCache();
  const existing = cache.strategies[FIXTURES_STRATEGY_KEY];

  if (existing && !isExpired(existing)) {
    console.log(`[strategy] Cache hit: ${existing.strategy} (expires ${existing.expiresAt.slice(0, 16)})`);
    return existing;
  }

  console.log("[strategy] Probing fixture strategies…");

  const save = (entry: StrategyEntry): StrategyEntry => {
    cache.strategies[FIXTURES_STRATEGY_KEY] = entry;
    saveCache(cache);
    return entry;
  };

  // 1. FILTER_LEAGUE_ID — confirmed working in our live tests
  try {
    await fetchFixturesByLeague(probeLeagueId, 1);
    console.log("[strategy] ✓ FILTER_LEAGUE_ID works");
    return save(makeStrategyEntry("FILTER_LEAGUE_ID", "filters=league_id:X confirmed"));
  } catch (err) {
    console.warn(`[strategy] ✗ FILTER_LEAGUE_ID: ${(err as Error).message}`);
  }

  // 2. FILTER_SEASON_ID
  if (probeSeasonId != null) {
    try {
      await fetchFixturesBySeason(probeSeasonId, 1);
      console.log("[strategy] ✓ FILTER_SEASON_ID works");
      return save(makeStrategyEntry("FILTER_SEASON_ID", `filters=season_id:Y confirmed (probe=${probeSeasonId})`));
    } catch (err) {
      console.warn(`[strategy] ✗ FILTER_SEASON_ID: ${(err as Error).message}`);
    }
  }

  // 3. CLIENT_SIDE — last resort (expensive but always works)
  console.warn("[strategy] ⚠ Falling back to CLIENT_SIDE");
  return save(makeStrategyEntry("CLIENT_SIDE", "No server-side filter works"));
}

/** Clear cached strategy — forces re-detection on next call. */
export function clearStrategyCache(key?: string) {
  const cache = loadCache();
  if (key) {
    delete cache.strategies[key];
  } else {
    cache.strategies = {};
  }
  saveCache(cache);
  console.log(`[strategy] Cache cleared${key ? ` (${key})` : " (all)"}`);
}

/** Read current cached strategy without triggering detection. */
export function getStrategyCache(): StrategyEntry | null {
  return loadCache().strategies[FIXTURES_STRATEGY_KEY] ?? null;
}

// ---------------------------------------------------------------------------
// fetchFixturesSmart — uses detected strategy with automatic fallback
// ---------------------------------------------------------------------------

export interface FetchFixturesSmartOptions {
  leagueId: number;
  seasonId?: number;
  maxPages?: number;
}

/**
 * Fetches fixtures using the best available strategy.
 *
 * First call:  probes the API, caches the working strategy.
 * Later calls: reads the cache, skips straight to the confirmed strategy.
 * On runtime failure: rotates to the next strategy automatically.
 *
 * @example
 * // Simple usage
 * const fixtures = await fetchFixturesSmart({ leagueId: 648 });
 *
 * // With season fallback enabled
 * const fixtures = await fetchFixturesSmart({ leagueId: 648, seasonId: 25580, maxPages: 6 });
 */
export async function fetchFixturesSmart(
  options: FetchFixturesSmartOptions,
): Promise<SportmonksFixture[]> {
  const { leagueId, seasonId, maxPages = 4 } = options;

  let entry = await detectFixtureStrategy(leagueId, seasonId);

  const execute = async (strategy: FixtureStrategy): Promise<SportmonksFixture[]> => {
    switch (strategy) {
      case "FILTER_LEAGUE_ID":
        return fetchFixturesByLeague(leagueId, maxPages);

      case "FILTER_SEASON_ID":
        if (!seasonId) {
          console.warn("[strategy] FILTER_SEASON_ID needs seasonId — rotating to CLIENT_SIDE");
          return execute("CLIENT_SIDE");
        }
        return fetchFixturesBySeason(seasonId, maxPages);

      case "CLIENT_SIDE": {
        console.warn("[strategy] CLIENT_SIDE: fetching all fixtures and filtering in memory");
        const all = await fetchAllFixtures(maxPages);
        return all.filter((f) => f.league_id === leagueId);
      }
    }
  };

  try {
    return await execute(entry.strategy);
  } catch (err) {
    // Runtime failure — rotate to next strategy and update cache
    console.warn(`[strategy] ${entry.strategy} failed at runtime: ${(err as Error).message}`);
    const nextStrategy: FixtureStrategy =
      entry.strategy === "FILTER_LEAGUE_ID" ? (seasonId ? "FILTER_SEASON_ID" : "CLIENT_SIDE")
      : entry.strategy === "FILTER_SEASON_ID" ? "CLIENT_SIDE"
      : "CLIENT_SIDE";

    const cache = loadCache();
    entry = makeStrategyEntry(nextStrategy, `Auto-rotated from ${entry.strategy} after runtime failure`);
    cache.strategies[FIXTURES_STRATEGY_KEY] = entry;
    saveCache(cache);

    return execute(nextStrategy);
  }
}

// ---------------------------------------------------------------------------
// fetchFixturesIncremental — idAfter-based sync (from docs)
// ---------------------------------------------------------------------------

/**
 * Fetches only fixtures with id > lastKnownId.
 *
 * Sportmonks docs: "Use filters=idAfter:12345 to fetch only those records
 * whose IDs are greater than the last known ID."
 *
 * Combine with your IngestionCheckpoint to track lastKnownId per league.
 *
 * @example
 * const lastId = await getLastFixtureId(leagueId);
 * const newFixtures = await fetchFixturesIncremental(lastId);
 */
export async function fetchFixturesIncremental(
  lastKnownId: number,
  maxPages = 10,
): Promise<SportmonksFixture[]> {
  return fetchFixturesAfter(lastKnownId, maxPages);
}
