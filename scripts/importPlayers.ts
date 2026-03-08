import "dotenv/config";

/**
 * Desativa validação de certificado TLS
 * Necessário devido ao certificado atual da API SportsMonks
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

import axios from "axios";
import { PrismaClient } from "@prisma/client";
import { nameToSlug, normalizeName } from "../src/utils/normalizeName";

const prisma = new PrismaClient();

/**
 * Chave da API SportsMonks
 */
const API_KEY = process.env.ESPORTSMONKS_API_KEY;

/**
 * Endpoint correto da API
 */
const BASE_URL = "https://api.sportmonks.com/v3/football/players";

/**
 * Delay entre requisições para evitar rate limit
 */
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Busca jogadores paginados
 */
async function fetchPlayers(page: number) {
  const response = await axios.get(BASE_URL, {
    params: {
      api_token: API_KEY,
      per_page: 100,
      page,
      include: "team;country;position",
    },
  });

  return response.data.data;
}

async function main() {
  console.log("========================================");
  console.log("INICIANDO IMPORTAÇÃO DE JOGADORES");
  console.log("Fonte: SportsMonks API");
  console.log("========================================");

  console.log("API KEY carregada:", API_KEY ? "OK" : "NÃO ENCONTRADA");

  if (!API_KEY) {
    throw new Error("SPORTSMONKS_API_KEY não encontrada no .env");
  }

  /**
   * Limpa jogadores existentes
   */
  console.log("Limpando tabela Player...");

  await prisma.player.deleteMany({});

  console.log("Tabela limpa com sucesso.");
  console.log("Iniciando ingestão de dados...");

  let page = 1;
  let totalInserted = 0;

  while (true) {
    const players = await fetchPlayers(page);

    if (!players || players.length === 0) {
      break;
    }

    console.log(`Processando página ${page} (${players.length} jogadores)`);

    for (const p of players) {
      const name = p.name;

      const playerData = {
        slug: nameToSlug(name),
        name,
        nameNormalized: normalizeName(name),

        positions: [p.position?.name ?? "CM"],

        age: p.age ?? 25,

        nationality: p.country?.name ?? "Unknown",

        team: p.team?.name ?? null,

        league: null,

        marketValue: null,

        contractEnd: null,

        overall: null,

        potential: null,

        attributes: {
          pace: 50,
          shooting: 50,
          passing: 50,
          dribbling: 50,
          defending: 50,
          physical: 50,
        },

        archetype: {
          role: "Imported SportsMonks",
        },
      };

      await prisma.player.upsert({
        where: { slug: playerData.slug },
        update: playerData,
        create: playerData,
      });

      totalInserted++;
    }

    page++;

    /**
     * Delay para evitar limite da API
     */
    await sleep(300);
  }

  console.log("========================================");
  console.log("IMPORTAÇÃO FINALIZADA");
  console.log(`Total de jogadores inseridos: ${totalInserted}`);
  console.log("========================================");

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("Erro durante a importação:", error);
  process.exit(1);
});
