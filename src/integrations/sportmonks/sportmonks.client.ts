/**
 * sportmonks.client.ts
 *
 * Sportmonks Football API v3 — typed HTTP client.
 * Base URL : https://api.sportmonks.com/v3/football
 * Docs     : https://docs.sportmonks.com/football
 *
 * Syntax rules (from official docs):
 *   ;  → separates different filter fields AND different includes
 *         &filters=league_id:648;season_id:1
 *         &include=participants;events;state
 *   :  → separates key from value
 *         league_id:648
 *   ,  → separates multiple values for the SAME filter key (IDs)
 *         &filters=league_id:648,651
 *
 * Special filter keywords (no value):
 *   populate  → disables includes, raises per_page limit to 1000 (bulk sync)
 *   idAfter:X → incremental sync, only records with id > X
 *
 * Filter support (tested against live API):
 *   /leagues              — no filter needed (fetch all)       ✓
 *   /fixtures?league_id   — works                              ✓
 *   /events?fixture_id    — works                              ✓
 *   /seasons?league_id    — 400 filter unsupported             ✗
 *   /teams?season_id      — 400 filter unsupported             ✗
 *   /players?team_id      — 400 filter unsupported             ✗
 */

import type {
  SportmonksPlayer,
  SportmonksLeague,
  SportmonksSeason,
  SportmonksTeam,
  SportmonksFixture,
  SportmonksEvent,
} from "./sportmonks.types";

const BASE_URL = "https://api.sportmonks.com/v3/football";

// ---------------------------------------------------------------------------
// buildFilters — object → Sportmonks v3 filter string
// ---------------------------------------------------------------------------

export type FilterValue = string | number | (string | number)[] | null | undefined;

export interface FilterInput {
  [key: string]: FilterValue | boolean;
  /**
   * Disable all includes and raise per_page limit to 1000 — ideal for bulk/initial sync.
   * Docs: "Use filters=populate on endpoints to disable all includes."
   */
  populate?: boolean;
  /**
   * Incremental sync: only fetch records with id > value.
   * Docs: "Use filters=idAfter:12345 to fetch only those records whose IDs are greater
   * than the last known ID."
   */
  idAfter?: number;
}

/**
 * Converts a plain object into the Sportmonks v3 filter string.
 *
 * Separator rules per official docs:
 *   ;  separates different filter fields
 *   :  separates a key from its value
 *   ,  separates multiple values for the SAME key (array of IDs)
 *
 * @example
 * buildFilters({ league_id: 648 })
 * // → "league_id:648"
 *
 * buildFilters({ league_id: 648, season_id: 1 })
 * // → "league_id:648;season_id:1"
 *
 * buildFilters({ league_id: [648, 651] })
 * // → "league_id:648,651"
 *
 * buildFilters({ populate: true })
 * // → "populate"
 *
 * buildFilters({ idAfter: 5000, populate: true })
 * // → "populate;idAfter:5000"
 *
 * buildFilters({ league_id: null, season_id: undefined })
 * // → ""  (both dropped — null/undefined are ignored)
 */
export function buildFilters(input: FilterInput): string {
  const parts: string[] = [];

  // Special keywords first
  if (input.populate === true) parts.push("populate");
  if (input.idAfter != null)   parts.push(`idAfter:${input.idAfter}`);

  for (const [key, value] of Object.entries(input)) {
    if (key === "populate" || key === "idAfter") continue;
    if (value === null || value === undefined) continue;

    if (Array.isArray(value)) {
      const valid = (value as (string | number)[]).filter((v) => v != null);
      if (valid.length === 0) continue;
      parts.push(`${key}:${valid.join(",")}`); // , for multiple values of same key
    } else {
      parts.push(`${key}:${value}`);
    }
  }

  return parts.join(";"); // ; separates different filter fields
}

// ---------------------------------------------------------------------------
// buildInclude — string[] | string → Sportmonks include string
// ---------------------------------------------------------------------------

/**
 * Joins includes with ";" per the official Sportmonks v3 syntax.
 * Accepts either a pre-built string (passthrough) or an array.
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
// Internal: token
// ---------------------------------------------------------------------------

function getApiToken(): string {
  const token = process.env.SPORTMONKS_API_TOKEN;
  if (!token) throw new Error("SPORTMONKS_API_TOKEN is not configured");
  return token;
}

// ---------------------------------------------------------------------------
// Internal: retry with exponential backoff
// ---------------------------------------------------------------------------

const MAX_RETRIES   = 3;
const BASE_DELAY_MS = 1_000;

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Wraps fetch with retry + exponential backoff for 429 and 5xx.
 * Surfaces the API error body for 4xx (non-retryable).
 */
async function fetchWithRetry(url: string): Promise<Response> {
  let lastError: Error = new Error("unknown");

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const res = await fetch(url, { headers: { Accept: "application/json" } });

    if (res.ok) return res;

    if (res.status === 429 || res.status >= 500) {
      // Check for Retry-After header (docs recommend honouring it)
      const retryAfter = res.headers.get("Retry-After");
      const delay = retryAfter
        ? parseInt(retryAfter, 10) * 1_000
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

    const body = await res.text().catch(() => "");
    throw new Error(
      `Sportmonks ${res.status} ${res.statusText} — ${new URL(url).pathname}\n` +
      (body ? `  Body: ${body.slice(0, 400)}` : ""),
    );
  }

  throw lastError;
}

