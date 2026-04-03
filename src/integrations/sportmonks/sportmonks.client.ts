import type { SportmonksPlayer } from "./sportmonks.types";
import type {
  SportmonksCountry,
  SportmonksLeague,
  SportmonksSeason,
  SportmonksTeam,
  SportmonksFixture,
  SportmonksEvent,
} from "./sportmonks.types";

const BASE_URL = "https://api.sportmonks.com/v3/football";

function getApiToken(): string {
  const token = process.env.SPORTMONKS_API_TOKEN;
  if (!token) {
    throw new Error("SPORTMONKS_API_TOKEN is not configured");
  }
  return token;
}

async function get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const token = getApiToken();
  const url = new URL(`${BASE_URL}${path}`);
  url.searchParams.set("api_token", token);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Sportmonks API error: ${response.status} ${response.statusText} — ${path}`);
  }

  return response.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Pagination helper — Sportmonks paginates with meta.pagination
// ---------------------------------------------------------------------------

async function getPaginated<T>(
  path: string,
  params: Record<string, string> = {},
): Promise<T[]> {
  const results: T[] = [];
  let page = 1;

  while (true) {
    const raw = await get<{ data: T[]; meta?: { pagination?: { total_pages?: number } } }>(
      path,
      { ...params, page: String(page) },
    );

    results.push(...(raw.data ?? []));

    const totalPages = raw.meta?.pagination?.total_pages ?? 1;
    if (page >= totalPages) break;
    page++;
  }

  return results;
}

// ---------------------------------------------------------------------------
// Player endpoints (existing)
// ---------------------------------------------------------------------------

export async function fetchPlayerWithStats(playerId: number): Promise<SportmonksPlayer> {
  const includes = [
    "nationality",
    "position",
    "detailedPosition",
    "team",
    "stats",
    "stats.type",
    "league",
  ].join(";");

  const raw = await get<{ data: SportmonksPlayer }>(`/players/${playerId}`, {
    include: includes,
  });

  return raw.data;
}

export async function searchPlayerByName(name: string): Promise<SportmonksPlayer[]> {
  const includes = ["nationality", "position", "team"].join(";");

  const raw = await get<{ data: SportmonksPlayer[] }>(`/players/search/${encodeURIComponent(name)}`, {
    include: includes,
  });

  return raw.data ?? [];
}

// ---------------------------------------------------------------------------
// Country endpoints
// ---------------------------------------------------------------------------

export async function fetchCountries(): Promise<SportmonksCountry[]> {
  return getPaginated<SportmonksCountry>("/countries");
}

export async function fetchCountryById(countryId: number): Promise<SportmonksCountry> {
  const raw = await get<{ data: SportmonksCountry }>(`/countries/${countryId}`);
  return raw.data;
}

export async function fetchCountryByName(name: string): Promise<SportmonksCountry | null> {
  const all = await fetchCountries();
  const lower = name.toLowerCase();
  return all.find((c) => c.name.toLowerCase().includes(lower)) ?? null;
}

// ---------------------------------------------------------------------------
// League endpoints
// ---------------------------------------------------------------------------

export async function fetchLeagues(params: { countryId?: number } = {}): Promise<SportmonksLeague[]> {
  const queryParams: Record<string, string> = { include: "country" };
  if (params.countryId) queryParams["filters"] = `countryId:${params.countryId}`;
  return getPaginated<SportmonksLeague>("/leagues", queryParams);
}

export async function fetchLeagueById(leagueId: number): Promise<SportmonksLeague> {
  const raw = await get<{ data: SportmonksLeague }>(`/leagues/${leagueId}`, {
    include: "country",
  });
  return raw.data;
}

// ---------------------------------------------------------------------------
// Season endpoints
// ---------------------------------------------------------------------------

export async function fetchSeasonsByLeague(leagueId: number): Promise<SportmonksSeason[]> {
  return getPaginated<SportmonksSeason>(`/seasons/leagues/${leagueId}`);
}

export async function fetchSeasonById(seasonId: number): Promise<SportmonksSeason> {
  const raw = await get<{ data: SportmonksSeason }>(`/seasons/${seasonId}`);
  return raw.data;
}

// ---------------------------------------------------------------------------
// Team endpoints
// ---------------------------------------------------------------------------

export async function fetchTeamsBySeason(seasonId: number): Promise<SportmonksTeam[]> {
  return getPaginated<SportmonksTeam>(`/teams/seasons/${seasonId}`, {
    include: "country",
  });
}

export async function fetchPlayersByTeam(
  teamId: number,
  seasonId: number,
): Promise<SportmonksPlayer[]> {
  return getPaginated<SportmonksPlayer>(
    `/players/teams/${teamId}/seasons/${seasonId}`,
    {
      include: "nationality;position;detailedPosition;stats;stats.type",
    },
  );
}

// ---------------------------------------------------------------------------
// Match (fixture) endpoints
// ---------------------------------------------------------------------------

export async function fetchMatchesBySeason(seasonId: number): Promise<SportmonksFixture[]> {
  return getPaginated<SportmonksFixture>(`/fixtures/seasons/${seasonId}`, {
    include: "scores;participants",
  });
}

export async function fetchMatchById(fixtureId: number): Promise<SportmonksFixture> {
  const raw = await get<{ data: SportmonksFixture }>(`/fixtures/${fixtureId}`, {
    include: "scores;participants;events",
  });
  return raw.data;
}

// ---------------------------------------------------------------------------
// Event endpoints
// ---------------------------------------------------------------------------

export async function fetchMatchEvents(fixtureId: number): Promise<SportmonksEvent[]> {
  const raw = await get<{ data: SportmonksEvent[] }>(`/events/fixtures/${fixtureId}`);
  return raw.data ?? [];
}
