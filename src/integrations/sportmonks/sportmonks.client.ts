import type { SportmonksPlayer } from "./sportmonks.types";

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
