/**
 * sportmonks.client.ts — Sportmonks Football API v3 HTTP layer
 *
 * Docs reference: https://docs.sportmonks.com/football
 *
 * Syntax rules (official):
 *   include=participants;events;state   — ";" separates different includes
 *   filters=league_id:648               — ":" separates key from value
 *   filters=league_id:648,651           — "," separates multiple values for the SAME key
 *   filters=populate;idAfter:12345      — ";" separates different filter tokens
 *
 * Auth: Authorization header (primary) — api_token query param (fallback)
 */

import type {
  SportmonksPlayer,
  SportmonksLeague,
  SportmonksSeason,
  SportmonksTeam,
  SportmonksSquadEntry,
  SportmonksFixture,
  SportmonksEvent,
  SportmonksHighlight,
} from "./sportmonks.types";

// ---------------------------------------------------------------------------
// Base URL
// ---------------------------------------------------------------------------

const BASE_URL = "https://api.sportmonks.com/v3/football";

// ---------------------------------------------------------------------------
// buildFilters
// ---------------------------------------------------------------------------

/**
 * Accepted value per filter key.
 * Array → multiple IDs joined by "," (same-key multi-value).
 * null / undefined / empty array → entry is silently dropped.
 */
export type FilterValue = string | number | (string | number)[] | null | undefined;

/**
 * Filter input as a typed object.
 * Special keys:
 *   populate — keyword filter (no value); disables includes, raises per_page to 1000
 *   idAfter  — incremental sync; fetches records with id > value
 */
export interface FilterObject {
  [key: string]: FilterValue | boolean;
  populate?: boolean;
  idAfter?: number;
}

/**
 * buildFilters accepts three forms:
 *   string              → returned as-is (passthrough for pre-built strings)
 *   string[]            → tokens joined by ";" (e.g. ["populate", "idAfter:123"])
 *   FilterObject        → keys serialised to "key:value" joined by ";"
 *
 * Separator rules from official docs:
 *   ";" between different filter entries (tokens or key:value pairs)
 *   "," between multiple values for the SAME key
 *
 * @example
 * buildFilters("league_id:648")
 * // → "league_id:648"
 *
 * buildFilters(["populate", "idAfter:5000"])
 * // → "populate;idAfter:5000"
 *
 * buildFilters({ league_id: 648 })
 * // → "league_id:648"
 *
 * buildFilters({ league_id: [648, 651] })
 * // → "league_id:648,651"
 *
 * buildFilters({ league_id: 648, season_id: 1 })
 * // → "league_id:648;season_id:1"
 *
 * buildFilters({ populate: true, idAfter: 5000 })
 * // → "populate;idAfter:5000"
 *
 * buildFilters({ league_id: null })
 * // → ""
 */
export function buildFilters(input: string | string[] | FilterObject): string {
  if (typeof input === "string") return input;

  if (Array.isArray(input)) return input.filter(Boolean).join(";");

  const parts: string[] = [];

  // Special keywords first (order matters: populate before idAfter)
  if (input.populate === true) parts.push("populate");
  if (typeof input.idAfter === "number") parts.push(`idAfter:${input.idAfter}`);

  for (const [key, value] of Object.entries(input)) {
    if (key === "populate" || key === "idAfter") continue;
    if (value === null || value === undefined || value === false) continue;

    if (Array.isArray(value)) {
      const valid = (value as (string | number)[]).filter((v) => v != null);
      if (valid.length === 0) continue;
      parts.push(`${key}:${valid.join(",")}`);      // "," for multi-value same key
    } else {
      parts.push(`${key}:${value}`);
    }
  }

  return parts.join(";");   // ";" between different filter entries
}

// ---------------------------------------------------------------------------
// buildInclude
// ---------------------------------------------------------------------------

/**
 * Joins include names with ";" per Sportmonks v3 docs.
 * Accepts either a pre-built string or an array.
 *
 * @example
 * buildInclude(["participants", "scores", "state"])
 * // → "participants;scores;state"
 *
 * buildInclude("participants;events")
 * // → "participants;events"  (passthrough)
 */
