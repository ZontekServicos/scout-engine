import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * POSIÇÕES FIFA PADRÃO DO SISTEMA
 */
type Position =
  | "ST"
  | "LW"
  | "RW"
  | "CM"
  | "CDM"
  | "CB"
  | "LB"
  | "RB";

const POSITIONS: Position[] = [
  "ST",
  "LW",
  "RW",
  "CM",
  "CDM",
  "CB",
  "LB",
  "RB",
];

/**
 * ENTRYPOINT DO SEED
 */
async function main() {
  console.log("🌱 Seeding Scout Engine database...");

  // LIMPA DADOS ANTIGOS
  await prisma.player.deleteMany();

  const players = generatePlayers(64);

  await prisma.player.createMany({
    data: players,
  });

  console.log(`✅ ${players.length} players created successfully`);
}

/**
 * GERA JOGADORES
 */
function generatePlayers(amount: number) {
  return Array.from({ length: amount }).map((_, index) => {
    const position = POSITIONS[index % POSITIONS.length];

    return {
      name: `Player ${index + 1}`,
      position,
      age: randomBetween(18, 34),
      nationality: randomNationality(),

      attributes: generateAttributes(position),
      archetype: generateArchetype(position),
    };
  });
}

/**
 * ATRIBUTOS FIFA-LIKE POR POSIÇÃO
 */
function generateAttributes(position: Position) {
  const base = randomBetween(60, 75);
  const boost = (value: number) =>
    base + value + randomBetween(-3, 3);

  switch (position) {
    case "ST":
      return {
        pace: boost(10),
        shooting: boost(15),
        passing: boost(3),
        dribbling: boost(8),
        defending: boost(-10),
        physical: boost(5),
      };

    case "LW":
    case "RW":
      return {
        pace: boost(15),
        shooting: boost(8),
        passing: boost(5),
        dribbling: boost(12),
        defending: boost(-8),
        physical: boost(3),
      };

    case "CM":
      return {
        pace: boost(5),
        shooting: boost(5),
        passing: boost(15),
        dribbling: boost(10),
        defending: boost(5),
        physical: boost(5),
      };

    case "CDM":
      return {
        pace: boost(2),
        shooting: boost(-5),
        passing: boost(10),
        dribbling: boost(3),
        defending: boost(18),
        physical: boost(12),
      };

    case "CB":
      return {
        pace: boost(-5),
        shooting: boost(-10),
        passing: boost(3),
        dribbling: boost(-5),
        defending: boost(20),
        physical: boost(15),
      };

    case "LB":
    case "RB":
      return {
        pace: boost(10),
        shooting: boost(2),
        passing: boost(8),
        dribbling: boost(6),
        defending: boost(12),
        physical: boost(8),
      };

    default:
      return {
        pace: boost(5),
        shooting: boost(5),
        passing: boost(5),
        dribbling: boost(5),
        defending: boost(5),
        physical: boost(5),
      };
  }
}

/**
 * ARQUÉTIPOS POR POSIÇÃO
 */
function generateArchetype(position: Position) {
  const archetypes: Record<Position, string> = {
    ST: "Finisher",
    LW: "Inverted Winger",
    RW: "Winger",
    CM: "Playmaker",
    CDM: "Anchor Man",
    CB: "Ball Winning Defender",
    LB: "Offensive Fullback",
    RB: "Defensive Fullback",
  };

  return {
    role: archetypes[position],
  };
}

/**
 * HELPERS
 */
function randomBetween(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomNationality() {
  const list = [
    "Brazil",
    "Argentina",
    "Spain",
    "France",
    "England",
    "Germany",
    "Portugal",
    "Italy",
  ];

  return list[Math.floor(Math.random() * list.length)];
}

/**
 * EXECUÇÃO
 */
main()
  .catch((e) => {
    console.error("❌ Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });