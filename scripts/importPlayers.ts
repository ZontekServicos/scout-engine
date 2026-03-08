import "dotenv/config";
import axios from "axios";
import { PrismaClient } from "@prisma/client";
import { nameToSlug, normalizeName } from "../src/utils/normalizeName";

const prisma = new PrismaClient();

/*
CHAVE DA API
*/
const API_KEY = process.env.ESPORTSMONKS;

/*
ENDPOINT CORRETO
*/
const BASE_URL = "https://api.sportmonks.com/v3/football/players";

/*
FUNÇÃO RANDOM
*/
function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min) + min);
}

/*
GERADOR DE ATRIBUTOS ESTILO FIFA
*/
function generateAttributes(position: string) {
  const pace = rand(60, 90);
  const shooting = rand(50, 90);
  const passing = rand(50, 90);
  const dribbling = rand(50, 90);
  const defending = rand(40, 85);
  const physical = rand(50, 90);

  const overall = Math.round((pace + shooting + passing + dribbling + defending + physical) / 6);

  return {
    pace,
    shooting,
    passing,
    dribbling,
    defending,
    physical,
    overall,
  };
}

/*
BUSCAR JOGADORES
*/
async function fetchPlayers(page: number) {
  const response = await axios.get(BASE_URL, {
    params: {
      api_token: API_KEY,
      per_page: 100,
      page,
      include: "nationality;teams;position",
    },
  });

  return response.data.data;
}

/*
SCRIPT PRINCIPAL
*/
async function main() {
  console.log("=====================================");
  console.log("IMPORTAÇÃO DE JOGADORES - SPORTMONKS");
  console.log("=====================================");

  if (!API_KEY) {
    console.log("❌ API KEY não encontrada no .env");
    process.exit(1);
  }

  console.log("API KEY carregada com sucesso");

  /*
  LIMPAR BANCO
  */

  console.log("Limpando tabela Player...");

  await prisma.player.deleteMany({});

  console.log("Tabela limpa");

  let page = 1;
  let total = 0;

  while (true) {
    const players = await fetchPlayers(page);

    if (!players || players.length === 0) {
      break;
    }

    console.log(`Processando página ${page} (${players.length} jogadores)`);

    for (const p of players) {
      const name = p.name;

      if (!name) continue;

      /*
      NACIONALIDADE
      */

      const nationality = p.nationality?.data?.name ?? "Unknown";

      /*
      TIME
      */

      const team = p.teams?.data?.[0]?.name ?? null;

      /*
      LIGA
      */

      const league = p.teams?.data?.[0]?.league?.name ?? null;

      /*
      POSIÇÃO
      */

      const position = p.position?.data?.name ?? "CM";

      /*
      ATRIBUTOS
      */

      const attributes = generateAttributes(position);

      /*
      PLAYER DATA
      */

      const playerData = {
        slug: nameToSlug(name),

        name,

        nameNormalized: normalizeName(name),

        positions: [position],

        age: p.age ?? rand(18, 35),

        nationality,

        team,

        league,

        marketValue: null,

        contractEnd: null,

        overall: attributes.overall,

        potential: attributes.overall + rand(1, 5),

        attributes,

        archetype: {
          role: `Imported ${position}`,
        },
      };

      await prisma.player.upsert({
        where: { slug: playerData.slug },
        update: playerData,
        create: playerData,
      });

      total++;
    }

    page++;
  }

  console.log("=====================================");
  console.log("IMPORTAÇÃO FINALIZADA");
  console.log(`Jogadores importados: ${total}`);
  console.log("=====================================");

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("Erro durante importação:", error);
  process.exit(1);
});
