import { PrismaClient } from "@prisma/client";
import { nameToSlug, normalizeName } from "../src/utils/normalizeName";

const prisma = new PrismaClient();

type Position = "ST" | "LW" | "RW" | "CM" | "CDM" | "CB" | "LB" | "RB";

type SeedPlayer = {
  name: string;
  position: Position;
  age: number;
  nationality: string;
  team?: string;
  league?: string;
  overall?: number;
  potential?: number;
  marketValue?: number;
};

/**
 * Base de jogadores reais para seed inicial.
 * Esta lista evita os registros fictícios "Player X" e deixa o ambiente de
 * desenvolvimento próximo de um contexto real de scouting.
 */
const REAL_PLAYERS: SeedPlayer[] = [
  {
    name: "Kylian Mbappe",
    position: "ST",
    age: 27,
    nationality: "France",
    team: "Real Madrid",
    league: "La Liga",
    overall: 92,
    potential: 94,
    marketValue: 180000000,
  },
  {
    name: "Erling Haaland",
    position: "ST",
    age: 26,
    nationality: "Norway",
    team: "Manchester City",
    league: "Premier League",
    overall: 91,
    potential: 93,
    marketValue: 175000000,
  },
  {
    name: "Harry Kane",
    position: "ST",
    age: 33,
    nationality: "England",
    team: "Bayern Munich",
    league: "Bundesliga",
    overall: 90,
    potential: 90,
    marketValue: 95000000,
  },
  {
    name: "Victor Osimhen",
    position: "ST",
    age: 27,
    nationality: "Nigeria",
    team: "Napoli",
    league: "Serie A",
    overall: 88,
    potential: 90,
    marketValue: 115000000,
  },
  {
    name: "Lautaro Martinez",
    position: "ST",
    age: 29,
    nationality: "Argentina",
    team: "Inter",
    league: "Serie A",
    overall: 89,
    potential: 90,
    marketValue: 98000000,
  },
  {
    name: "Vinicius Junior",
    position: "LW",
    age: 26,
    nationality: "Brazil",
    team: "Real Madrid",
    league: "La Liga",
    overall: 90,
    potential: 93,
    marketValue: 170000000,
  },
  {
    name: "Rafael Leao",
    position: "LW",
    age: 27,
    nationality: "Portugal",
    team: "Milan",
    league: "Serie A",
    overall: 88,
    potential: 90,
    marketValue: 110000000,
  },
  {
    name: "Khvicha Kvaratskhelia",
    position: "LW",
    age: 25,
    nationality: "Georgia",
    team: "Napoli",
    league: "Serie A",
    overall: 87,
    potential: 90,
    marketValue: 95000000,
  },
  {
    name: "Luis Diaz",
    position: "LW",
    age: 29,
    nationality: "Colombia",
    team: "Liverpool",
    league: "Premier League",
    overall: 86,
    potential: 87,
    marketValue: 70000000,
  },
  {
    name: "Nico Williams",
    position: "LW",
    age: 24,
    nationality: "Spain",
    team: "Athletic Club",
    league: "La Liga",
    overall: 84,
    potential: 88,
    marketValue: 65000000,
  },
  {
    name: "Mohamed Salah",
    position: "RW",
    age: 34,
    nationality: "Egypt",
    team: "Liverpool",
    league: "Premier League",
    overall: 89,
    potential: 89,
    marketValue: 70000000,
  },
  {
    name: "Bukayo Saka",
    position: "RW",
    age: 25,
    nationality: "England",
    team: "Arsenal",
    league: "Premier League",
    overall: 88,
    potential: 91,
    marketValue: 125000000,
  },
  {
    name: "Rodrygo",
    position: "RW",
    age: 25,
    nationality: "Brazil",
    team: "Real Madrid",
    league: "La Liga",
    overall: 87,
    potential: 90,
    marketValue: 98000000,
  },
  {
    name: "Leroy Sane",
    position: "RW",
    age: 30,
    nationality: "Germany",
    team: "Bayern Munich",
    league: "Bundesliga",
    overall: 86,
    potential: 86,
    marketValue: 65000000,
  },
  {
    name: "Cole Palmer",
    position: "RW",
    age: 24,
    nationality: "England",
    team: "Chelsea",
    league: "Premier League",
    overall: 86,
    potential: 90,
    marketValue: 90000000,
  },
  {
    name: "Kevin De Bruyne",
    position: "CM",
    age: 35,
    nationality: "Belgium",
    team: "Manchester City",
    league: "Premier League",
    overall: 91,
    potential: 91,
    marketValue: 65000000,
  },
  {
    name: "Jude Bellingham",
    position: "CM",
    age: 23,
    nationality: "England",
    team: "Real Madrid",
    league: "La Liga",
    overall: 90,
    potential: 94,
    marketValue: 180000000,
  },
  {
    name: "Pedri",
    position: "CM",
    age: 24,
    nationality: "Spain",
    team: "Barcelona",
    league: "La Liga",
    overall: 88,
    potential: 92,
    marketValue: 120000000,
  },
  {
    name: "Frenkie de Jong",
    position: "CM",
    age: 29,
    nationality: "Netherlands",
    team: "Barcelona",
    league: "La Liga",
    overall: 87,
    potential: 88,
    marketValue: 85000000,
  },
  {
    name: "Bruno Guimaraes",
    position: "CM",
    age: 29,
    nationality: "Brazil",
    team: "Newcastle",
    league: "Premier League",
    overall: 86,
    potential: 88,
    marketValue: 90000000,
  },
  {
    name: "Rodri",
    position: "CDM",
    age: 30,
    nationality: "Spain",
    team: "Manchester City",
    league: "Premier League",
    overall: 91,
    potential: 92,
    marketValue: 130000000,
  },
  {
    name: "Declan Rice",
    position: "CDM",
    age: 27,
    nationality: "England",
    team: "Arsenal",
    league: "Premier League",
    overall: 88,
    potential: 90,
    marketValue: 115000000,
  },
  {
    name: "Aurelien Tchouameni",
    position: "CDM",
    age: 26,
    nationality: "France",
    team: "Real Madrid",
    league: "La Liga",
    overall: 86,
    potential: 89,
    marketValue: 90000000,
  },
  {
    name: "Joshua Kimmich",
    position: "CDM",
    age: 31,
    nationality: "Germany",
    team: "Bayern Munich",
    league: "Bundesliga",
    overall: 87,
    potential: 87,
    marketValue: 70000000,
  },
  {
    name: "Joao Palhinha",
    position: "CDM",
    age: 31,
    nationality: "Portugal",
    team: "Bayern Munich",
    league: "Bundesliga",
    overall: 85,
    potential: 85,
    marketValue: 55000000,
  },
  {
    name: "Virgil van Dijk",
    position: "CB",
    age: 35,
    nationality: "Netherlands",
    team: "Liverpool",
    league: "Premier League",
    overall: 89,
    potential: 89,
    marketValue: 45000000,
  },
  {
    name: "Ruben Dias",
    position: "CB",
    age: 29,
    nationality: "Portugal",
    team: "Manchester City",
    league: "Premier League",
    overall: 88,
    potential: 89,
    marketValue: 85000000,
  },
  {
    name: "William Saliba",
    position: "CB",
    age: 25,
    nationality: "France",
    team: "Arsenal",
    league: "Premier League",
    overall: 87,
    potential: 90,
    marketValue: 90000000,
  },
  {
    name: "Ronald Araujo",
    position: "CB",
    age: 27,
    nationality: "Uruguay",
    team: "Barcelona",
    league: "La Liga",
    overall: 86,
    potential: 89,
    marketValue: 80000000,
  },
  {
    name: "Alessandro Bastoni",
    position: "CB",
    age: 27,
    nationality: "Italy",
    team: "Inter",
    league: "Serie A",
    overall: 86,
    potential: 89,
    marketValue: 70000000,
  },
  {
    name: "Alphonso Davies",
    position: "LB",
    age: 26,
    nationality: "Canada",
    team: "Bayern Munich",
    league: "Bundesliga",
    overall: 86,
    potential: 88,
    marketValue: 70000000,
  },
  {
    name: "Theo Hernandez",
    position: "LB",
    age: 29,
    nationality: "France",
    team: "Milan",
    league: "Serie A",
    overall: 86,
    potential: 87,
    marketValue: 65000000,
  },
  {
    name: "Alejandro Balde",
    position: "LB",
    age: 23,
    nationality: "Spain",
    team: "Barcelona",
    league: "La Liga",
    overall: 83,
    potential: 88,
    marketValue: 50000000,
  },
  {
    name: "Nuno Mendes",
    position: "LB",
    age: 24,
    nationality: "Portugal",
    team: "PSG",
    league: "Ligue 1",
    overall: 84,
    potential: 89,
    marketValue: 60000000,
  },
  {
    name: "Luke Shaw",
    position: "LB",
    age: 31,
    nationality: "England",
    team: "Manchester United",
    league: "Premier League",
    overall: 83,
    potential: 83,
    marketValue: 35000000,
  },
  {
    name: "Trent Alexander-Arnold",
    position: "RB",
    age: 28,
    nationality: "England",
    team: "Liverpool",
    league: "Premier League",
    overall: 87,
    potential: 89,
    marketValue: 90000000,
  },
  {
    name: "Achraf Hakimi",
    position: "RB",
    age: 28,
    nationality: "Morocco",
    team: "PSG",
    league: "Ligue 1",
    overall: 86,
    potential: 88,
    marketValue: 70000000,
  },
  {
    name: "Reece James",
    position: "RB",
    age: 27,
    nationality: "England",
    team: "Chelsea",
    league: "Premier League",
    overall: 84,
    potential: 87,
    marketValue: 55000000,
  },
  {
    name: "Jeremie Frimpong",
    position: "RB",
    age: 25,
    nationality: "Netherlands",
    team: "Leverkusen",
    league: "Bundesliga",
    overall: 84,
    potential: 88,
    marketValue: 65000000,
  },
  {
    name: "Denzel Dumfries",
    position: "RB",
    age: 30,
    nationality: "Netherlands",
    team: "Inter",
    league: "Serie A",
    overall: 83,
    potential: 84,
    marketValue: 40000000,
  },
];

