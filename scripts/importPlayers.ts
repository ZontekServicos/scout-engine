import "dotenv/config";
import axios from "axios";
import { PrismaClient } from "@prisma/client";
import { nameToSlug, normalizeName } from "../src/utils/normalizeName";
import { normalizePosition } from "../src/utils/positions";

const prisma = new PrismaClient();

const API_KEY = process.env.ESPORTSMONKS;
const API_BASE = "https://api.sportmonks.com/v3/football";
const PAGE_SIZE = 100;
const INCLUDE_CANDIDATES = [
  "country;position;teams.team;teams.team.league",
  "country;position;team;teams.team",
  "country;position;teams.team",
  "country;position;team",
  "country;position;teams",
  "country;position",
  "position",
  "",
];

type SportmonksEntity = {
  id?: number;
  name?: string;
};

type SportmonksPlayer = {
  id?: number;
  name?: string;
  age?: number;
  country?: SportmonksEntity | { data?: SportmonksEntity };
  team?: SportmonksEntity | { data?: SportmonksEntity };
  teams?: Array<
    SportmonksEntity & {
      team_id?: number;
      team?: SportmonksEntity | { data?: SportmonksEntity };
      league?: SportmonksEntity | { data?: SportmonksEntity };
      current_league?: SportmonksEntity | { data?: SportmonksEntity };
    }
  > | {
    data?: Array<
      SportmonksEntity & {
        team_id?: number;
        team?: SportmonksEntity | { data?: SportmonksEntity };
        league?: SportmonksEntity | { data?: SportmonksEntity };
        current_league?: SportmonksEntity | { data?: SportmonksEntity };
      }
    >;
  };
  position?: SportmonksEntity | { data?: SportmonksEntity };
  overall?: number | string;
  rating?: number | string;
};

type SportmonksPlayersResponse = {
  data?: SportmonksPlayer[];
  pagination?: {
    current_page?: number;
    has_more?: boolean;
    next_page?: number | null;
    total?: number;
  };
  meta?: {
    pagination?: {
      current_page?: number;
      has_more?: boolean;
      next_page?: number | null;
      total?: number;
    };
  };
};

type SportmonksTeam = {
  id?: number;
  name?: string;
  short_code?: string | null;
  league?: SportmonksEntity | { data?: SportmonksEntity };
  current_league?: SportmonksEntity | { data?: SportmonksEntity };
  leagues?: SportmonksEntity[] | { data?: SportmonksEntity[] };
};

type SportmonksTeamsResponse = {
  data?: SportmonksTeam[];
  pagination?: {
    current_page?: number;
    has_more?: boolean;
    next_page?: number | null | string;
    total?: number;
  };
  meta?: {
    pagination?: {
      current_page?: number;
      has_more?: boolean;
      next_page?: number | null | string;
      total?: number;
    };
  };
};

type TeamCacheEntry = {
  name: string;
  league: string | null;
};

function unwrapEntity(value: unknown): SportmonksEntity | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const asEntity = value as SportmonksEntity;
  if (typeof asEntity.name === "string") {
    return asEntity;
  }

  const data = (value as { data?: SportmonksEntity }).data;
  if (data && typeof data.name === "string") {
    return data;
  }

  return null;
}

function unwrapEntityList(value: unknown): SportmonksEntity[] {
  if (!value || typeof value !== "object") {
    return [];
  }

  if (Array.isArray(value)) {
    return value as SportmonksEntity[];
  }

  const data = (value as { data?: SportmonksEntity[] }).data;
  return Array.isArray(data) ? data : [];
}

