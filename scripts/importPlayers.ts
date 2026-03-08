import "dotenv/config";
import axios from "axios";
import { PrismaClient } from "@prisma/client";
import { nameToSlug, normalizeName } from "../src/utils/normalizeName";

const prisma = new PrismaClient();

const API_KEY = process.env.ESPORTSMONKS;
const API = "https://api.sportmonks.com/v3/football";

/*
GERADOR DE NÚMEROS
*/
function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min) + min);
}

/*
GERAR ATRIBUTOS ESTILO FIFA
*/
function generateAttributes() {
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
MAPEAMENTO COMPLETO DE POSIÇÕES
*/
function mapPosition(position: string): string {
  const map: Record<string, string> = {
    Goalkeeper: "GK",

    "Centre Back": "CB",
    "Center Back": "CB",

    "Left Back": "LB",
    "Right Back": "RB",

    "Left Wing Back": "LWB",
    "Right Wing Back": "RWB",

    "Defensive Midfielder": "CDM",
    "Central Defensive Midfielder": "CDM",

    "Central Midfielder": "CM",

    "Attacking Midfielder": "CAM",
    "Central Attacking Midfielder": "CAM",

    "Left Midfielder": "LM",
    "Right Midfielder": "RM",

    "Left Winger": "LW",
    "Right Winger": "RW",

    "Second Striker": "CF",
    "Centre Forward": "CF",
    "Center Forward": "CF",

    Striker: "ST",
    Forward: "ST",
  };

  return map[position] ?? "CM";
}

/*
EXTRAI POSIÇÕES
*/
function extractPositions(row: any): string[] {
  const rawPosition = row.position?.data?.name ?? "Central Midfielder";

  const mapped = mapPosition(rawPosition);

  return [mapped];
}

/*
BUSCAR LIGAS
*/
async function fetchLeagues() {
  const res = await axios.get(`${API}/leagues`, {
    params: {
      api_token: API_KEY,
      per_page: 50,
    },
  });

  return res.data.data;
}

/*
BUSCAR TIMES
*/
async function fetchTeams(leagueId: number) {
  const res = await axios.get(`${API}/teams`, {
    params: {
      api_token: API_KEY,
      filters: `leagueId:${leagueId}`,
    },
  });

  return res.data.data;
}

/*
BUSCAR ELENCO
*/
async function fetchSquad(teamId: number) {
  const res = await axios.get(`${API}/squads/teams/${teamId}`, {
    params: {
      api_token: API_KEY,
      include: "player;position;nationality",
    },
  });

  return res.data.data;
}

/*
SCRIPT PRINCIPAL
*/
async function main() {
  console.log("=================================");
  console.log("IMPORTAÇÃO COMPLETA DE JOGADORES");
  console.log("=================================");

  if (!API_KEY) {
    console.log("❌ API KEY não encontrada");
    process.exit(1);
  }

  console.log("Limpando banco...");

  await prisma.player.deleteMany({});

  console.log("Banco limpo");

  const leagues = await fetchLeagues();

  let totalPlayers = 0;

  for (const league of leagues) {
    console.log(`Liga: ${league.name}`);

    const teams = await fetchTeams(league.id);

    for (const team of teams) {
      console.log(`  Time: ${team.name}`);

      const squad = await fetchSquad(team.id);

      for (const s of squad) {
        const player = s.player?.data;

        if (!player) continue;

        const positions = extractPositions(s);

        const nationality = s.nationality?.data?.name ?? "Unknown";

        const attributes = generateAttributes();

        const playerData = {
          slug: nameToSlug(player.name),

          name: player.name,

          nameNormalized: normalizeName(player.name),

          positions,

          age: player.age ?? rand(18, 35),

          nationality,

          team: team.name,

          league: league.name,

          marketValue: null,

          contractEnd: null,

          overall: attributes.overall,

          potential: attributes.overall + rand(1, 5),

          attributes,

          archetype: {
            role: `Imported ${positions[0]}`,
          },
        };

        await prisma.player.upsert({
          where: { slug: playerData.slug },
          update: playerData,
          create: playerData,
        });

        totalPlayers++;
      }
    }
  }

  console.log("=================================");
  console.log("IMPORTAÇÃO FINALIZADA");
  console.log(`Total jogadores: ${totalPlayers}`);
  console.log("=================================");

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