function expandPlayers(base: SeedPlayer[], copies: number): SeedPlayer[] {
  const output: SeedPlayer[] = [];

  for (let i = 0; i < copies; i += 1) {
    for (const player of base) {
      const suffix = i === 0 ? "" : ` ${i + 1}`;
      output.push({
        ...player,
        name: `${player.name}${suffix}`,
        age: Math.max(18, Math.min(39, player.age + ((i % 3) - 1))),
      });
    }
  }

  return output;
}

/**
 * Monta atributos mínimos para manter compatibilidade com engines existentes.
 */
function buildAttributes(overall: number) {
  const clamped = Math.max(40, Math.min(99, overall));
  return {
    pace: clamped,
    shooting: clamped,
    passing: clamped,
    dribbling: clamped,
    defending: clamped,
    physical: clamped,
    overall: clamped,
  };
}

async function main() {
  console.log("Iniciando seed com base real de jogadores...");

  await prisma.player.deleteMany();

  const players = expandPlayers(REAL_PLAYERS, 50); // 40 * 50 = 2.000 registros

  await prisma.player.createMany({
    data: players.map((player) => ({
      slug: nameToSlug(player.name),
      name: player.name,
      nameNormalized: normalizeName(player.name),
      positions: [player.position],
      age: player.age,
      nationality: player.nationality,
      team: player.team ?? null,
      league: player.league ?? null,
      marketValue: player.marketValue ?? null,
      contractEnd: null,
      overall: player.overall ?? null,
      potential: player.potential ?? null,
      attributes: buildAttributes(player.overall ?? 65),
      archetype: {
        role: `Seed ${player.position}`,
      },
    })),
    skipDuplicates: true,
  });

  console.log(`Seed finalizado. ${players.length} jogadores reais inseridos.`);
}

main()
  .catch((error) => {
    console.error("Erro no seed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
