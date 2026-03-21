import "dotenv/config";
import { PrismaClient } from "@prisma/client";

type RequiredConstraint =
  | "Analysis_scout_report_id_fkey"
  | "AnalysisComparison_analysisId_fkey"
  | "AnalysisComparison_playerId_fkey";

type RequiredIndex =
  | "Analysis_scout_report_id_key"
  | "Analysis_type_idx"
  | "Analysis_createdAt_idx"
  | "Analysis_status_idx"
  | "AnalysisComparison_analysisId_idx"
  | "AnalysisComparison_playerId_idx"
  | "AnalysisComparison_analysisId_order_key"
  | "AnalysisComparison_analysisId_playerId_key";

type RequiredMigration =
  | "20260320110000_add_analysis_hub"
  | "20260320133000_add_analysis_description";

const prisma = new PrismaClient();

const requiredTables = ["Analysis", "AnalysisComparison", "ScoutReport", "Player", "_prisma_migrations"] as const;
const requiredEnums = ["AnalysisType", "AnalysisStatus"] as const;
const requiredConstraints: RequiredConstraint[] = [
  "Analysis_scout_report_id_fkey",
  "AnalysisComparison_analysisId_fkey",
  "AnalysisComparison_playerId_fkey",
];
const requiredIndexes: RequiredIndex[] = [
  "Analysis_scout_report_id_key",
  "Analysis_type_idx",
  "Analysis_createdAt_idx",
  "Analysis_status_idx",
  "AnalysisComparison_analysisId_idx",
  "AnalysisComparison_playerId_idx",
  "AnalysisComparison_analysisId_order_key",
  "AnalysisComparison_analysisId_playerId_key",
];
const requiredMigrations: RequiredMigration[] = [
  "20260320110000_add_analysis_hub",
  "20260320133000_add_analysis_description",
];

const requiredColumns: Record<string, string[]> = {
  Analysis: ["id", "type", "title", "description", "createdAt", "updatedAt", "status", "analyst", "scout_report_id"],
  AnalysisComparison: ["id", "analysisId", "playerId", "order"],
};

async function tableExists(name: string) {
  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${name}
    ) AS exists
  `;

  return rows[0]?.exists ?? false;
}

async function countRows(tableName: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ count: number }>>(
    `SELECT COUNT(*)::int AS count FROM "${tableName}"`,
  );

  return rows[0]?.count ?? 0;
}

async function getColumns(tableName: string) {
  return prisma.$queryRaw<Array<{ column_name: string; data_type: string; is_nullable: string }>>`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = ${tableName}
    ORDER BY ordinal_position
  `;
}

async function getExistingConstraints() {
  const rows = await prisma.$queryRaw<Array<{ conname: string }>>`
    SELECT conname
    FROM pg_constraint
    WHERE conname = ANY(${requiredConstraints})
  `;

  return new Set(rows.map((row) => row.conname));
}

async function getExistingIndexes() {
  const rows = await prisma.$queryRaw<Array<{ indexname: string }>>`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = ANY(${requiredIndexes})
  `;

  return new Set(rows.map((row) => row.indexname));
}

async function getExistingEnums() {
  const rows = await prisma.$queryRaw<Array<{ typname: string }>>`
    SELECT typname
    FROM pg_type
    WHERE typname = ANY(${requiredEnums})
  `;

  return new Set(rows.map((row) => row.typname));
}

async function getMigrationHistoryAvailable() {
  return tableExists("_prisma_migrations");
}

async function getAppliedMigrations() {
  const rows = await prisma.$queryRaw<Array<{ migration_name: string; finished_at: Date | null }>>`
    SELECT migration_name, finished_at
    FROM "_prisma_migrations"
    WHERE migration_name = ANY(${requiredMigrations})
    ORDER BY migration_name ASC
  `;

  return new Map(rows.map((row) => [row.migration_name, row.finished_at]));
}

async function main() {
  const existenceEntries = await Promise.all(
    requiredTables.map(async (tableName) => [tableName, await tableExists(tableName)] as const),
  );
  const existence = Object.fromEntries(existenceEntries);

  const counts: Record<string, number | null> = {};
  for (const tableName of ["Analysis", "AnalysisComparison", "ScoutReport"]) {
    counts[tableName] = existence[tableName] ? await countRows(tableName) : null;
  }

  const tableColumns: Record<string, Array<{ column_name: string; data_type: string; is_nullable: string }>> = {};
  for (const tableName of ["Analysis", "AnalysisComparison"]) {
    tableColumns[tableName] = existence[tableName] ? await getColumns(tableName) : [];
  }

  const enumSet = await getExistingEnums();
  const constraintSet = await getExistingConstraints();
  const indexSet = await getExistingIndexes();
  const migrationHistoryAvailable = await getMigrationHistoryAvailable();
  const appliedMigrations = migrationHistoryAvailable ? await getAppliedMigrations() : new Map<string, Date | null>();

  const missingColumns = Object.fromEntries(
    Object.entries(requiredColumns).map(([tableName, columns]) => {
      const actualColumns = new Set((tableColumns[tableName] ?? []).map((column) => column.column_name));
      return [tableName, columns.filter((column) => !actualColumns.has(column))];
    }),
  );

  const missingEnums = requiredEnums.filter((name) => !enumSet.has(name));
  const missingConstraints = requiredConstraints.filter((name) => !constraintSet.has(name));
  const missingIndexes = requiredIndexes.filter((name) => !indexSet.has(name));
  const missingMigrations = requiredMigrations.filter((name) => !appliedMigrations.has(name));

  const runtimeReady =
    existence.Analysis &&
    existence.AnalysisComparison &&
    missingEnums.length === 0 &&
    missingConstraints.length === 0 &&
    missingIndexes.length === 0 &&
    Object.values(missingColumns).every((columns) => columns.length === 0);

  const migrationHistoryAligned = migrationHistoryAvailable && missingMigrations.length === 0;
  const partiallyMigrated = runtimeReady && !migrationHistoryAligned;

  const result = {
    databaseUrlConfigured: Boolean(process.env.DATABASE_URL),
    runtimeReady,
    migrationHistoryAligned,
    partiallyMigrated,
    existence,
    counts,
    requiredColumns,
    tableColumns,
    missingColumns,
    missingEnums,
    missingConstraints,
    missingIndexes,
    migrations: requiredMigrations.map((migrationName) => ({
      migrationName,
      applied: appliedMigrations.has(migrationName),
      finishedAt: appliedMigrations.get(migrationName)?.toISOString?.() ?? null,
    })),
    recommendations: {
      applyManualSql: !runtimeReady,
      resolvePrismaMigrations: runtimeReady && !migrationHistoryAligned,
    },
  };

  console.log(JSON.stringify(result, null, 2));

  if (!runtimeReady) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error("ANALYSIS_MIGRATION_CHECK_ERROR");
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