export function buildInclude(include: string | string[]): string {
  if (typeof include === "string") return include;
  return include.join(";");
}

// ---------------------------------------------------------------------------
// Auth token
// ---------------------------------------------------------------------------

function getApiToken(): string {
  const token = process.env.SPORTMONKS_API_TOKEN;
  if (!token) throw new Error("SPORTMONKS_API_TOKEN is not configured");
  return token;
}

// ---------------------------------------------------------------------------
// fetchWithRetry — core HTTP + retry logic
// ---------------------------------------------------------------------------

const MAX_RETRIES   = 3;
const BASE_DELAY_MS = 1_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wraps native fetch with:
 *   - Authorization header (primary auth method)
 *   - api_token query param (secondary / fallback)
 *   - Retry on 429 and 5xx with exponential backoff
 *   - Honour Retry-After header from API
 *   - Immediate failure on non-retryable 4xx with body in error message
 */
export async function fetchWithRetry(url: string): Promise<Response> {
  const token = getApiToken();
  let lastError: Error = new Error("unknown");

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: token,          // primary auth
      },
    });

    if (res.ok) return res;

    if (res.status === 429 || res.status >= 500) {
      const retryAfterHeader = res.headers.get("Retry-After");
      const delay = retryAfterHeader
        ? parseInt(retryAfterHeader, 10) * 1_000
        : BASE_DELAY_MS * Math.pow(2, attempt);

      const body = await res.text().catch(() => "");
      console.warn(
        `[sportmonks] HTTP ${res.status} — retry ${attempt + 1}/${MAX_RETRIES} in ${delay}ms\n` +
        (body ? `  ${body.slice(0, 200)}` : ""),
      );
      await sleep(delay);
      lastError = new Error(`HTTP ${res.status}`);
      continue;
    }

    // 4xx (except 429) — not retryable
    const body = await res.text().catch(() => "");
    throw new Error(
      `Sportmonks ${res.status} ${res.statusText} on ${new URL(url).pathname}\n` +
      (body ? `  Body: ${body.slice(0, 400)}` : ""),
    );
  }

  throw lastError;
}

// ---------------------------------------------------------------------------
// smGet / smGetAll — typed core
// ---------------------------------------------------------------------------

export interface SmGetOptions {
  filters?: string | string[] | FilterObject;
  include?: string | string[];
  page?: number;
  perPage?: number;
}

async function smGet<T>(path: string, options: SmGetOptions = {}): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set("api_token", getApiToken());     // secondary auth (query param)

  if (options.filters !== undefined && options.filters !== null) {
    const filterStr = buildFilters(options.filters as string | string[] | FilterObject);
    if (filterStr) url.searchParams.set("filters", filterStr);
  }

  if (options.include) {
    url.searchParams.set("include", buildInclude(options.include));
  }

  if (options.page)    url.searchParams.set("page",     String(options.page));
  if (options.perPage) url.searchParams.set("per_page", String(options.perPage));

  const res = await fetchWithRetry(url.toString());
  return res.json() as Promise<T>;
}

interface PaginatedResponse<T> {
  data: T[];
  meta?: {
    pagination?: {
      total_pages?:  number;
      current_page?: number;
    };
  };
}

async function smGetAll<T>(
  path: string,
  options: Omit<SmGetOptions, "page"> = {},
  maxPages = 50,
): Promise<T[]> {
  const results: T[] = [];
  let page = 1;

  while (true) {
    const raw = await smGet<PaginatedResponse<T>>(path, { ...options, page });
    results.push(...(raw.data ?? []));

    const totalPages = raw.meta?.pagination?.total_pages ?? 1;
    if (page >= totalPages || page >= maxPages) break;
    page++;
  }

  return results;
}

// ---------------------------------------------------------------------------
// Reference / discovery
// ---------------------------------------------------------------------------

export interface SportmonksFilterDefinition {
  name: string;
  route: string;
}

