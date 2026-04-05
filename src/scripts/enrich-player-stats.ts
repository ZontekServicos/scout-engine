/**
 * enrich-player-stats.ts
 *
 * Fetches stats from the Sportmonks API for all players in the DB that
 * have no PlayerStats snapshot, calculates their overall, and saves both
 * to the database.
 *
 * WHY THIS EXISTS
 *   The /squads endpoint (used to import player rosters) does not return
 *   detailed statistics on most plans. This script enriches those players
 *   by calling GET /players/{id}?include=statistics.details&filters=playerStatisticSeasons:{seasonId}
 *   for each one individually.
 *
 * USAGE
 *   npx ts-node src/scripts/enrich-player-stats.ts --season=26763
 *   npx ts-node src/scripts/enrich-player-stats.ts --season=26763 --dry-run
 *   npx ts-node src/scripts/enrich-player-stats.ts --season=26763 --batch=50
 *   npx ts-node src/scripts/enrich-player-stats.ts --season=26763 --stale
 *
 *   # Brazilian leagues season IDs:
 *   #   Série A 2025 : 26763
 *   #   Série B 2025 : 27198
 *   #   Copa BR 2025 : 27151
 *
 * Requires: SPORTMONKS_API_TOKEN in .env
 */

import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import pLimit from "p-limit";
import { prisma } from "../lib/prisma";
import { fetchPlayerStatsBySeason } from "../integrations/sportmonks/sportmonks.client";
import { normalizeStats } from "../integrations/sportmonks/pipeline/normalize-stats";
import { calculateOverall, MIN_MINUTES_RELIABLE } from "../analytics/overall.engine";

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

const DRY_RUN    = args.includes("--dry-run");
const STALE_ONLY = args.includes("--stale");   // re-enrich players whose stats are > 7 days old
const FORCE      = args.includes("--force");   // re-enrich ALL players regardless of existing stats

const seasonArg =
  args.find((a) => a.startsWith("--season="))?.split("=")[1] ??
  args[args.indexOf("--season") + 1];

if (!seasonArg || isNaN(Number(seasonArg))) {
  console.error(
    "❌  --season=<seasonId> é obrigatório.\n" +
    "   Exemplo: npx ts-node src/scripts/enrich-player-stats.ts --season=26763\n\n" +
    "   Season IDs das ligas brasileiras:\n" +
    "     Série A 2025 : 26763\n" +
    "     Série B 2025 : 27198\n" +
    "     Copa BR 2025 : 27151",
  );
  process.exit(1);
}

const SEASON_ID = Number(seasonArg);

const batchArgIndex = args.indexOf("--batch");
const batchArg =
  args.find((a) => a.startsWith("--batch="))?.split("=")[1] ??
  (batchArgIndex !== -1 ? args[batchArgIndex + 1] : undefined);
const BATCH_SIZE = batchArg ? Number(batchArg) : 200;

const CONCURRENCY = 4;   // parallel API calls (stay under rate limits)

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface EnrichResult {
  total:      number;
  enriched:   number;
  noStats:    number;   // API returned empty stats
  skipped:    number;   // dry-run or filter
  errors:     number;
  durationMs: number;
}

