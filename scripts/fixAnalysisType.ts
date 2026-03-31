import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type DistinctTypeRow = {
  type: string | null;
};

async function printDistinctTypes(label: string) {
  const rows = await prisma.$queryRawUnsafe<DistinctTypeRow[]>(`
    SELECT DISTINCT "type"
    FROM "Analysis"
    ORDER BY "type" ASC
  `);

  console.log(label, rows.map((row) => row.type ?? "NULL"));
}

async function main() {
  await printDistinctTypes("Distinct analysis types before:");

  const beforeRows = await prisma.$queryRawUnsafe<DistinctTypeRow[]>(`
    SELECT "type"
    FROM "Analysis"
    WHERE "type" = 'REPORT'
    ORDER BY "createdAt" ASC
  `);

  console.log("Rows with deprecated type before:", beforeRows.length);
  beforeRows.forEach((row, index) => {
    console.log(`[before ${index + 1}]`, row.type);
  });

  const updatedCount = await prisma.$executeRawUnsafe(`
    UPDATE "Analysis"
    SET "type" = 'PLAYER_REPORT'
    WHERE "type" = 'REPORT'
  `);

  console.log("Updated rows:", updatedCount);

  const afterRows = await prisma.$queryRawUnsafe<DistinctTypeRow[]>(`
    SELECT "type"
    FROM "Analysis"
    WHERE "type" = 'PLAYER_REPORT'
    ORDER BY "createdAt" ASC
  `);

  console.log("Rows with normalized type after:", afterRows.length);
  afterRows.forEach((row, index) => {
    console.log(`[after ${index + 1}]`, row.type);
  });

  await printDistinctTypes("Distinct analysis types after:");
}

main()
  .catch((error) => {
    console.error("Failed to normalize Analysis.type values:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