/**
 * Queries the /filters endpoint which lists available filters per endpoint.
 * Cache the result — it changes rarely (daily TTL is fine).
 */
export async function fetchAvailableFilters(): Promise<SportmonksFilterDefinition[]> {
  const raw = await smGet<{ data: SportmonksFilterDefinition[] }>("/filters");
  return raw.data ?? [];
}

// ---------------------------------------------------------------------------
// Leagues
// ---------------------------------------------------------------------------

export async function fetchLeagues(): Promise<SportmonksLeague[]> {
  return smGetAll<SportmonksLeague>("/leagues", { include: ["country"] });
}

export async function fetchLeagueById(leagueId: number): Promise<SportmonksLeague> {
  const raw = await smGet<{ data: SportmonksLeague }>(`/leagues/${leagueId}`, {
    include: ["country"],
  });
  return raw.data;
}

// ---------------------------------------------------------------------------
// Seasons
// ---------------------------------------------------------------------------

/** ⚠ Returns 400 on some plans — prefer extracting season_id from fixture data. */
export async function fetchSeasonsByLeague(leagueId: number): Promise<SportmonksSeason[]> {
  return smGetAll<SportmonksSeason>("/seasons", {
    filters: { league_id: leagueId },
  });
}

export async function fetchSeasonById(seasonId: number): Promise<SportmonksSeason> {
  const raw = await smGet<{ data: SportmonksSeason }>(`/seasons/${seasonId}`);
  return raw.data;
}

// ---------------------------------------------------------------------------
// Teams
// ---------------------------------------------------------------------------

/**
 * Fetch teams for a season using the path-based endpoint (more universally available).
 * Falls back to filter-based if the path endpoint returns 404.
 */
export async function fetchTeamsBySeason(seasonId: number): Promise<SportmonksTeam[]> {
  return smGetAll<SportmonksTeam>(`/teams/seasons/${seasonId}`, {
    include: ["country"],
  });
}

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------

export async function fetchPlayerWithStats(playerId: number): Promise<SportmonksPlayer> {
  const raw = await smGet<{ data: SportmonksPlayer }>(`/players/${playerId}`, {
    include: ["nationality", "position", "detailedPosition", "team", "statistics.details", "league"],
  });
  return raw.data;
}

/**
 * Fetch a player's stats filtered to a specific season.
 * Uses filters=playerStatisticSeasons:{seasonId} per Sportmonks v3 docs.
 */
export async function fetchPlayerStatsBySeason(
  playerId: number,
  seasonId: number,
): Promise<SportmonksPlayer> {
  const raw = await smGet<{ data: SportmonksPlayer }>(`/players/${playerId}`, {
    include: ["nationality", "position", "detailedPosition", "statistics.details"],
    filters: { playerStatisticSeasons: seasonId },
  });
  return raw.data;
}

/**
 * Fetch a player's stats for multiple seasons in a single API call.
 *
 * Sportmonks v3 supports comma-separated season IDs:
 *   filters=playerStatisticSeasons:id1,id2,id3
 *
 * Response shape:
 *   { data: { ..., statistics: [{ season_id: id1, details: [...] }, { season_id: id2, details: [...] }] } }
 *
 * Each element in `statistics[]` corresponds to one season. This lets us
 * retrieve historical data for multiple seasons without extra API calls.
 */
export async function fetchPlayerStatsMultiSeason(
  playerId: number,
  seasonIds: number[],
): Promise<SportmonksPlayer> {
  if (seasonIds.length === 0) throw new Error("seasonIds must not be empty");

  const raw = await smGet<{ data: SportmonksPlayer }>(`/players/${playerId}`, {
    include: ["nationality", "position", "detailedPosition", "statistics.details"],
    filters: { playerStatisticSeasons: seasonIds },
  });
  return raw.data;
}

export async function searchPlayerByName(name: string): Promise<SportmonksPlayer[]> {
  const raw = await smGet<{ data: SportmonksPlayer[] }>(
    `/players/search/${encodeURIComponent(name)}`,
    { include: ["nationality", "position", "team"] },
  );
  return raw.data ?? [];
}

