import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { persistAnalyticalSnapshots, PLAYER_SNAPSHOT_INCLUDE, type PlayerSummarySource } from "../src/scout/player.service";

const prisma = new PrismaClient();

type BackfillSummary = {
  scannedPlayers: number;
  eligiblePlayers: number;
  createdMetrics: number;
  createdFinancials: number;
  createdRiskSnapshots: number;
};

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

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

async function assertAnalyticsTables() {
  const requiredTables = ["Player", "PlayerMetrics", "PlayerFinancials", "PlayerRiskSnapshot"] as const;
  const existence = await Promise.all(
    requiredTables.map(async (tableName) => [tableName, await tableExists(tableName)] as const),
  );

  const missing = existence.filter(([, exists]) => !exists).map(([tableName]) => tableName);
  if (missing.length > 0) {
    throw new Error(`Missing required tables for backfill: ${missing.join(", ")}`);
  }
}

async function loadPlayersBatch(cursorId: string | null, batchSize: number) {
  return prisma.player.findMany({
    take: batchSize,
    ...(cursorId ? { skip: 1, cursor: { id: cursorId } } : {}),
    where: {
      OR: [
        { metricsSnapshots: { none: {} } },
        { financialSnapshots: { none: {} } },
        { riskSnapshots: { none: {} } },
      ],
    },
    orderBy: { id: "asc" },
    include: PLAYER_SNAPSHOT_INCLUDE,
  });
}

async function main() {
  await assertAnalyticsTables();

  const batchSize = parsePositiveInt(process.env.DB_BACKFILL_BATCH_SIZE, 250);
  const concurrency = parsePositiveInt(process.env.DB_BACKFILL_CONCURRENCY, 10);

  const summary: BackfillSummary = {
    scannedPlayers: 0,
    eligiblePlayers: 0,
    createdMetrics: 0,
    createdFinancials: 0,
    createdRiskSnapshots: 0,
  };

  let cursorId: string | null = null;

  while (true) {
    const players = await loadPlayersBatch(cursorId, batchSize);
    if (players.length === 0) {
      break;
    }

    summary.scannedPlayers += players.length;
    cursorId = players[players.length - 1]?.id ?? null;

    for (let index = 0; index < players.length; index += concurrency) {
      const chunk = players.slice(index, index + concurrency);
      const results = await Promise.all(
        chunk.map(async (player) => {
          if (!player.id || !player.name) {
            throw new Error(`Invalid player row detected during backfill: ${JSON.stringify({ id: player.id, name: player.name })}`);
          }

          return persistAnalyticalSnapshots(player as PlayerSummarySource);
        }),
      );

      for (const result of results) {
        if (!result) {
          continue;
        }

        const createdMetrics = result.created.metrics ?? 0;
        const createdFinancials = result.created.financials ?? 0;
        const createdRiskSnapshots = result.created.riskSnapshots ?? 0;

        if (createdMetrics || createdFinancials || createdRiskSnapshots) {
          summary.eligiblePlayers += 1;
        }

        summary.createdMetrics += createdMetrics;
        summary.createdFinancials += createdFinancials;
        summary.createdRiskSnapshots += createdRiskSnapshots;
      }
    }
  }

  console.log(
    JSON.stringify(
      {
        success: true,
        ...summary,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error("DB_BACKFILL_ERROR");
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
