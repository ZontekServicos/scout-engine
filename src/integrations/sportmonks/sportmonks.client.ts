/**
 * sportmonks.client.ts
 *
 * Sportmonks Football API v3 client.
 * Base URL : https://api.sportmonks.com/v3/football
 * Docs     : https://docs.sportmonks.com/football
 *
 * Filter support reality (tested):
 *   /leagues              — no filter needed (fetch all)       ✓
 *   /fixtures?league_id   — filter works                       ✓
 *   /events?fixture_id    — filter works                       ✓
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
// Internal: token
// ---------------------------------------------------------------------------

function getApiToken(): string {
  const token = process.env.SPORTMONKS_API_TOKEN;
  if (!token) throw new Error("SPORTMONKS_API_TOKEN is not configured");
  return token;
}

// ---------------------------------------------------------------------------
// Internal: single-page GET
// ---------------------------------------------------------------------------

interface SmGetOptions {
  filters?: string;  // snake_case, e.g. "league_id:325"
  include?: string;  // comma-separated, e.g. "participants,scores,state"
  page?: number;
  per_page?: number;
}

async function smGet<T>(path: string, options: SmGetOptions = {}): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set("api_token", getApiToken());

  if (options.filters)  url.searchParams.set("filters",  options.filters);
  if (options.include)  url.searchParams.set("include",  options.include);
  if (options.page)     url.searchParams.set("page",     String(options.page));
  if (options.per_page) url.searchParams.set("per_page", String(options.per_page));

  const response = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    let body = "";
    try { body = await response.text(); } catch { /* ignore */ }
    throw new Error(
      `Sportmonks ${response.status} ${response.statusText} — ${path}\n` +
      (body ? `  Body: ${body.slice(0, 400)}` : ""),
    );
  }

  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Internal: paginated GET — auto-fetches all pages up to maxPages
// ---------------------------------------------------------------------------

interface PaginatedResponse<T> {
  data: T[];
  meta?: {
    pagination?: {
      total_pages?: number;
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
// Leagues  — no filter support, fetch all and filter client-side
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
// Seasons  — filter support UNCONFIRMED; use fetchSeasonById for single lookup
// ---------------------------------------------------------------------------

export async function fetchSeasonsByLeague(leagueId: number): Promise<SportmonksSeason[]> {
  // /seasons?filters=league_id:X returns 400 on some plans.
  // This function is kept for compatibility but may fail.
  return smGetAll<SportmonksSeason>("/seasons", { filters: `league_id:${leagueId}` });
}

export async function fetchSeasonById(seasonId: number): Promise<SportmonksSeason> {
  const raw = await smGet<{ data: SportmonksSeason }>(`/seasons/${seasonId}`);
  return raw.data;
}

// ---------------------------------------------------------------------------
// Teams  — filter support UNCONFIRMED; prefer extracting from fixture participants
// ---------------------------------------------------------------------------

export async function fetchTeamsBySeason(seasonId: number): Promise<SportmonksTeam[]> {
  return smGetAll<SportmonksTeam>("/teams", { filters: `season_id:${seasonId}` });
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

export async function fetchPlayersByTeam(teamId: number, seasonId: number): Promise<SportmonksPlayer[]> {
  return smGetAll<SportmonksPlayer>("/players", {
    filters: `team_id:${teamId};season_id:${seasonId}`,
    include: "nationality,position,detailedPosition,statistics.details",
  });
}

// ---------------------------------------------------------------------------
// Fixtures — PRIMARY ingestion source
// ---------------------------------------------------------------------------

/**
 * Fetch fixtures by league_id — CONFIRMED working filter on /fixtures.
 * maxPages controls volume: 4 pages × 25 fixtures = ~100 per call.
 */
export async function fetchFixturesByLeague(
  leagueId: number,
  maxPages = 4,
): Promise<SportmonksFixture[]> {
  return smGetAll<SportmonksFixture>(
    "/fixtures",
    {
      filters: `league_id:${leagueId}`,
      include: "participants,scores,state",
    },
    maxPages,
  );
}

/**
 * Fetch fixtures by season_id — filter may not work on all plans.
 */
export async function fetchMatchesBySeason(seasonId: number): Promise<SportmonksFixture[]> {
  return smGetAll<SportmonksFixture>("/fixtures", {
    filters: `season_id:${seasonId}`,
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
// Events — filters=fixture_id:{id} CONFIRMED working
// ---------------------------------------------------------------------------

export async function fetchMatchEvents(fixtureId: number): Promise<SportmonksEvent[]> {
  return smGetAll<SportmonksEvent>("/events", {
    filters: `fixture_id:${fixtureId}`,
  });
}
