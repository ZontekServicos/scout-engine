import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function tableExists(name: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
    `SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = '${name}'
    ) AS exists`,
  );

  return rows[0]?.exists ?? false;
}

async function countRows(tableName: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
    `SELECT COUNT(*)::int AS count FROM "${tableName}"`,
  );

  return rows[0]?.count ?? 0;
}

async function main() {
  const tableNames = [
    "Player",
    "PlayerMetrics",
    "PlayerFinancials",
    "PlayerRiskSnapshot",
    "ScoutReport",
    "_prisma_migrations",
  ] as const;

  const existenceEntries = await Promise.all(
    tableNames.map(async (tableName) => [tableName, await tableExists(tableName)] as const),
  );

  const existence = Object.fromEntries(existenceEntries);

  const counts: Record<string, number | null> = {};
  for (const tableName of ["Player", "PlayerMetrics", "PlayerFinancials", "PlayerRiskSnapshot", "ScoutReport"]) {
    counts[tableName] = existence[tableName] ? await countRows(tableName) : null;
  }

  const migrations = existence._prisma_migrations
    ? await prisma.$queryRawUnsafe<Array<{ migration_name: string; finished_at: Date | null }>>(
        'SELECT migration_name, finished_at FROM "_prisma_migrations" ORDER BY finished_at ASC NULLS LAST',
      )
    : [];

  console.log(
    JSON.stringify(
      {
        databaseUrlConfigured: Boolean(process.env.DATABASE_URL),
        existence,
        counts,
        migrations,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error("DB_CONSISTENCY_CHECK_ERROR");
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
