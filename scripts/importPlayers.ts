import "dotenv/config";
import axios from "axios";
import { PrismaClient } from "@prisma/client";
import { nameToSlug, normalizeName } from "../src/utils/normalizeName";
import { normalizePosition } from "../src/utils/positions";

const prisma = new PrismaClient();

const API_KEY = process.env.ESPORTSMONKS;
const API_BASE = "https://api.sportmonks.com/v3/football";
const PAGE_SIZE = 100;

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
  position?: SportmonksEntity | { data?: SportmonksEntity };
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

async function fetchPlayersPage(page: number): Promise<SportmonksPlayersResponse> {
  const response = await axios.get<SportmonksPlayersResponse>(`${API_BASE}/players`, {
    params: {
      api_token: API_KEY,
      include: "country;team;position",
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

async function main() {
  if (!API_KEY) {
    throw new Error("Variável ESPORTSMONKS não encontrada no .env");
  }

  console.log("IMPORTANDO JOGADORES SPORTMONKS");

  await prisma.player.deleteMany();

  let page = 1;
  let totalImported = 0;
  let hasMore = true;

  while (hasMore) {
    const payload = await fetchPlayersPage(page);
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
      const team = unwrapEntity(rawPlayer.team);
      const position = unwrapEntity(rawPlayer.position);
      const mappedPosition = mapPositionFromApi(position?.name);

      const age = Number(rawPlayer.age ?? 0);
      const safeAge = Number.isFinite(age) && age > 0 ? Math.round(age) : 24;

      const playerPayload = {
        slug,
        name,
        nameNormalized,
        positions: [mappedPosition],
        age: safeAge,
        nationality: country?.name?.trim() || "Unknown",
        team: team?.name?.trim() || null,
        league: null as string | null,
        marketValue: null as number | null,
        contractEnd: null as Date | null,
        overall: null as number | null,
        potential: null as number | null,
        attributes: {},
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
