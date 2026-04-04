/**
 * sportmonks.client.ts
 *
 * Sportmonks Football API v3 — typed HTTP client.
 * Base URL : https://api.sportmonks.com/v3/football
 * Docs     : https://docs.sportmonks.com/football
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
// buildFilters — object → Sportmonks filter string
// ---------------------------------------------------------------------------

/**
 * Scalar value accepted per filter key.
 * Arrays are serialised as "key:v1,v2".
 * null / undefined / empty arrays are silently dropped.
 */
export type FilterValue = string | number | (string | number)[] | null | undefined;
export type FilterInput = Record<string, FilterValue>;

/**
 * Converts a plain object into the Sportmonks v3 filter string.
 *
 * @example
 * buildFilters({ league_id: 648 })
 * // → "league_id:648"
 *
 * buildFilters({ league_id: [648, 651], season_id: 123 })
 * // → "league_id:648,651;season_id:123"
 *
 * buildFilters({ league_id: null, season_id: undefined })
 * // → ""  (both dropped)
 */
export function buildFilters(input: FilterInput): string {
  const parts: string[] = [];

  for (const [key, value] of Object.entries(input)) {
    if (value === null || value === undefined) continue;

    if (Array.isArray(value)) {
      const valid = value.filter((v) => v !== null && v !== undefined);
      if (valid.length === 0) continue;
      parts.push(`${key}:${valid.join(",")}`);
    } else {
      parts.push(`${key}:${value}`);
    }
  }

  return parts.join(",");
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
const BASE_DELAY_MS = 1_000; // doubles on each attempt: 1 s → 2 s → 4 s

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function fetchWithRetry(url: string): Promise<Response> {
  let lastError: Error = new Error("unknown");

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const res = await fetch(url, { headers: { Accept: "application/json" } });

    if (res.ok) return res;

    // Rate-limit or transient server error → back off and retry
    if (res.status === 429 || res.status >= 500) {
      const delay = BASE_DELAY_MS * Math.pow(2, attempt);
      const body  = await res.text().catch(() => "");
      console.warn(
        `[sportmonks] HTTP ${res.status} — retry ${attempt + 1}/${MAX_RETRIES} in ${delay}ms\n` +
        (body ? `  ${body.slice(0, 200)}` : ""),
      );
      await sleep(delay);
      lastError = new Error(`HTTP ${res.status}`);
      continue;
    }

    // 4xx (not 429) → not retryable; surface the API message
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
  /** Filter object — serialised by buildFilters() into "key:value;key2:value2". */
  filters?: FilterInput | string;
  /** Comma-separated includes, e.g. "participants,scores,state". */
  include?: string;
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

  if (options.include) url.searchParams.set("include",   options.include);
  if (options.page)    url.searchParams.set("page",      String(options.page));
  if (options.perPage) url.searchParams.set("per_page",  String(options.perPage));

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
// Leagues
// ---------------------------------------------------------------------------

export async function fetchLeagues(): Promise<SportmonksLeague[]> {
  return smGetAll<SportmonksLeague>("/leagues", { include: "country" });
}

export async function fetchLeagueById(leagueId: number): Promise<SportmonksLeague> {
  const raw = await smGet<{ data: SportmonksLeague }>(`/leagues/${leagueId}`, {
    include: "country",
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
    include: "nationality,position,detailedPosition,team,statistics.details,league",
  });
  return raw.data;
}

export async function searchPlayerByName(name: string): Promise<SportmonksPlayer[]> {
  const raw = await smGet<{ data: SportmonksPlayer[] }>(
    `/players/search/${encodeURIComponent(name)}`,
    { include: "nationality,position,team" },
  );
  return raw.data ?? [];
}

export async function fetchPlayersByTeam(
  teamId: number,
  seasonId: number,
): Promise<SportmonksPlayer[]> {
  return smGetAll<SportmonksPlayer>("/players", {
    filters: { team_id: teamId, season_id: seasonId },
    include: "nationality,position,detailedPosition,statistics.details",
  });
}

// ---------------------------------------------------------------------------
// Fixtures — PRIMARY ingestion source
// ---------------------------------------------------------------------------

/**
 * Fetch fixtures for a league.
 * filters=league_id:X — CONFIRMED working.
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
      include: "participants,scores,state",
    },
    maxPages,
  );
}

/** ⚠ season_id filter may not work on all plans. */
export async function fetchMatchesBySeason(seasonId: number): Promise<SportmonksFixture[]> {
  return smGetAll<SportmonksFixture>("/fixtures", {
    filters: { season_id: seasonId },
    include: "scores,participants,state",
  });
}

export async function fetchMatchById(fixtureId: number): Promise<SportmonksFixture> {
  const raw = await smGet<{ data: SportmonksFixture }>(`/fixtures/${fixtureId}`, {
    include: "scores,participants,state",
  });
  return raw.data;
}

// ---------------------------------------------------------------------------
// Events — filters=fixture_id:X CONFIRMED working
// ---------------------------------------------------------------------------

export async function fetchMatchEvents(fixtureId: number): Promise<SportmonksEvent[]> {
  return smGetAll<SportmonksEvent>("/events", {
    filters: { fixture_id: fixtureId },
  });
}
