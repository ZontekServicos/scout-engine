/**
 * sportmonks.client.ts
 *
 * Sportmonks Football API v3 client.
 * Base URL : https://api.sportmonks.com/v3/football
 * Docs     : https://docs.sportmonks.com/football
 *
 * Rules enforced here:
 *  - api_token sent as query param on every request
 *  - filters use snake_case  (e.g. filters=country_id:32)
 *  - includes use comma separator  (e.g. include=participants,scores)
 *  - pagination handled automatically (fetches all pages)
 *  - error messages include HTTP status + response body for debugging
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
// Internal: raw GET — single page
// ---------------------------------------------------------------------------

interface SmGetOptions {
  filters?: string;   // e.g. "country_id:32"
  include?: string;   // comma-separated, e.g. "participants,scores"
  page?: number;
  perPage?: number;
  [key: string]: string | number | undefined;
}

async function smGet<T>(
  path: string,
  options: SmGetOptions = {},
): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set("api_token", getApiToken());

  for (const [key, value] of Object.entries(options)) {
    if (value !== undefined) {
      url.searchParams.set(key === "perPage" ? "per_page" : key, String(value));
    }
  }

  const response = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    // Include response body in error for easier debugging
    let body = "";
    try { body = await response.text(); } catch { /* ignore */ }
    throw new Error(
      `Sportmonks ${response.status} ${response.statusText} — ${path}\n` +
      (body ? `  Body: ${body.slice(0, 300)}` : ""),
    );
  }

  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Internal: paginated GET — auto-fetches all pages
// ---------------------------------------------------------------------------

interface PaginatedResponse<T> {
  data: T[];
  meta?: {
    pagination?: {
      total?: number;
      count?: number;
      per_page?: number;
      current_page?: number;
      total_pages?: number;
    };
  };
}

async function smGetAll<T>(
  path: string,
  options: Omit<SmGetOptions, "page"> = {},
  maxPages = 50, // safety cap — prevents infinite loops on misconfigured APIs
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

/**
 * Fetch leagues, optionally filtered by country.
 * filters=country_id:{id}
 */
export async function fetchLeagues(params: { countryId?: number } = {}): Promise<SportmonksLeague[]> {
  const options: SmGetOptions = { include: "country" };
  if (params.countryId) options.filters = `country_id:${params.countryId}`;
  return smGetAll<SportmonksLeague>("/leagues", options);
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

/**
 * Fetch all seasons for a league.
 * filters=league_id:{id}
 */
export async function fetchSeasonsByLeague(leagueId: number): Promise<SportmonksSeason[]> {
  return smGetAll<SportmonksSeason>("/seasons", {
    filters: `league_id:${leagueId}`,
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
 * Fetch teams participating in a season.
 * filters=season_id:{id}
 */
export async function fetchTeamsBySeason(seasonId: number): Promise<SportmonksTeam[]> {
  return smGetAll<SportmonksTeam>("/teams", {
    filters: `season_id:${seasonId}`,
  });
}

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------

/**
 * Fetch a single player with stats included.
 */
export async function fetchPlayerWithStats(playerId: number): Promise<SportmonksPlayer> {
  const raw = await smGet<{ data: SportmonksPlayer }>(`/players/${playerId}`, {
    include: "nationality,position,detailedPosition,team,statistics.details,league",
  });
  return raw.data;
}

/**
 * Search players by name.
 */
export async function searchPlayerByName(name: string): Promise<SportmonksPlayer[]> {
  const raw = await smGet<{ data: SportmonksPlayer[] }>(
    `/players/search/${encodeURIComponent(name)}`,
    { include: "nationality,position,team" },
  );
  return raw.data ?? [];
}

/**
 * Fetch players belonging to a team in a specific season.
 * filters=team_id:{id};season_id:{id}  — Sportmonks allows combining filters with semicolon
 */
export async function fetchPlayersByTeam(
  teamId: number,
  seasonId: number,
): Promise<SportmonksPlayer[]> {
  return smGetAll<SportmonksPlayer>("/players", {
    filters: `team_id:${teamId};season_id:${seasonId}`,
    include: "nationality,position,detailedPosition,statistics.details",
  });
}

// ---------------------------------------------------------------------------
// Fixtures (matches)
// ---------------------------------------------------------------------------

/**
 * Fetch all fixtures for a season.
 * filters=season_id:{id}
 */
export async function fetchMatchesBySeason(seasonId: number): Promise<SportmonksFixture[]> {
  return smGetAll<SportmonksFixture>("/fixtures", {
    filters: `season_id:${seasonId}`,
    include: "scores,participants",
  });
}

/**
 * Fetch a single fixture with full detail (scores + participants + events).
 */
export async function fetchMatchById(fixtureId: number): Promise<SportmonksFixture> {
  const raw = await smGet<{ data: SportmonksFixture }>(`/fixtures/${fixtureId}`, {
    include: "scores,participants,events",
  });
  return raw.data;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/**
 * Fetch all events for a fixture.
 * filters=fixture_id:{id}
 */
export async function fetchMatchEvents(fixtureId: number): Promise<SportmonksEvent[]> {
  return smGetAll<SportmonksEvent>("/events", {
    filters: `fixture_id:${fixtureId}`,
  });
}