function parseOptionalInt(value: unknown): number | null {
  const parsed =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function readLeagueNameFromUnknown(value: unknown): string | null {
  const asEntity = unwrapEntity(value);
  if (asEntity?.name?.trim()) {
    return asEntity.name.trim();
  }

  const list = unwrapEntityList(value);
  const first = list.find((item) => typeof item?.name === "string" && item.name.trim());
  return first?.name?.trim() ?? null;
}

function mapPositionFromApi(positionName?: string): string {
  if (!positionName || !positionName.trim()) {
    return "CM";
  }

  const direct = normalizePosition(positionName);
  if (direct) {
    return direct;
  }

  const aliases: Record<string, string> = {
    "CENTRE BACK": "CB",
    "CENTER BACK": "CB",
    "LEFT BACK": "LB",
    "RIGHT BACK": "RB",
    "LEFT WING BACK": "LWB",
    "RIGHT WING BACK": "RWB",
    "DEFENSIVE MIDFIELDER": "CDM",
    "CENTRAL MIDFIELDER": "CM",
    "ATTACKING MIDFIELDER": "CAM",
    "LEFT MIDFIELDER": "LM",
    "RIGHT MIDFIELDER": "RM",
    "LEFT WINGER": "LW",
    "RIGHT WINGER": "RW",
    "CENTRE FORWARD": "CF",
    FORWARD: "CF",
    STRIKER: "ST",
    GOALKEEPER: "GK",
  };

  return aliases[positionName.trim().toUpperCase()] ?? "CM";
}

async function fetchPlayersPage(
  page: number,
  include: string,
): Promise<SportmonksPlayersResponse> {
  const response = await axios.get<SportmonksPlayersResponse>(`${API_BASE}/players`, {
    params: {
      api_token: API_KEY,
      ...(include ? { include } : {}),
      page,
      per_page: PAGE_SIZE,
    },
    timeout: 30_000,
  });

  return response.data;
}

async function fetchTeamsPage(page: number, include: string): Promise<SportmonksTeamsResponse> {
  const response = await axios.get<SportmonksTeamsResponse>(`${API_BASE}/teams`, {
    params: {
      api_token: API_KEY,
      ...(include ? { include } : {}),
      page,
      per_page: PAGE_SIZE,
    },
    timeout: 30_000,
  });

  return response.data;
}

function readPagination(payload: SportmonksPlayersResponse) {
  return payload.pagination ?? payload.meta?.pagination ?? {};
}

async function buildTeamsCache(): Promise<Map<number, TeamCacheEntry>> {
  const includeCandidates = ["league;currentLeague;leagues", "league;leagues", "league", ""];
  const cache = new Map<number, TeamCacheEntry>();

  for (const include of includeCandidates) {
    try {
      let page = 1;
      let hasMore = true;

      while (hasMore) {
        const payload = await fetchTeamsPage(page, include);
        const teams = Array.isArray(payload.data) ? payload.data : [];

        for (const team of teams) {
          const id = Number(team.id ?? 0);
          const name = team.name?.trim();
          if (!id || !name) {
            continue;
          }

          const league =
            readLeagueNameFromUnknown(team.league) ??
            readLeagueNameFromUnknown(team.current_league) ??
            readLeagueNameFromUnknown(team.leagues);

          cache.set(id, { name, league: league ?? null });
        }

        const pagination = payload.pagination ?? payload.meta?.pagination ?? {};
        const nextPage = Number(pagination.next_page ?? 0);
        const explicitHasMore = Boolean(pagination.has_more);

        hasMore = explicitHasMore || nextPage > page || teams.length === PAGE_SIZE;
        page = nextPage > page ? nextPage : page + 1;

        if (!teams.length && !explicitHasMore && nextPage <= 0) {
          hasMore = false;
        }
      }

      return cache;
    } catch (error: any) {
      const message = String(error?.response?.data?.message ?? "");
      const isIncludeError =
        error?.response?.status === 404 &&
        (message.includes("requested include") || message.includes("does not exist"));

      if (!isIncludeError) {
        throw error;
      }
    }
  }

  return cache;
}

async function resolveValidInclude(): Promise<string> {
  for (const include of INCLUDE_CANDIDATES) {
    try {
      await fetchPlayersPage(1, include);
      return include;
    } catch (error: any) {
      const message = String(error?.response?.data?.message ?? "");
      const isIncludeError =
        error?.response?.status === 404 &&
        (message.includes("requested include") || message.includes("does not exist"));

      if (!isIncludeError) {
        throw error;
      }
    }
  }

  throw new Error("Nenhuma combinação de include foi aceita pela API Sportmonks.");
}

async function main() {
  if (!API_KEY) {
    throw new Error("Variável ESPORTSMONKS não encontrada no .env");
  }

  console.log("IMPORTANDO JOGADORES SPORTMONKS");

  await prisma.player.deleteMany();

  const teamsCache = await buildTeamsCache();
  console.log(`Times em cache: ${teamsCache.size}`);

  const include = await resolveValidInclude();
  console.log(`Include ativo: ${include || "(sem include)"}`);

  let page = 1;
  let totalImported = 0;
  let hasMore = true;

  while (hasMore) {
    const payload = await fetchPlayersPage(page, include);
    const players = Array.isArray(payload.data) ? payload.data : [];

    console.log(`Página ${page} | jogadores ${players.length}`);

    for (const rawPlayer of players) {
      const name = rawPlayer.name?.trim();
      if (!name) {
        continue;
      }

      const slug = nameToSlug(name);
      const nameNormalized = normalizeName(name);

      const country = unwrapEntity(rawPlayer.country);
      const teamDirect = unwrapEntity(rawPlayer.team);
      const teamsList = unwrapEntityList(rawPlayer.teams);
      const teamWithNameFromList = teamsList.find((item) => typeof item?.name === "string");
      const teamRelation = (() => {
        if (!rawPlayer.teams) {
          return null;
        }

        const list = Array.isArray(rawPlayer.teams)
          ? rawPlayer.teams
          : Array.isArray(rawPlayer.teams.data)
            ? rawPlayer.teams.data
            : [];
        return list[0] ?? null;
      })();
      const teamIdFromRelation = parseOptionalInt(
        teamRelation && typeof teamRelation === "object"
          ? (teamRelation as { team_id?: unknown }).team_id
          : null,
      );
      const teamFromNestedTeam = unwrapEntity(
        teamRelation && typeof teamRelation === "object"
          ? (teamRelation as { team?: unknown }).team
          : null,
      );
      const teamFromCache = teamIdFromRelation ? teamsCache.get(teamIdFromRelation) : null;
      const resolvedTeamName =
        teamDirect?.name?.trim() ||
        teamFromNestedTeam?.name?.trim() ||
        teamWithNameFromList?.name?.trim() ||
        teamFromCache?.name ||
        null;

      const leagueFromRelation = readLeagueNameFromUnknown(
        teamRelation && typeof teamRelation === "object"
          ? (teamRelation as { league?: unknown }).league
          : null,
      );
      const currentLeagueFromRelation = readLeagueNameFromUnknown(
        teamRelation && typeof teamRelation === "object"
          ? (teamRelation as { current_league?: unknown }).current_league
          : null,
      );
      const resolvedLeague =
        leagueFromRelation ??
        currentLeagueFromRelation ??
        teamFromCache?.league ??
        null;

      const position = unwrapEntity(rawPlayer.position);
      const mappedPosition = mapPositionFromApi(position?.name);
      const overall = parseOptionalInt(rawPlayer.overall ?? rawPlayer.rating);

      const age = Number(rawPlayer.age ?? 0);
      const safeAge = Number.isFinite(age) && age > 0 ? Math.round(age) : 24;

      const playerPayload = {
        slug,
        name,
        nameNormalized,
        positions: [mappedPosition],
        age: safeAge,
        nationality: country?.name?.trim() || "Unknown",
        team: resolvedTeamName,
        league: resolvedLeague,
        marketValue: null as number | null,
        contractEnd: null as Date | null,
        overall,
        potential: null as number | null,
        attributes: {
          overall: overall ?? 65,
        },
        archetype: { role: `Imported ${mappedPosition}` },
      };

      await prisma.player.upsert({
        where: { slug },
        update: playerPayload,
        create: playerPayload,
      });

      totalImported += 1;
    }

    const pagination = readPagination(payload);
    const nextPage = Number(pagination.next_page ?? 0);
    const explicitHasMore = Boolean(pagination.has_more);

    hasMore = explicitHasMore || nextPage > page || players.length === PAGE_SIZE;
    page = nextPage > page ? nextPage : page + 1;

    if (!players.length && !explicitHasMore && nextPage <= 0) {
      hasMore = false;
    }
  }

  console.log("IMPORTAÇÃO FINALIZADA");
  console.log(`TOTAL JOGADORES: ${totalImported}`);
}

main()
  .catch((error) => {
    console.error("Erro na importação:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