/**
 * Fetch players (squad) for a team in a season via the squads endpoint.
 * Uses GET /squads/seasons/{seasonId}/teams/{teamId} which is available
 * on all plans (no filter restrictions).
 *
 * Stats are embedded via include=player.statistics.details.
 * Returns the same SportmonksPlayer shape expected by ingestPlayersByTeam().
 */
export async function fetchPlayersByTeam(
  teamId: number,
  seasonId: number,
): Promise<SportmonksPlayer[]> {
  const entries = await smGetAll<SportmonksSquadEntry>(
    `/squads/seasons/${seasonId}/teams/${teamId}`,
    {
      include: [
        "player",
        "player.statistics.details",
        "player.nationality",
        "player.position",
        "player.detailedPosition",
      ],
    },
  );

  // Map squad entries → SportmonksPlayer shape
  return entries
    .filter((e) => e.player != null)
    .map((e) => {
      const p = e.player!;
      // Flatten stats from all seasons (most recent season first from API)
      const stats = p.statistics?.flatMap((s) => s.details ?? []) ?? [];

      return {
        player: {
          id: p.id,
          display_name: p.display_name ?? `Player #${e.player_id}`,
          firstname: p.firstname ?? null,
          lastname: p.lastname ?? null,
          date_of_birth: p.date_of_birth ?? null,
          height: p.height ?? null,
          weight: p.weight ?? null,
          foot: p.foot ?? null,
          image_path: p.image_path ?? null,
          contract_until: p.contract_until ?? null,
          market_value: p.market_value ?? null,
          nationality: p.nationality ?? null,
          position: p.position ?? null,
          detailedPosition: p.detailedPosition ?? null,
        },
        stats,
      } satisfies SportmonksPlayer;
    });
}

// ---------------------------------------------------------------------------
// Fixtures — primary ingestion source
// ---------------------------------------------------------------------------

const FIXTURE_INCLUDE = ["participants", "scores", "state"] as const;

/** filters=league_id:X — confirmed working */
export async function fetchFixturesByLeague(
  leagueId: number,
  maxPages = 4,
): Promise<SportmonksFixture[]> {
  return smGetAll<SportmonksFixture>(
    "/fixtures",
    { filters: { league_id: leagueId }, include: [...FIXTURE_INCLUDE] },
    maxPages,
  );
}

/** ⚠ season_id filter may return 400 on some plans */
export async function fetchFixturesBySeason(
  seasonId: number,
  maxPages = 4,
): Promise<SportmonksFixture[]> {
  return smGetAll<SportmonksFixture>(
    "/fixtures",
    { filters: { season_id: seasonId }, include: [...FIXTURE_INCLUDE] },
    maxPages,
  );
}

export async function fetchMatchById(fixtureId: number): Promise<SportmonksFixture> {
  const raw = await smGet<{ data: SportmonksFixture }>(`/fixtures/${fixtureId}`, {
    include: [...FIXTURE_INCLUDE],
  });
  return raw.data;
}

/**
 * Bulk fixture sync — filters=populate removes includes, per_page rises to 1000.
 * Use for initial DB bootstrap. Returns lightweight fixture records (no nested data).
 * Docs: "Use filters=populate on endpoints to disable all includes. This ensures
 *        the response payload is minimal and enables a page size of 1000 records."
 */
export async function fetchAllFixturesBulk(maxPages = 10): Promise<SportmonksFixture[]> {
  return smGetAll<SportmonksFixture>(
    "/fixtures",
    { filters: { populate: true }, perPage: 1000 },
    maxPages,
  );
}

/**
 * Incremental fixture sync — filters=populate;idAfter:LAST_ID.
 * Fetches only fixtures with id > lastKnownId. Combine with IngestionCheckpoint.
 * Docs: "Use filters=idAfter:12345 to fetch only those records whose IDs are
 *        greater than the last known ID."
 */
