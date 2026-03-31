import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type DistinctTypeRow = {
  type: string | null;
};

type EnumLabelRow = {
  enumlabel: string;
};

async function printDistinctTypes(label: string) {
  const rows = await prisma.$queryRawUnsafe<DistinctTypeRow[]>(`
    SELECT DISTINCT "type"::text AS "type"
    FROM "Analysis"
    ORDER BY "type" ASC
  `);

  console.log(label, rows.map((row) => row.type ?? "NULL"));
}

async function printEnumLabels(label: string) {
  const rows = await prisma.$queryRawUnsafe<EnumLabelRow[]>(`
    SELECT e.enumlabel
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'AnalysisType'
    ORDER BY e.enumsortorder ASC
  `);

  console.log(label, rows.map((row) => row.enumlabel));
}

async function printRows(label: string, values: string[]) {
  const quotedValues = values.map((value) => `'${value}'`).join(", ");
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string; type: string | null }>>(`
    SELECT "id", "type"::text AS "type"
    FROM "Analysis"
    WHERE "type"::text IN (${quotedValues})
    ORDER BY "createdAt" ASC
  `);

  console.log(label, rows.length);
  rows.forEach((row, index) => {
    console.log(`[${label} ${index + 1}]`, row.id, row.type);
  });
}

async function renameLegacyEnumValuesIfNeeded() {
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_enum e ON e.enumtypid = t.oid
        WHERE t.typname = 'AnalysisType' AND e.enumlabel = 'REPORT'
      ) THEN
        ALTER TYPE "AnalysisType" RENAME VALUE 'REPORT' TO 'PLAYER_REPORT';
      END IF;

      IF EXISTS (
        SELECT 1
        FROM pg_type t
        JOIN pg_enum e ON e.enumtypid = t.oid
        WHERE t.typname = 'AnalysisType' AND e.enumlabel = 'COMPARISON'
      ) THEN
        ALTER TYPE "AnalysisType" RENAME VALUE 'COMPARISON' TO 'PLAYER_COMPARISON';
      END IF;
    END $$;
  `);
}

async function normalizeTextTypeRowsIfNeeded() {
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'Analysis'
          AND column_name = 'type'
          AND data_type = 'text'
      ) THEN
        UPDATE "Analysis"
        SET "type" = CASE
          WHEN "type" = 'REPORT' THEN 'PLAYER_REPORT'
          WHEN "type" = 'COMPARISON' THEN 'PLAYER_COMPARISON'
          ELSE "type"
        END
        WHERE "type" IN ('REPORT', 'COMPARISON');
      END IF;
    END $$;
  `);
}

async function main() {
  await printDistinctTypes("Distinct analysis types before:");
  await printRows("legacy rows before", ["REPORT", "COMPARISON"]);
  await printEnumLabels("AnalysisType enum labels before:");

  await renameLegacyEnumValuesIfNeeded();
  await normalizeTextTypeRowsIfNeeded();

  await printEnumLabels("AnalysisType enum labels after:");
  await printRows("normalized rows after", ["PLAYER_REPORT", "PLAYER_COMPARISON"]);
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