async function main(): Promise<void> {
  const startedAt = Date.now();

  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║       ENRIQUECIMENTO DE STATS E OVERALL              ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log(`  Season ID  : ${SEASON_ID}`);
  console.log(`  Batch      : ${BATCH_SIZE}  |  Concurrency: ${CONCURRENCY}`);
  console.log(`  Dry run    : ${DRY_RUN}  |  Stale only: ${STALE_ONLY}  |  Force: ${FORCE}`);

  const result: EnrichResult = {
    total: 0, enriched: 0, noStats: 0, skipped: 0, errors: 0, durationMs: 0,
  };

  // Build where clause
  const staleThreshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000);

  const where = FORCE
    ? // Force: ALL sportmonks players
      { source: "sportmonks", externalId: { not: null } }
    : STALE_ONLY
    ? // Stale: players whose overall is null or older than 7 days
      {
        source: "sportmonks",
        externalId: { not: null },
        OR: [
          { overallCalculatedAt: null },
          { overallCalculatedAt: { lt: staleThreshold } },
        ],
      }
    : // Default: players with NO stats snapshot that has real minutes played
      //   (catches players imported via squads endpoint with empty stats)
      {
        source: "sportmonks",
        externalId: { not: null },
        statsSnapshots: {
          none: { minutes: { gt: 0 } },
        },
      };

  const total = await prisma.player.count({ where });
  console.log(`\n  Jogadores elegíveis: ${total}`);

  if (total === 0) {
    console.log("  Nada a enriquecer.\n");
    await prisma.$disconnect();
    return;
  }

  result.total = total;

  const limit = pLimit(CONCURRENCY);
  let offset = 0;
  let page = 1;

  while (offset < total) {
    const players = await prisma.player.findMany({
      where,
      select: {
        id: true,
        externalId: true,
        positions: true,
        name: true,
      },
      skip: offset,
      take: BATCH_SIZE,
    });

    if (players.length === 0) break;

    console.log(`\n  Página ${page} — ${players.length} jogadores…`);

    await Promise.all(
      players.map((player) =>
        limit(async () => {
          if (!player.externalId) {
            result.skipped++;
            return;
          }

          if (DRY_RUN) {
            result.skipped++;
            return;
          }

          try {
            // 1. Fetch stats from Sportmonks
            const raw = await fetchPlayerStatsBySeason(
              Number(player.externalId),
              SEASON_ID,
            );

            const stats = (raw as any).stats ?? (raw as any).statistics ?? [];
            const normalized = normalizeStats(Array.isArray(stats) ? stats : []);

            // 2. Check if we actually got useful stats
            const hasStats =
              normalized.minutesPlayed > 0 ||
              normalized.goals > 0 ||
              normalized.assists > 0 ||
              normalized.tackles > 0 ||
              normalized.passesTotal > 0;

            if (!hasStats) {
              result.noStats++;
              // Still save an empty snapshot to avoid re-fetching endlessly
              await prisma.player.update({
                where: { id: player.id },
                data: { overallCalculatedAt: new Date() },
              });
              return;
            }

            // 3. Calculate overall
            const primaryPosition = player.positions[0] ?? null;
            const overallResult = calculateOverall(normalized, primaryPosition);

            // 4. Upsert PlayerStats snapshot
            await prisma.playerStats.create({
              data: {
                playerId: player.id,
                source: "sportmonks",
                goals:              normalized.goals              > 0 ? normalized.goals              : null,
                assists:            normalized.assists            > 0 ? normalized.assists            : null,
                shots:              normalized.shotsTotal         > 0 ? normalized.shotsTotal         : null,
                shotsOnTarget:      normalized.shotsOnTarget      > 0 ? normalized.shotsOnTarget      : null,
                xG:                 normalized.xG                 > 0 ? normalized.xG                 : null,
                xA:                 normalized.xA                 > 0 ? normalized.xA                 : null,
                xGChain:            normalized.xGChain            > 0 ? normalized.xGChain            : null,
                xGBuildup:          normalized.xGBuildup          > 0 ? normalized.xGBuildup          : null,
                passes:             normalized.passesTotal        > 0 ? normalized.passesTotal        : null,
                passAccuracy:       normalized.passAccuracyPct    > 0 ? normalized.passAccuracyPct    : null,
                keyPasses:          normalized.keyPasses          > 0 ? normalized.keyPasses          : null,
                progressivePasses:  normalized.progressivePasses  > 0 ? normalized.progressivePasses  : null,
                longPasses:         normalized.longPasses         > 0 ? normalized.longPasses         : null,
                longPassAccuracy:   normalized.longPassAccuracy   > 0 ? normalized.longPassAccuracy   : null,
                crosses:            normalized.crosses            > 0 ? normalized.crosses            : null,
                crossAccuracy:      normalized.crossAccuracy      > 0 ? normalized.crossAccuracy      : null,
                dribblesAttempted:  normalized.dribblesAttempted  > 0 ? normalized.dribblesAttempted  : null,
                dribblesSuccess:    normalized.dribblesSuccess    > 0 ? normalized.dribblesSuccess    : null,
                carries:            normalized.carries            > 0 ? normalized.carries            : null,
                progressiveCarries: normalized.progressiveCarries > 0 ? normalized.progressiveCarries : null,
                tackles:            normalized.tackles            > 0 ? normalized.tackles            : null,
                tacklesWon:         normalized.tacklesWon         > 0 ? normalized.tacklesWon         : null,
                interceptions:      normalized.interceptions      > 0 ? normalized.interceptions      : null,
                clearances:         normalized.clearances         > 0 ? normalized.clearances         : null,
                blocks:             normalized.blocks             > 0 ? normalized.blocks             : null,
                pressures:          normalized.pressures          > 0 ? normalized.pressures          : null,
                pressuresSuccess:   normalized.pressuresSuccess   > 0 ? normalized.pressuresSuccess   : null,
                recoveries:         normalized.recoveries         > 0 ? normalized.recoveries         : null,
                duelsTotal:         normalized.duelsTotal         > 0 ? normalized.duelsTotal         : null,
                duelsWon:           normalized.duelsWon           > 0 ? normalized.duelsWon           : null,
                aerialDuelsTotal:   normalized.aerialDuelsTotal   > 0 ? normalized.aerialDuelsTotal   : null,
                aerialDuelsWon:     normalized.aerialDuelsWon     > 0 ? normalized.aerialDuelsWon     : null,
                groundDuelsWon:     normalized.groundDuelsWon     > 0 ? normalized.groundDuelsWon     : null,
                yellowCards:        normalized.yellowCards        > 0 ? normalized.yellowCards        : null,
                redCards:           normalized.redCards           > 0 ? normalized.redCards           : null,
                foulsCommitted:     normalized.foulsCommitted     > 0 ? normalized.foulsCommitted     : null,
                foulsDrawn:         normalized.foulsDrawn         > 0 ? normalized.foulsDrawn         : null,
                distanceCovered:    normalized.distanceCovered    > 0 ? normalized.distanceCovered    : null,
                sprints:            normalized.sprints            > 0 ? normalized.sprints            : null,
                rating:             normalized.rating             > 0 ? normalized.rating             : null,
                minutes:            normalized.minutesPlayed      > 0 ? normalized.minutesPlayed      : null,
                appearances:        normalized.appearances        > 0 ? normalized.appearances        : null,
              },
            });

            // 5. Update player with overall + breakdown
            await prisma.player.update({
              where: { id: player.id },
              data: {
                overall:              overallResult.overall,
                overallPace:          overallResult.breakdown.pace,
                overallShooting:      overallResult.breakdown.shooting,
                overallPassing:       overallResult.breakdown.passing,
                overallDribbling:     overallResult.breakdown.dribbling,
                overallDefending:     overallResult.breakdown.defending,
                overallPhysical:      overallResult.breakdown.physical,
                overallGkDiving:      overallResult.breakdown.gkDiving       ?? null,
                overallGkHandling:    overallResult.breakdown.gkHandling     ?? null,
                overallGkKicking:     overallResult.breakdown.gkKicking      ?? null,
                overallGkReflex:      overallResult.breakdown.gkReflex       ?? null,
                overallGkPositioning: overallResult.breakdown.gkPositioning  ?? null,
                overallCalculatedAt:  new Date(),
              },
            });

            result.enriched++;

            if (result.enriched % 20 === 0) {
              console.log(`    … ${result.enriched} enriquecidos até agora`);
            }
          } catch (err) {
            console.error(`  ✗ ${player.name} (${player.externalId}): ${(err as Error).message}`);
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

function printReport(r: EnrichResult): void {
  const sep = "═".repeat(58);
  console.log("\n" + sep);
  console.log("  ENRIQUECIMENTO — RESULTADO FINAL");
  console.log(sep);
  console.log(`  Total elegíveis     : ${r.total}`);
  console.log(`  Enriquecidos        : ${r.enriched}`);
  console.log(`  Sem stats na API    : ${r.noStats}`);
  console.log(`  Pulados             : ${r.skipped}`);
  console.log(`  Erros               : ${r.errors}`);
  console.log(`  Duração             : ${(r.durationMs / 1000).toFixed(1)}s`);
  console.log(`  Min. min. confiável : ${MIN_MINUTES_RELIABLE}`);
  if (DRY_RUN) console.log("\n  ⚠  DRY RUN — nenhuma escrita no banco.");
  console.log(sep + "\n");
}

main().catch(async (err) => {
  console.error("❌ Erro fatal:", (err as Error).message);
  await prisma.$disconnect();
  process.exit(1);
});