export async function fetchFixturesAfterById(
  lastKnownId: number,
  maxPages = 10,
): Promise<SportmonksFixture[]> {
  return smGetAll<SportmonksFixture>(
    "/fixtures",
    { filters: { populate: true, idAfter: lastKnownId }, perPage: 1000 },
    maxPages,
  );
}

// ---------------------------------------------------------------------------
// Events — filters=fixture_id:X confirmed working
// ---------------------------------------------------------------------------

/**
 * Fetches events for a fixture via include=events;events.type on GET /fixtures/{id}.
 *
 * The standalone GET /events?filters=fixture_id:X endpoint is not available on
 * all Sportmonks plans (returns 404). Using includes on the fixture endpoint is
 * universally available.
 *
 * ⚠ PLAN RESTRICTION: Spatial data (coordinates x/y) requires a premium plan
 * that supports the "coordinates" include (code 5001 if unavailable).
 * Events are returned without coordinates on basic plans — x/y will be null.
 */
export async function fetchMatchEvents(fixtureId: number): Promise<SportmonksEvent[]> {
  try {
    const raw = await smGet<{ data: { events?: SportmonksEvent[] } }>(
      `/fixtures/${fixtureId}`,
      { include: ["events", "events.type"] },
    );
    return raw.data?.events ?? [];
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("404")) {
      console.warn(`[sportmonks] fetchMatchEvents: fixture ${fixtureId} not found`);
      return [];
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Highlights
// ---------------------------------------------------------------------------

/**
 * Highlights for a single fixture via include=highlights on GET /fixtures/{id}.
 *
 * ⚠ PLAN RESTRICTION: requires a Sportmonks plan that includes the "highlights"
 * relation. Returns an empty array if the plan does not have access (HTTP 403,
 * code 5002) instead of throwing, so callers can degrade gracefully.
 *
 * Correct endpoint: GET /v3/football/fixtures/{id}?include=highlights
 *
 * Note: GET /fixtures/highlights is NOT a real endpoint — the router parses
 *       "highlights" as a numeric fixture ID and returns 422.
 */
export async function fetchFixtureHighlights(fixtureId: number): Promise<SportmonksHighlight[]> {
  try {
    const raw = await smGet<{ data: { highlights?: SportmonksHighlight[] } }>(
      `/fixtures/${fixtureId}`,
      { include: ["highlights"] },
    );
    return raw.data?.highlights ?? [];
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("403") || msg.includes("5002")) {
      // Plan does not include highlights — degrade gracefully
      return [];
    }
    throw err;
  }
}

/**
 * Fetch highlights for multiple fixtures by iterating over each one.
 * Results from all fixtures are merged into a single array.
 *
 * ⚠ PLAN RESTRICTION: returns empty arrays per fixture when plan lacks access.
 */
export async function fetchHighlightsBatch(
  fixtureIds: number[],
  delayMs = 300,
): Promise<SportmonksHighlight[]> {
  const results: SportmonksHighlight[] = [];
  for (const id of fixtureIds) {
    const highlights = await fetchFixtureHighlights(id);
    results.push(...highlights);
    if (delayMs > 0) await sleep(delayMs);
  }
  return results;
}

/**
 * @deprecated Alias kept so existing imports compile.
 * fetchHighlightsBulk used a non-existent /highlights endpoint.
 * Use the fixture-based pipeline instead (highlights.ingestion.ts).
 */
export async function fetchHighlightsBulk(_maxPages = 20): Promise<SportmonksHighlight[]> {
  console.warn(
    "[sportmonks] fetchHighlightsBulk: /highlights endpoint does not exist on this plan. " +
    "Use the fixture-based ingestion pipeline instead.",
  );
  return [];
}

/**
 * @deprecated Alias kept so existing imports compile.
 */
export async function fetchHighlightsAfterById(
  _lastKnownId: number,
  _maxPages = 5,
): Promise<SportmonksHighlight[]> {
  console.warn(
    "[sportmonks] fetchHighlightsAfterById: /highlights endpoint does not exist on this plan. " +
    "Use the fixture-based ingestion pipeline instead.",
  );
  return [];
}
