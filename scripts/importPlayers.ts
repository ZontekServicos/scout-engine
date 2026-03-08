import "dotenv/config";
import axios from "axios";
import { PrismaClient } from "@prisma/client";
import { nameToSlug, normalizeName } from "../src/utils/normalizeName";

const prisma = new PrismaClient();

/**
 * Chave da API SportsMonks.
 * Deve estar definida no arquivo .env
 */
const API_KEY = process.env.SPORTSMONKS_API_KEY;

/**
 * Endpoint base de jogadores da SportsMonks
 */
const BASE_URL = "https://api.sportsmonks.com/v3/football/players";

/**
 * Busca jogadores da SportsMonks utilizando paginação.
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

  /**
   * Limpa todos os jogadores existentes no banco
   * para evitar mistura de dados antigos com novos.
   */
  console.log("Limpando tabela Player...");

  await prisma.player.deleteMany({});

  console.log("Tabela limpa com sucesso.");
  console.log("Iniciando ingestão de dados...");

  let page = 1;
  let totalInserted = 0;

  /**
   * Loop de paginação da API
   * A cada página buscamos 100 jogadores.
   */
  while (true) {
    const players = await fetchPlayers(page);

    if (!players || players.length === 0) {
      break;
    }

    console.log(`Processando página ${page} (${players.length} jogadores)`);

    for (const p of players) {
      const name = p.name;

      /**
       * Estrutura do jogador que será salva no banco
       */
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

        /**
         * Atributos técnicos básicos
         * (poderemos enriquecer depois com estatísticas reais)
         */
        attributes: {
          pace: 50,
          shooting: 50,
          passing: 50,
          dribbling: 50,
          defending: 50,
          physical: 50,
        },

        /**
         * Informação do tipo de origem do jogador
         */
        archetype: {
          role: "Imported SportsMonks",
        },
      };

      /**
       * Utilizamos upsert para evitar duplicações
       */
      await prisma.player.upsert({
        where: { slug: playerData.slug },
        update: playerData,
        create: playerData,
      });

      totalInserted++;
    }

    page++;
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
