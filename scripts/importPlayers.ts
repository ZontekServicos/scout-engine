import "dotenv/config";

/**
 * Desativa verificação TLS por causa do certificado atual da API
 */
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

import axios from "axios";
import { PrismaClient } from "@prisma/client";
import { nameToSlug, normalizeName } from "../src/utils/normalizeName";

const prisma = new PrismaClient();

/**
 * Chave da API carregada do .env
 */
const API_KEY = process.env.ESPORTSMONKS;

/**
 * Endpoint oficial
 */
const BASE_URL =
  "https://api.sportsmonks.com/v3/football/playhttps://api.sportmonks.com/v3/?api_token=dVY9sQN0tVh77MUmWcwpGU7ZUaQT4fHJ1YfQrpoOnLU1YI23AY30k1j7k32gers";

/**
 * Delay para evitar rate limit
 */
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Busca jogadores da API
 */
async function fetchPlayers(page: number) {
  const response = await axios.get(BASE_URL, {
    params: {
      api_token: API_KEY,
      per_page: 100,
      page,
      include: "country;position",
    },
  });

  return response.data.data;
}

async function main() {
  console.log("=====================================");
  console.log("IMPORTAÇÃO DE JOGADORES - SPORTSMONKS");
  console.log("=====================================");

  if (!API_KEY) {
    throw new Error("Variável ESPORTSMONKS não encontrada no .env");
  }

  console.log("API KEY carregada com sucesso");

  /**
   * Limpa banco atual
   */
  console.log("Limpando tabela Player...");

  await prisma.player.deleteMany({});

  console.log("Tabela limpa");

  let page = 1;
  let totalInserted = 0;

  /**
   * Loop de paginação
   */
  while (true) {
    const players = await fetchPlayers(page);

    if (!players || players.length === 0) {
      break;
    }

    console.log(`Processando página ${page} (${players.length} jogadores)`);

    for (const p of players) {
      const name = p.name ?? "Unknown";

      const playerData = {
        slug: nameToSlug(name),

        name,

        nameNormalized: normalizeName(name),

        positions: [p.position?.name ?? "CM"],

        age: p.age ?? 25,

        nationality: p.country?.name ?? "Unknown",

        team: null,

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

      /**
       * Evita duplicação
       */
      await prisma.player.upsert({
        where: {
          slug: playerData.slug,
        },

        update: playerData,

        create: playerData,
      });

      totalInserted++;
    }

    page++;

    /**
     * Delay para evitar bloqueio da API
     */
    await sleep(300);
  }

  console.log("=====================================");
  console.log("IMPORTAÇÃO FINALIZADA");
  console.log("Jogadores inseridos:", totalInserted);
  console.log("=====================================");

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("Erro durante importação:", error);

  process.exit(1);
});
