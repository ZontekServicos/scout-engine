/**
 * recalculate-overall.ts
 *
 * Batch recalculates the `overall` and breakdown columns for ALL Sportmonks
 * players in the database using their latest PlayerStats snapshot.
 *
 * WHEN TO USE
 *   • After adjusting benchmark values in overall.engine.ts
 *   • After a new PlayerStats bulk import (no overall was computed yet)
 *   • To refresh overall for players whose stats changed since last ingest
 *
 * HOW IT WORKS
 *   1. Fetches all Sportmonks players (with their most recent stats snapshot)
 *   2. Calls calculateOverall(stats, position) for each
 *   3. Writes overall + breakdown + overallCalculatedAt back to Player
 *
 * Usage:
 *   npx ts-node src/scripts/recalculate-overall.ts
 *   npx ts-node src/scripts/recalculate-overall.ts --dry-run
 *   npx ts-node src/scripts/recalculate-overall.ts --batch 500
 *   npx ts-node src/scripts/recalculate-overall.ts --position CB   ← only CBs
 *   npx ts-node src/scripts/recalculate-overall.ts --stale          ← only outdated
 */

import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import pLimit from "p-limit";
import { prisma } from "../lib/prisma";
import { calculateOverall, classifyPosition, MIN_MINUTES_RELIABLE } from "../analytics/overall.engine";
import type { Prisma } from "@prisma/client";

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

const DRY_RUN    = args.includes("--dry-run");
const STALE_ONLY = args.includes("--stale");  // only players where overallCalculatedAt is null or > 7 days old

const batchArgIdx = args.indexOf("--batch");
const batchArg = args.find((a) => a.startsWith("--batch="))?.split("=")[1]
  ?? (batchArgIdx !== -1 ? args[batchArgIdx + 1] : undefined);
const BATCH_SIZE = batchArg && Number.isFinite(Number(batchArg)) ? Number(batchArg) : 1000;

const posArgIdx = args.indexOf("--position");
const posArg = args.find((a) => a.startsWith("--position="))?.split("=")[1]
  ?? (posArgIdx !== -1 ? args[posArgIdx + 1] : undefined);

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface RecalcResult {
  total:     number;
  updated:   number;
  skipped:   number;
  noStats:   number;
  errors:    number;
  durationMs: number;
}

async function main(): Promise<void> {
  const startedAt = Date.now();

  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║         RECÁLCULO DE OVERALL DOS JOGADORES          ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log(`Batch: ${BATCH_SIZE} | Dry run: ${DRY_RUN} | Stale only: ${STALE_ONLY}${posArg ? ` | Position: ${posArg}` : ""}`);

  const result: RecalcResult = {
    total: 0, updated: 0, skipped: 0, noStats: 0, errors: 0, durationMs: 0,
  };

  // Build where clause
  const staleThreshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000);
  const where: Prisma.PlayerWhereInput = {
    source: "sportmonks",
    ...(STALE_ONLY ? {
      OR: [
        { overallCalculatedAt: null },
        { overallCalculatedAt: { lt: staleThreshold } },
      ],
    } : {}),
  };

  // Count
  const total = await prisma.player.count({ where });
  console.log(`\n  Jogadores elegíveis: ${total}`);
  if (total === 0) {
    console.log("  Nada a recalcular.\n");
    await prisma.$disconnect();
    return;
  }

  result.total = total;

  // Process in pages
  const limit = pLimit(8);
  let offset = 0;
  let page = 1;

  while (offset < total) {
    const players = await prisma.player.findMany({
      where,
      select: {
        id: true,
        positions: true,
        statsSnapshots: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            goals: true, assists: true,
            shots: true, shotsOnTarget: true, xG: true, xA: true,
            xGChain: true, xGBuildup: true,
            passes: true, passAccuracy: true, keyPasses: true,
            progressivePasses: true, longPasses: true, longPassAccuracy: true,
            crosses: true, crossAccuracy: true,
            dribblesAttempted: true, dribblesSuccess: true,
            carries: true, progressiveCarries: true,
            tackles: true, tacklesWon: true, interceptions: true,
            clearances: true, blocks: true, pressures: true,
            pressuresSuccess: true, recoveries: true,
            duelsTotal: true, duelsWon: true,
            aerialDuelsTotal: true, aerialDuelsWon: true, groundDuelsWon: true,
            yellowCards: true, redCards: true, foulsCommitted: true, foulsDrawn: true,
            saves: true, savePct: true, cleanSheets: true, goalsConceded: true,
            distanceCovered: true, sprints: true, rating: true,
            minutes: true, appearances: true,
          },
        },
      },
      skip: offset,
      take: BATCH_SIZE,
    });

    if (players.length === 0) break;

    console.log(`\n  Página ${page} — ${players.length} jogadores…`);

    await Promise.all(
      players.map((player) =>
        limit(async () => {
          const snap = player.statsSnapshots[0];
          if (!snap) {
            result.noStats++;
            return;
          }

          // Determine position
          const primaryPosition = player.positions[0] ?? null;
          if (posArg) {
            // Filter by position group
            if (classifyPosition(primaryPosition) !== posArg) {
              result.skipped++;
              return;
            }
          }

          try {
            const overallResult = calculateOverall(snap, primaryPosition);

            if (!DRY_RUN) {
              await prisma.player.update({
                where: { id: player.id },
                data: {
                  overall: overallResult.overall,
                  overallPace:        overallResult.breakdown.pace,
                  overallShooting:    overallResult.breakdown.shooting,
                  overallPassing:     overallResult.breakdown.passing,
                  overallDribbling:   overallResult.breakdown.dribbling,
                  overallDefending:   overallResult.breakdown.defending,
                  overallPhysical:    overallResult.breakdown.physical,
                  overallGkDiving:    overallResult.breakdown.gkDiving    ?? null,
                  overallGkHandling:  overallResult.breakdown.gkHandling  ?? null,
                  overallGkKicking:   overallResult.breakdown.gkKicking   ?? null,
                  overallGkReflex:    overallResult.breakdown.gkReflex    ?? null,
                  overallGkPositioning: overallResult.breakdown.gkPositioning ?? null,
                  overallCalculatedAt: new Date(),
                },
              });
            }

            result.updated++;
          } catch (err) {
            console.error(`  ✗ Player ${player.id}: ${(err as Error).message}`);
            result.errors++;
          }
        }),
      ),
    );

    offset += players.length;
    page++;
  }

  result.durationMs = Date.now() - startedAt;
  printReport(result);
  await prisma.$disconnect();
}

function printReport(r: RecalcResult): void {
  const sep = "═".repeat(58);
  console.log("\n" + sep);
  console.log("  RECÁLCULO DE OVERALL — RESULTADO");
  console.log(sep);
  console.log(`  Total elegíveis     : ${r.total}`);
  console.log(`  Atualizados         : ${r.updated}`);
  console.log(`  Sem estatísticas    : ${r.noStats}`);
  console.log(`  Pulados (filtro)    : ${r.skipped}`);
  console.log(`  Erros               : ${r.errors}`);
  console.log(`  Duração             : ${(r.durationMs / 1000).toFixed(1)}s`);
  if (DRY_RUN) console.log("\n  ⚠  DRY RUN — nenhuma escrita no banco.");
  console.log(`  Min. minutos confiável: ${MIN_MINUTES_RELIABLE}`);
  console.log(sep + "\n");
}

main().catch(async (err) => {
  console.error("❌ Erro fatal:", (err as Error).message);
  await prisma.$disconnect();
  process.exit(1);
});