// ---------------------------------------------------------------------------
// Internal: single-page GET
// ---------------------------------------------------------------------------

export interface SmGetOptions {
  /** Filter object — serialised by buildFilters(). */
  filters?: FilterInput | string;
  /**
   * Related entities to include.
   * Accepts array ["participants","scores"] or pre-built string "participants;scores".
   * Uses ";" as separator per Sportmonks v3 docs.
   */
  include?: string | string[];
  page?: number;
  perPage?: number;
}

async function smGet<T>(path: string, options: SmGetOptions = {}): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set("api_token", getApiToken());

  if (options.filters) {
    const filterStr = typeof options.filters === "string"
      ? options.filters
      : buildFilters(options.filters);
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

// ---------------------------------------------------------------------------
// Internal: paginated GET — auto-fetches all pages up to maxPages
// ---------------------------------------------------------------------------

interface PaginatedResponse<T> {
  data: T[];
  meta?: {
    pagination?: {
      total_pages?:   number;
      current_page?:  number;
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
// Reference data (cache-friendly — rarely changes)
// Docs recommend caching: Countries, Types, States, Continents, Regions, Cities
// ---------------------------------------------------------------------------

export interface SportmonksFilterDefinition {
  name: string;
  route: string;
}

/**
 * Returns available filters per endpoint from the /filters API.
 * Cache this response — it changes rarely.
 * Use it to build detectSupportedFilters() logic.
 */
export async function fetchAvailableFilters(): Promise<SportmonksFilterDefinition[]> {
  const raw = await smGet<{ data: SportmonksFilterDefinition[] }>("/filters");
  return raw.data ?? [];
}

export async function fetchTypes() {
  const raw = await smGet<{ data: unknown[] }>("/types");
  return raw.data ?? [];
}

export async function fetchStates() {
  const raw = await smGet<{ data: unknown[] }>("/states");
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

/** ⚠ Returns 400 on some plans — extract season from fixture data instead. */
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

/** ⚠ Returns 400 on some plans — extract teams from fixture participants instead. */
export async function fetchTeamsBySeason(seasonId: number): Promise<SportmonksTeam[]> {
  return smGetAll<SportmonksTeam>("/teams", {
    filters: { season_id: seasonId },
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

export async function searchPlayerByName(name: string): Promise<SportmonksPlayer[]> {
  const raw = await smGet<{ data: SportmonksPlayer[] }>(
    `/players/search/${encodeURIComponent(name)}`,
    { include: ["nationality", "position", "team"] },
  );
  return raw.data ?? [];
}

export async function fetchPlayersByTeam(
  teamId: number,
  seasonId: number,
): Promise<SportmonksPlayer[]> {
  return smGetAll<SportmonksPlayer>("/players", {
    filters: { team_id: teamId, season_id: seasonId },
    include: ["nationality", "position", "detailedPosition", "statistics.details"],
  });
}

// ---------------------------------------------------------------------------
// Fixtures — PRIMARY ingestion source
// ---------------------------------------------------------------------------

/**
 * Fetch fixtures for a league — filters=league_id:X confirmed working.
 * maxPages × 25 = max fixtures returned.
 */
export async function fetchFixturesByLeague(
  leagueId: number,
  maxPages = 4,
): Promise<SportmonksFixture[]> {
  return smGetAll<SportmonksFixture>(
    "/fixtures",
    {
      filters: { league_id: leagueId },
      include: ["participants", "scores", "state"],
    },
    maxPages,
  );
}

/** ⚠ season_id filter may not work on all plans. */
export async function fetchFixturesBySeason(
  seasonId: number,
  maxPages = 4,
): Promise<SportmonksFixture[]> {
  return smGetAll<SportmonksFixture>(
    "/fixtures",
    {
      filters: { season_id: seasonId },
      include: ["scores", "participants", "state"],
    },
    maxPages,
  );
}

export async function fetchMatchById(fixtureId: number): Promise<SportmonksFixture> {
  const raw = await smGet<{ data: SportmonksFixture }>(`/fixtures/${fixtureId}`, {
    include: ["scores", "participants", "state"],
  });
  return raw.data;
}

/**
 * Bulk fixture fetch with filters=populate (no includes, 1000/page).
 * Use for initial sync — much fewer pages than standard requests.
 * Docs: "Use filters=populate on endpoints to disable all includes.
 *        This... enables a page size of 1000 records."
 */
export async function fetchAllFixtures(maxPages = 10): Promise<SportmonksFixture[]> {
  return smGetAll<SportmonksFixture>(
    "/fixtures",
    { filters: { populate: true } },
    maxPages,
  );
}

/**
 * Incremental fixture sync — only fixtures with id > lastId.
 * Docs: "Use filters=idAfter:12345 to fetch only those records whose IDs are
 *        greater than the last known ID."
 */
export async function fetchFixturesAfter(
  lastId: number,
  maxPages = 10,
): Promise<SportmonksFixture[]> {
  return smGetAll<SportmonksFixture>(
    "/fixtures",
    {
      filters: { populate: true, idAfter: lastId },
    },
    maxPages,
  );
}

// ---------------------------------------------------------------------------
// Events — filters=fixture_id:X CONFIRMED working
// ---------------------------------------------------------------------------

export async function fetchMatchEvents(fixtureId: number): Promise<SportmonksEvent[]> {
  return smGetAll<SportmonksEvent>("/events", {
    filters: { fixture_id: fixtureId },
  });
}
