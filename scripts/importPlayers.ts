import "dotenv/config";
import axios from "axios";
import { PrismaClient } from "@prisma/client";
import { nameToSlug, normalizeName } from "../src/utils/normalizeName";
import { normalizePosition } from "../src/utils/positions";
import { normalizeStat } from "../src/scout/stats-normalizer";
import { buildFifaAttributes } from "../src/scout/skill-tree.builder";
import { buildMacroSkills } from "../src/scout/macroSkill.engine";
import { calculateOverallRating } from "../src/scout/overall.engine";
import { calculateRankingScore } from "../src/scout/ranking.engine";
import { GLOBAL_WEIGHTS, POSITION_WEIGHTS } from "../src/scout/ranking.weights";

const prisma = new PrismaClient();

const API_KEY = process.env.ESPORTSMONKS;
const API_BASE = "https://api.sportmonks.com/v3/football";
const PAGE_SIZE = 100;
const INCLUDE_CANDIDATES = [
  "country;position;team.league;market_value;teams.team;teams.team.league",
  "country;position;team;market_value;teams.team;teams.team.league",
  "country;position;team.league;market_value;teams.team",
  "country;position;team;market_value;teams.team",
  "country;position;team.league;market_value",
  "country;position;team;market_value",
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
  position_id?: number | string | null;
  detailed_position_id?: number | string | null;
  image_path?: string | null;
  market_value?:
    | number
    | string
    | {
      amount?: number | string;
      value?: number | string;
      market_value?: number | string;
      data?: {
        amount?: number | string;
        value?: number | string;
        market_value?: number | string;
      };
    };
  country?: SportmonksEntity | { data?: SportmonksEntity };
  team?: SportmonksEntity | { data?: SportmonksEntity };
  detailedPosition?: SportmonksEntity | { data?: SportmonksEntity };
  detailed_position?: SportmonksEntity | { data?: SportmonksEntity };
  teams?: Array<
    SportmonksEntity & {
      team_id?: number;
      position_id?: number | string | null;
      detailed_position_id?: number | string | null;
      team?: SportmonksEntity | { data?: SportmonksEntity };
      league?: SportmonksEntity | { data?: SportmonksEntity };
      current_league?: SportmonksEntity | { data?: SportmonksEntity };
    }
  > | {
    data?: Array<
      SportmonksEntity & {
        team_id?: number;
        position_id?: number | string | null;
        detailed_position_id?: number | string | null;
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

function parseOptionalFloat(value: unknown): number | null {
  const parsed =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? Number(parsed) : null;
}

function parseMarketValue(value: unknown): number | null {
  const direct = parseOptionalFloat(value);
  if (direct != null) {
    return direct;
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const asRecord = value as {
    amount?: unknown;
    value?: unknown;
    market_value?: unknown;
    data?: { amount?: unknown; value?: unknown; market_value?: unknown };
  };

  const nestedCandidates = [
    asRecord.amount,
    asRecord.value,
    asRecord.market_value,
    asRecord.data?.amount,
    asRecord.data?.value,
    asRecord.data?.market_value,
  ];

  for (const candidate of nestedCandidates) {
    const parsed = parseOptionalFloat(candidate);
    if (parsed != null) {
      return parsed;
    }
  }

  return null;
}

function pickBestTeamRelation(
  relations: Array<
    SportmonksEntity & {
      team_id?: number;
      start?: string | null;
      end?: string | null;
      team?: SportmonksEntity | { data?: SportmonksEntity };
      league?: SportmonksEntity | { data?: SportmonksEntity };
      current_league?: SportmonksEntity | { data?: SportmonksEntity };
    }
  >,
) {
  if (!relations.length) {
    return null;
  }

  const parsed = relations.map((relation) => {
    const startTs = relation.start ? Date.parse(relation.start) : Number.NaN;
    const endTs = relation.end ? Date.parse(relation.end) : Number.NaN;
    const isCurrent = relation.end == null || relation.end === "";

    return {
      relation,
      isCurrent,
      startTs: Number.isFinite(startTs) ? startTs : Number.NEGATIVE_INFINITY,
      endTs: Number.isFinite(endTs) ? endTs : Number.NEGATIVE_INFINITY,
    };
  });

  parsed.sort((a, b) => {
    if (a.isCurrent !== b.isCurrent) {
      return a.isCurrent ? -1 : 1;
    }
    if (a.endTs !== b.endTs) {
      return b.endTs - a.endTs;
    }
    return b.startTs - a.startTs;
  });

  return parsed[0]?.relation ?? null;
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

function readLeagueNameFromTeamUnknown(teamValue: unknown): string | null {
  if (!teamValue || typeof teamValue !== "object") {
    return null;
  }

  const asRecord = teamValue as {
    league?: unknown;
    current_league?: unknown;
    data?: {
      league?: unknown;
      current_league?: unknown;
    };
  };

  return (
    readLeagueNameFromUnknown(asRecord.league) ??
    readLeagueNameFromUnknown(asRecord.current_league) ??
    readLeagueNameFromUnknown(asRecord.data?.league) ??
    readLeagueNameFromUnknown(asRecord.data?.current_league) ??
    null
  );
}

function normalizePositionLabel(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function mapPositionFromApi(input: {
  positionName?: string | null;
  detailedPositionName?: string | null;
  positionId?: number | null;
  detailedPositionId?: number | null;
}): string {
  const { positionName, detailedPositionName, positionId, detailedPositionId } = input;

  const directCandidates = [detailedPositionName, positionName];
  for (const candidate of directCandidates) {
    if (!candidate || !candidate.trim()) continue;
    const normalized = normalizePosition(candidate);
    if (normalized) return normalized;
  }

  const aliases: Record<string, string> = {
    "CENTRE BACK": "CB",
    "CENTER BACK": "CB",
    "CENTRAL DEFENDER": "CB",
    "LEFT CENTRAL DEFENDER": "CB",
    "RIGHT CENTRAL DEFENDER": "CB",
    DEFENDER: "CB",
    "LEFT BACK": "LB",
    "LEFT DEFENDER": "LB",
    "RIGHT BACK": "RB",
    "RIGHT DEFENDER": "RB",
    "LEFT WING BACK": "LWB",
    "RIGHT WING BACK": "RWB",
    "DEFENSIVE MIDFIELD": "CDM",
    "DEFENSIVE MIDFIELDER": "CDM",
    MIDFIELDER: "CM",
    "CENTRAL MIDFIELDER": "CM",
    "CENTRAL MIDFIELD": "CM",
    "ATTACKING MIDFIELDER": "CAM",
    "ATTACKING MIDFIELD": "CAM",
    "LEFT MIDFIELDER": "LM",
    "RIGHT MIDFIELDER": "RM",
    "LEFT ATTACKING MIDFIELD": "LM",
    "RIGHT ATTACKING MIDFIELD": "RM",
    "LEFT WING": "LW",
    "LEFT WINGER": "LW",
    "RIGHT WING": "RW",
    "RIGHT WINGER": "RW",
    "CENTRE FORWARD": "CF",
    ATTACKER: "ST",
    FORWARD: "CF",
    STRIKER: "ST",
    GOALKEEPER: "GK",
  };

  for (const candidate of directCandidates) {
    if (!candidate || !candidate.trim()) continue;
    const alias = aliases[normalizePositionLabel(candidate)];
    if (alias) return alias;
  }

  const detailedPositionMap: Record<number, string> = {
    24: "GK",
    148: "CB",
    149: "CDM",
    150: "CM",
    151: "ST",
    152: "RW",
    153: "CM",
    154: "LB",
    155: "RB",
    156: "LW",
    157: "CAM",
    158: "CF",
  };

  if (detailedPositionId != null && detailedPositionMap[detailedPositionId]) {
    return detailedPositionMap[detailedPositionId];
  }

  const positionMap: Record<number, string> = {
    24: "GK",
    25: "CB",
    26: "CM",
    27: "ST",
  };

  if (positionId != null && positionMap[positionId]) {
    return positionMap[positionId];
  }

  return "CM";
}

function leagueRatingBonus(league?: string | null): number {
  if (!league) return 0;
  const normalized = normalizePositionLabel(league);
  const top = new Set(["PREMIER LEAGUE", "LALIGA", "LA LIGA", "SERIE A", "BUNDESLIGA", "LIGUE 1"]);
  const strong = new Set(["EREDIVISIE", "PRIMEIRA LIGA", "CHAMPIONSHIP", "PRO LEAGUE"]);
  if (top.has(normalized)) return 4;
  if (strong.has(normalized)) return 2;
  return 0;
}

function deterministicUnit(seed: number, salt: number): number {
  const value = ((seed ^ (salt * 2654435761)) >>> 0) / 0xffffffff;
  return Math.max(0, Math.min(1, value));
}

function estimateOverallAnchor(input: {
  seed: number;
  age: number;
  marketValue: number | null;
  league: string | null;
  position: string;
}): number {
  const { seed, age, marketValue, league, position } = input;

  let anchor: number;
  if (marketValue && marketValue > 0) {
    // Escala aproximada: 1M ~ 65, 10M ~ 78, 50M ~ 88, 100M ~ 94.
    const valueInMillions = marketValue / 1_000_000;
    anchor = 60 + 17 * Math.log10(valueInMillions + 1);
  } else {
    // Distribuição determinística pseudo-normal para evitar massa em 65-67.
    const u1 = deterministicUnit(seed, 101);
    const u2 = deterministicUnit(seed, 211);
    const u3 = deterministicUnit(seed, 307);
    const bell = (u1 + u2 + u3) / 3; // [0..1], concentrado no meio
    anchor = 56 + bell * 34; // ~56..90
  }

  const ageAdj =
    age <= 18 ? -3 :
    age <= 21 ? 1 :
    age <= 24 ? 3 :
    age <= 28 ? 2 :
    age <= 31 ? 0 :
    age <= 34 ? -2 : -4;

  const posAdj =
    position === "GK" ? 1 :
    ["CB", "CDM", "CM"].includes(position) ? 0 :
    ["CAM", "CF", "ST", "LW", "RW"].includes(position) ? 1 : 0;

  const leagueAdj = leagueRatingBonus(league);
  return clamp(anchor + ageAdj + posAdj + leagueAdj, 52, 95);
}

function clamp(value: number, min = 1, max = 99) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

function hashSeed(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash || 1;
}

function seededOffset(seed: number, salt: number, range = 6): number {
  const value = ((seed + salt * 1103515245) >>> 0) % (range * 2 + 1);
  return value - range;
}

type RawStats = {
  speed: number;
  acceleration: number;
  finishing: number;
  shotPower: number;
  shortPass: number;
  longPass: number;
  dribble: number;
  ballControl: number;
  tackle: number;
  strength: number;
  stamina: number;
};

const RAW_STATS_PRESETS: Record<string, RawStats> = {
  GK: {
    speed: 48,
    acceleration: 50,
    finishing: 35,
    shotPower: 48,
    shortPass: 56,
    longPass: 59,
    dribble: 44,
    ballControl: 52,
    tackle: 54,
    strength: 66,
    stamina: 62,
  },
  CB: {
    speed: 58,
    acceleration: 56,
    finishing: 42,
    shotPower: 60,
    shortPass: 60,
    longPass: 61,
    dribble: 54,
    ballControl: 58,
    tackle: 76,
    strength: 76,
    stamina: 70,
  },
  LB: {
    speed: 70,
    acceleration: 72,
    finishing: 50,
    shotPower: 61,
    shortPass: 66,
    longPass: 64,
    dribble: 66,
    ballControl: 67,
    tackle: 68,
    strength: 68,
    stamina: 73,
  },
  RB: {
    speed: 70,
    acceleration: 72,
    finishing: 50,
    shotPower: 61,
    shortPass: 66,
    longPass: 64,
    dribble: 66,
    ballControl: 67,
    tackle: 68,
    strength: 68,
    stamina: 73,
  },
  LWB: {
    speed: 72,
    acceleration: 74,
    finishing: 52,
    shotPower: 62,
    shortPass: 67,
    longPass: 65,
    dribble: 68,
    ballControl: 69,
    tackle: 66,
    strength: 67,
    stamina: 76,
  },
  RWB: {
    speed: 72,
    acceleration: 74,
    finishing: 52,
    shotPower: 62,
    shortPass: 67,
    longPass: 65,
    dribble: 68,
    ballControl: 69,
    tackle: 66,
    strength: 67,
    stamina: 76,
  },
  CDM: {
    speed: 62,
    acceleration: 61,
    finishing: 53,
    shotPower: 62,
    shortPass: 69,
    longPass: 67,
    dribble: 63,
    ballControl: 65,
    tackle: 72,
    strength: 73,
    stamina: 73,
  },
  CM: {
    speed: 64,
    acceleration: 65,
    finishing: 58,
    shotPower: 64,
    shortPass: 72,
    longPass: 70,
    dribble: 69,
    ballControl: 71,
    tackle: 64,
    strength: 66,
    stamina: 72,
  },
  CAM: {
    speed: 66,
    acceleration: 68,
    finishing: 67,
    shotPower: 69,
    shortPass: 74,
    longPass: 72,
    dribble: 74,
    ballControl: 76,
    tackle: 56,
    strength: 61,
    stamina: 69,
  },
  LM: {
    speed: 71,
    acceleration: 72,
    finishing: 60,
    shotPower: 65,
    shortPass: 70,
    longPass: 67,
    dribble: 72,
    ballControl: 72,
    tackle: 57,
    strength: 61,
    stamina: 71,
  },
  RM: {
    speed: 71,
    acceleration: 72,
    finishing: 60,
    shotPower: 65,
    shortPass: 70,
    longPass: 67,
    dribble: 72,
    ballControl: 72,
    tackle: 57,
    strength: 61,
    stamina: 71,
  },
  LW: {
    speed: 74,
    acceleration: 76,
    finishing: 68,
    shotPower: 70,
    shortPass: 67,
    longPass: 63,
    dribble: 78,
    ballControl: 78,
    tackle: 46,
    strength: 58,
    stamina: 69,
  },
  RW: {
    speed: 74,
    acceleration: 76,
    finishing: 68,
    shotPower: 70,
    shortPass: 67,
    longPass: 63,
    dribble: 78,
    ballControl: 78,
    tackle: 46,
    strength: 58,
    stamina: 69,
  },
  CF: {
    speed: 69,
    acceleration: 70,
    finishing: 71,
    shotPower: 72,
    shortPass: 68,
    longPass: 64,
    dribble: 73,
    ballControl: 74,
    tackle: 45,
    strength: 60,
    stamina: 67,
  },
  ST: {
    speed: 67,
    acceleration: 68,
    finishing: 74,
    shotPower: 74,
    shortPass: 62,
    longPass: 58,
    dribble: 70,
    ballControl: 71,
    tackle: 41,
    strength: 66,
    stamina: 67,
  },
};

function buildRawStats(position: string, age: number, anchorOverall: number | null, seed: number): RawStats {
  const base = RAW_STATS_PRESETS[position] ?? RAW_STATS_PRESETS.CM;
  const agePenalty = age >= 33 ? -4 : age >= 30 ? -2 : age <= 20 ? 3 : age <= 23 ? 2 : 0;

  const targetOverall = anchorOverall ? clamp(anchorOverall, 45, 92) : null;
  const baseMean = average(Object.values(base));
  const shift = targetOverall ? targetOverall - baseMean : 0;

  const apply = (value: number, salt: number) => {
    const jitter = seededOffset(seed, salt, 9);
    return clamp(value + shift + agePenalty + jitter, 25, 95);
  };

  return {
    speed: apply(base.speed, 1),
    acceleration: apply(base.acceleration, 2),
    finishing: apply(base.finishing, 3),
    shotPower: apply(base.shotPower, 4),
    shortPass: apply(base.shortPass, 5),
    longPass: apply(base.longPass, 6),
    dribble: apply(base.dribble, 7),
    ballControl: apply(base.ballControl, 8),
    tackle: apply(base.tackle, 9),
    strength: apply(base.strength, 10),
    stamina: apply(base.stamina, 11),
  };
}

function normalizeRawStats(raw: RawStats): RawStats {
  return {
    speed: normalizeStat(raw.speed),
    acceleration: normalizeStat(raw.acceleration),
    finishing: normalizeStat(raw.finishing),
    shotPower: normalizeStat(raw.shotPower),
    shortPass: normalizeStat(raw.shortPass),
    longPass: normalizeStat(raw.longPass),
    dribble: normalizeStat(raw.dribble),
    ballControl: normalizeStat(raw.ballControl),
    tackle: normalizeStat(raw.tackle),
    strength: normalizeStat(raw.strength),
    stamina: normalizeStat(raw.stamina),
  };
}

function buildCategoryIndex(fifa: {
  pace: number;
  shooting: number;
  passing: number;
  dribbling: number;
  defending: number;
  physical: number;
}) {
  return {
    attacking: fifa.shooting,
    skill: fifa.dribbling,
    movement: fifa.pace,
    power: fifa.physical,
    mentality: clamp((fifa.passing + fifa.physical) / 2, 1, 99),
    defending: fifa.defending,
  };
}

function computePotential(overall: number, age: number): number {
  const boost = age <= 20 ? 9 : age <= 23 ? 7 : age <= 27 ? 5 : age <= 30 ? 3 : 1;
  return clamp(Math.max(overall, overall + boost), 1, 99);
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
        return pickBestTeamRelation(list);
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
      const teamIdFromDirect = parseOptionalInt(
        rawPlayer.team && typeof rawPlayer.team === "object"
          ? (rawPlayer.team as { id?: unknown; data?: { id?: unknown } }).id ??
            (rawPlayer.team as { data?: { id?: unknown } }).data?.id
          : null,
      );
      const teamFromCache =
        (teamIdFromRelation ? teamsCache.get(teamIdFromRelation) : null) ??
        (teamIdFromDirect ? teamsCache.get(teamIdFromDirect) : null);
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
      const leagueFromDirectTeam = readLeagueNameFromTeamUnknown(rawPlayer.team);
      const resolvedLeague =
        leagueFromRelation ??
        currentLeagueFromRelation ??
        leagueFromDirectTeam ??
        teamFromCache?.league ??
        null;
      const resolvedMarketValue = parseMarketValue(rawPlayer.market_value);
      const resolvedImagePath = rawPlayer.image_path?.trim() || null;

      const position = unwrapEntity(rawPlayer.position);
      const detailedPosition = unwrapEntity(rawPlayer.detailedPosition ?? rawPlayer.detailed_position);
      const relationPositionId = parseOptionalInt(
        teamRelation && typeof teamRelation === "object"
          ? (teamRelation as { position_id?: unknown }).position_id
          : null,
      );
      const relationDetailedPositionId = parseOptionalInt(
        teamRelation && typeof teamRelation === "object"
          ? (teamRelation as { detailed_position_id?: unknown }).detailed_position_id
          : null,
      );
      const mappedPosition = mapPositionFromApi({
        positionName: position?.name,
        detailedPositionName: detailedPosition?.name,
        positionId: relationPositionId ?? parseOptionalInt(rawPlayer.position_id),
        detailedPositionId: relationDetailedPositionId ?? parseOptionalInt(rawPlayer.detailed_position_id),
      });
      const inputOverall = parseOptionalInt(rawPlayer.overall ?? rawPlayer.rating);

      const age = Number(rawPlayer.age ?? 0);
      const safeAge = Number.isFinite(age) && age > 0 ? Math.round(age) : 24;

      const seed = hashSeed(`${rawPlayer.id ?? slug}`);
      const estimatedAnchor = estimateOverallAnchor({
        seed,
        age: safeAge,
        marketValue: resolvedMarketValue,
        league: resolvedLeague,
        position: mappedPosition,
      });
      const anchorOverall = inputOverall ?? estimatedAnchor;
      const rawStats = buildRawStats(mappedPosition, safeAge, anchorOverall, seed);
      const normalizedRawStats = normalizeRawStats(rawStats);

      // 1) stats-normalizer + 2) skill-tree.builder
      const fifaCore = buildFifaAttributes(normalizedRawStats);

      const detailedFlat = {
        crossing: clamp((normalizedRawStats.shortPass + normalizedRawStats.longPass) / 2),
        finishing: normalizedRawStats.finishing,
        headingAccuracy: clamp((normalizedRawStats.strength + normalizedRawStats.tackle) / 2),
        shortPassing: normalizedRawStats.shortPass,
        longPassing: normalizedRawStats.longPass,
        volleys: clamp((normalizedRawStats.finishing + normalizedRawStats.shotPower) / 2),
        dribbling: normalizedRawStats.dribble,
        curve: clamp((normalizedRawStats.shortPass + normalizedRawStats.dribble) / 2),
        fkAccuracy: clamp((normalizedRawStats.shortPass + normalizedRawStats.shotPower) / 2),
        ballControl: normalizedRawStats.ballControl,
        acceleration: normalizedRawStats.acceleration,
        sprintSpeed: normalizedRawStats.speed,
        agility: clamp((normalizedRawStats.acceleration + normalizedRawStats.dribble) / 2),
        reactions: clamp((normalizedRawStats.acceleration + normalizedRawStats.shortPass) / 2),
        balance: clamp((normalizedRawStats.acceleration + normalizedRawStats.ballControl) / 2),
        shotPower: normalizedRawStats.shotPower,
        jumping: clamp((normalizedRawStats.strength + normalizedRawStats.stamina) / 2),
        stamina: normalizedRawStats.stamina,
        strength: normalizedRawStats.strength,
        longShots: clamp((normalizedRawStats.shotPower + normalizedRawStats.finishing) / 2),
        aggression: clamp((normalizedRawStats.strength + normalizedRawStats.tackle) / 2),
        interceptions: clamp((normalizedRawStats.tackle + normalizedRawStats.shortPass) / 2),
        positioning: clamp((normalizedRawStats.finishing + normalizedRawStats.shortPass) / 2),
        vision: clamp((normalizedRawStats.longPass + normalizedRawStats.shortPass) / 2),
        penalties: clamp((normalizedRawStats.finishing + normalizedRawStats.ballControl) / 2),
        composure: clamp((normalizedRawStats.ballControl + normalizedRawStats.shortPass) / 2),
        defensiveAwareness: normalizedRawStats.tackle,
        standingTackle: normalizedRawStats.tackle,
        slidingTackle: clamp(normalizedRawStats.tackle - 2, 1, 99),
        marking: normalizedRawStats.tackle,
        tackling: normalizedRawStats.tackle,
        pace: fifaCore.pace,
        shooting: fifaCore.shooting,
        passing: fifaCore.passing,
        dribblingCore: fifaCore.dribbling,
        defending: fifaCore.defending,
        physical: fifaCore.physical,
      };

      // 3) macroSkill.engine
      const macro = buildMacroSkills(detailedFlat);
      const categoryIndex = buildCategoryIndex(fifaCore);
      const weights = POSITION_WEIGHTS[mappedPosition] ?? GLOBAL_WEIGHTS;
      const performanceScore = calculateRankingScore(fifaCore, weights);

      // 4) overall.engine
      const overallResult = calculateOverallRating({
        position: mappedPosition,
        performanceScore,
        categoryIndex,
        macroOverall: macro.overallProfile,
        fifaAttributes: fifaCore,
        rawAttributes: detailedFlat,
      });

      // Mistura score do engine com o anchor para abrir distribuição sem perder coerência posicional.
      const computedOverall = clamp(Math.round(overallResult.overall * 0.65 + anchorOverall * 0.35), 52, 95);
      const computedPotential = computePotential(computedOverall, safeAge);

      const attributes = {
        attacking: {
          crossing: detailedFlat.crossing,
          finishing: detailedFlat.finishing,
          headingAccuracy: detailedFlat.headingAccuracy,
          shortPassing: detailedFlat.shortPassing,
          volleys: detailedFlat.volleys,
          positioning: detailedFlat.positioning,
        },
        skill: {
          dribbling: detailedFlat.dribbling,
          curve: detailedFlat.curve,
          fkAccuracy: detailedFlat.fkAccuracy,
          longPassing: detailedFlat.longPassing,
          ballControl: detailedFlat.ballControl,
        },
        movement: {
          acceleration: detailedFlat.acceleration,
          sprintSpeed: detailedFlat.sprintSpeed,
          agility: detailedFlat.agility,
          reactions: detailedFlat.reactions,
          balance: detailedFlat.balance,
        },
        power: {
          shotPower: detailedFlat.shotPower,
          jumping: detailedFlat.jumping,
          stamina: detailedFlat.stamina,
          strength: detailedFlat.strength,
          longShots: detailedFlat.longShots,
        },
        mentality: {
          aggression: detailedFlat.aggression,
          interceptions: detailedFlat.interceptions,
          attackPosition: detailedFlat.positioning,
          vision: detailedFlat.vision,
          penalties: detailedFlat.penalties,
          composure: detailedFlat.composure,
        },
        defending: {
          defensiveAwareness: detailedFlat.defensiveAwareness,
          standingTackle: detailedFlat.standingTackle,
          slidingTackle: detailedFlat.slidingTackle,
          marking: detailedFlat.marking,
          tackling: detailedFlat.tackling,
        },
        core: fifaCore,
        macro,
        overall: computedOverall,
      };

      const playerPayload = {
        slug,
        name,
        nameNormalized,
        positions: [mappedPosition],
        age: safeAge,
        nationality: country?.name?.trim() || "Unknown",
        team: resolvedTeamName,
        league: resolvedLeague,
        imagePath: resolvedImagePath,
        marketValue: resolvedMarketValue,
        contractEnd: null as Date | null,
        overall: computedOverall,
        potential: computedPotential,
        attributes,
        archetype: {
          role: `Imported ${mappedPosition}`,
          tier: overallResult.tier,
          performanceScore,
        },
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
