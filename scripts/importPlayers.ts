import "dotenv/config";
import axios from "axios";
import { PrismaClient } from "@prisma/client";
import { nameToSlug, normalizeName } from "../src/utils/normalizeName";

const prisma = new PrismaClient();

const API_KEY = process.env.ESPORTSMONKS;

const BASE_URL = "https://api.sportmonks.com/v3/football/players";

/*
Função utilitária para gerar valor entre min e max
*/
function rand(min: number, max: number) {
  return Math.floor(Math.random() * (max - min) + min);
}

/*
Gerador completo de atributos estilo FIFA
*/
function generateAttributes(position: string) {
  const attacking = {
    finishing: rand(55, 90),
    headingAccuracy: rand(50, 85),
    volleys: rand(50, 85),
    shortPassing: rand(60, 90),
  };

  const skill = {
    dribbling: rand(60, 92),
    curve: rand(55, 85),
    fkAccuracy: rand(50, 88),
    ballControl: rand(65, 92),
  };

  const movement = {
    acceleration: rand(60, 92),
    sprintSpeed: rand(60, 92),
    agility: rand(60, 92),
    balance: rand(60, 90),
    reactions: rand(65, 92),
  };

  const power = {
    shotPower: rand(60, 90),
    jumping: rand(60, 90),
    stamina: rand(60, 95),
    strength: rand(55, 92),
    longShots: rand(60, 90),
  };

  const mentality = {
    aggression: rand(50, 90),
    interceptions: rand(50, 90),
    positioning: rand(55, 92),
    vision: rand(60, 92),
    penalties: rand(50, 88),
    composure: rand(60, 92),
  };

  const defending = {
    defensiveAwareness: rand(50, 90),
    standingTackle: rand(50, 90),
    slidingTackle: rand(50, 90),
  };

  /*
  Cálculo de médias por categoria
  */

  const attackingAvg =
    (attacking.finishing + attacking.headingAccuracy + attacking.volleys + attacking.shortPassing) /
    4;

  const skillAvg = (skill.dribbling + skill.curve + skill.fkAccuracy + skill.ballControl) / 4;

  const movementAvg =
    (movement.acceleration +
      movement.sprintSpeed +
      movement.agility +
      movement.balance +
      movement.reactions) /
    5;

  const powerAvg =
    (power.shotPower + power.jumping + power.stamina + power.strength + power.longShots) / 5;

  const mentalityAvg =
    (mentality.aggression +
      mentality.interceptions +
      mentality.positioning +
      mentality.vision +
      mentality.penalties +
      mentality.composure) /
    6;

  const defendingAvg =
    (defending.defensiveAwareness + defending.standingTackle + defending.slidingTackle) / 3;

  /*
  Pesos por posição
  */

  let overall = 0;

  if (position.includes("Forward")) {
    overall =
      attackingAvg * 0.3 +
      skillAvg * 0.25 +
      movementAvg * 0.2 +
      powerAvg * 0.15 +
      mentalityAvg * 0.05 +
      defendingAvg * 0.05;
  } else if (position.includes("Midfielder")) {
    overall =
      attackingAvg * 0.15 +
      skillAvg * 0.25 +
      movementAvg * 0.2 +
      powerAvg * 0.15 +
      mentalityAvg * 0.2 +
      defendingAvg * 0.05;
  } else if (position.includes("Defender")) {
    overall =
      defendingAvg * 0.35 +
      powerAvg * 0.2 +
      movementAvg * 0.15 +
      mentalityAvg * 0.15 +
      attackingAvg * 0.05 +
      skillAvg * 0.1;
  } else {
    overall = (attackingAvg + skillAvg + movementAvg + powerAvg + mentalityAvg + defendingAvg) / 6;
  }

  return {
    attacking,
    skill,
    movement,
    power,
    mentality,
    defending,
    overall: Math.round(overall),
  };
}

async function fetchPlayers(page: number) {
  const response = await axios.get(BASE_URL, {
    params: {
      api_token: API_KEY,
      per_page: 100,
      page,
      include: "nationality;position",
    },
  });

  return response.data.data;
}

async function main() {
  console.log("=====================================");
  console.log("IMPORTAÇÃO DE JOGADORES - SPORTSMONKS");
  console.log("=====================================");

  if (!API_KEY) {
    console.error("API KEY não encontrada no .env");
    process.exit(1);
  }

  console.log("API KEY carregada com sucesso");

  console.log("Limpando tabela Player...");
  await prisma.player.deleteMany({});
  console.log("Tabela limpa");

  let page = 1;
  let totalInserted = 0;

  while (true) {
    const players = await fetchPlayers(page);

    if (!players || players.length === 0) break;

    console.log(`Processando página ${page}`);

    for (const p of players) {
      const name = p.name ?? "Unknown Player";

      const position = p.position?.data?.name ?? "Midfielder";

      const attributes = generateAttributes(position);

      const playerData = {
        slug: nameToSlug(name),

        name,

        nameNormalized: normalizeName(name),

        positions: [position],

        age: p.age ?? 25,

        nationality: p.nationality?.data?.name ?? "Unknown",

        team: null,

        league: null,

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

      totalInserted++;
    }

    page++;
  }

  console.log("=====================================");
  console.log(`Jogadores inseridos: ${totalInserted}`);
  console.log("=====================================");

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error("Erro durante importação:", error);
  process.exit(1);
});
