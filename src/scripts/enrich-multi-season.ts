/**
 * enrich-multi-season.ts
 *
 * Enriches player overall ratings using stats from MULTIPLE seasons,
 * blended with a recency-decay weight so recent form matters more.
 *
 * WHY THIS EXISTS
 *   A single season at the start of the year has only 4-6 matches, which
 *   is not enough data to produce differentiated overall ratings. By merging
 *   2-3 historical seasons with recency decay we get:
 *     - More data volume → less noise
 *     - Recent form still drives the number (highest weight)
 *     - Veterans with strong histories score higher than unknowns
 *
 * RECENCY WEIGHTS (configurable via --decay)
 *   Season[0] (most recent) : 1.00
 *   Season[1]               : 0.80  (×decay^1)
 *   Season[2]               : 0.64  (×decay^2)
 *
 * HOW MERGE WORKS
 *   For each stat, the weighted average across seasons is computed:
 *     merged_stat = Σ(weight_i × stat_i × min_i) / Σ(weight_i × min_i)
 *   Minutes-played is used as a reliability denominator — a season with
 *   3 appearances doesn't poison a season with 30.
 *
 * USAGE
 *   # First run discover-seasons.ts to find season IDs
 *   npx ts-node src/scripts/discover-seasons.ts
 *
 *   # Then enrich with 3 most recent seasons (most recent first):
 *   npx ts-node src/scripts/enrich-multi-season.ts \
 *     --seasons=26763,PREV_SEASON_ID,OLDER_SEASON_ID
 *
 *   # Série B example:
 *   npx ts-node src/scripts/enrich-multi-season.ts \
 *     --seasons=27198,PREV_B_ID,OLDER_B_ID
 *
 *   # Dry run (no DB writes):
 *   npx ts-node src/scripts/enrich-multi-season.ts --seasons=26763,... --dry-run
 *
 *   # Custom decay factor (default 0.80):
 *   npx ts-node src/scripts/enrich-multi-season.ts --seasons=26763,... --decay=0.75
 *
 *   # Limit to N players (for testing):
 *   npx ts-node src/scripts/enrich-multi-season.ts --seasons=26763,... --batch=50
 *
 * Requires: SPORTMONKS_API_TOKEN in .env
 */

import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import pLimit from "p-limit";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { fetchPlayerStatsMultiSeason } from "../integrations/sportmonks/sportmonks.client";
import { normalizeStats, type RawStats } from "../integrations/sportmonks/pipeline/normalize-stats";
import { calculateOverall, MIN_MINUTES_RELIABLE, type LeagueContext } from "../analytics/overall.engine";

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

const DRY_RUN = args.includes("--dry-run");
const FORCE   = args.includes("--force");   // re-process even players already enriched

const seasonsArg = args.find((a) => a.startsWith("--seasons="))?.split("=")[1];
if (!seasonsArg) {
  console.error(
    "❌  --seasons=<id1,id2,...> é obrigatório.\n" +
    "   Exemplo: npx ts-node src/scripts/enrich-multi-season.ts --seasons=26763,PREV_ID\n\n" +
    "   Execute primeiro: npx ts-node src/scripts/discover-seasons.ts\n" +
    "   para descobrir os IDs de temporadas anteriores.",
  );
  process.exit(1);
}

const SEASON_IDS: number[] = seasonsArg
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => !isNaN(n) && n > 0);

if (SEASON_IDS.length === 0) {
  console.error("❌  Nenhum season ID válido em --seasons.");
  process.exit(1);
}

// Most recent season (first in list) is used as the "primary" season for team scoping
const PRIMARY_SEASON_ID = SEASON_IDS[0];

const decayArg = args.find((a) => a.startsWith("--decay="))?.split("=")[1];
const DECAY = decayArg ? Number(decayArg) : 0.80;

const batchArgIndex = args.indexOf("--batch");
const batchArg =
  args.find((a) => a.startsWith("--batch="))?.split("=")[1] ??
  (batchArgIndex !== -1 ? args[batchArgIndex + 1] : undefined);
const BATCH_SIZE = batchArg ? Number(batchArg) : 100;

const CONCURRENCY = 1;    // sequential — avoids 429 rate limit
const DELAY_MS    = 400;  // ms between requests

// ---------------------------------------------------------------------------
// League context — auto-detected from primary season ID
// ---------------------------------------------------------------------------
const SERIE_A_SEASON_IDS = new Set([26763, 25184, 23265]);
const SERIE_B_SEASON_IDS = new Set([27198, 25185, 23291]);

function detectLeagueContext(primarySeasonId: number): LeagueContext {
  if (SERIE_A_SEASON_IDS.has(primarySeasonId)) return "SERIE_A";
  if (SERIE_B_SEASON_IDS.has(primarySeasonId)) return "SERIE_B";
  return "DEFAULT";
}

const LEAGUE_CONTEXT: LeagueContext = detectLeagueContext(PRIMARY_SEASON_ID);

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Recency weights: season[0]=1.0, season[1]=decay^1, season[2]=decay^2, …
// ---------------------------------------------------------------------------
function getWeight(index: number): number {
  return Math.pow(DECAY, index);
}

// ---------------------------------------------------------------------------
// Weighted merge of RawStats across seasons
//
// Strategy: for each numeric field, compute a minutes-weighted average
// across seasons. Minutes is the best proxy for "how much data do we have."
//
// merged[field] = Σ(weight_i × value_i × min_i) / Σ(weight_i × min_i)
//
// If a season has 0 minutes, it's excluded from the denominator to avoid
// polluting the average with zero-data seasons.
// ---------------------------------------------------------------------------
function mergeStats(perSeason: Array<{ stats: RawStats; weight: number }>): RawStats {
  // Only include seasons where the player actually had minutes
  const active = perSeason.filter((s) => s.stats.minutesPlayed > 0);

  if (active.length === 0) {
    // No playable seasons — return a blank (all-zero) RawStats so hasStats=false downstream
    return zeroStats();
  }

  // Weighted denominator = Σ(weight_i × min_i)
  const totalWeightedMin = active.reduce((acc, s) => acc + s.weight * s.stats.minutesPlayed, 0);

  function weightedAvg(field: keyof RawStats): number {
    const num = active.reduce((acc, s) => {
      const val = s.stats[field] as number;
      return acc + s.weight * val * s.stats.minutesPlayed;
    }, 0);
    return totalWeightedMin > 0 ? num / totalWeightedMin : 0;
  }

  // For percentage fields (0–100), use simple weighted average without minute scaling
  function weightedAvgPct(field: keyof RawStats): number {
    const totalWeight = active.reduce((acc, s) => acc + s.weight, 0);
    const num = active.reduce((acc, s) => acc + s.weight * (s.stats[field] as number), 0);
    return totalWeight > 0 ? num / totalWeight : 0;
  }

  // Sum fields: goals, assists, appearances — use most-recent-only (no blending)
  // These should NOT be averaged since they accumulate over the whole career
  const recent = active[0].stats;

  return {
    // Counting totals — take from most recent season only (makes semantic sense)
    goals:                recent.goals,
    assists:              recent.assists,
    yellowCards:          recent.yellowCards,
    redCards:             recent.redCards,
    injuries:             recent.injuries,
    gamesMissed:          recent.gamesMissed,

    // Percentage / accuracy fields — weight by season weight (not minutes)
    passAccuracyPct:      weightedAvgPct("passAccuracyPct"),
    longPassAccuracy:     weightedAvgPct("longPassAccuracy"),
    crossAccuracy:        weightedAvgPct("crossAccuracy"),
    rating:               weightedAvgPct("rating"),

    // Volume stats — weighted by minutes across seasons
    passesTotal:          weightedAvg("passesTotal"),
    passesAccurate:       weightedAvg("passesAccurate"),
    keyPasses:            weightedAvg("keyPasses"),
    progressivePasses:    weightedAvg("progressivePasses"),
    longPasses:           weightedAvg("longPasses"),
    crosses:              weightedAvg("crosses"),
    shotsTotal:           weightedAvg("shotsTotal"),
    shotsOnTarget:        weightedAvg("shotsOnTarget"),
    shotsBlocked:         weightedAvg("shotsBlocked"),
    xG:                   weightedAvg("xG"),
    xA:                   weightedAvg("xA"),
    xGChain:              weightedAvg("xGChain"),
    xGBuildup:            weightedAvg("xGBuildup"),
    dribblesAttempted:    weightedAvg("dribblesAttempted"),
    dribblesSuccess:      weightedAvg("dribblesSuccess"),
    carries:              weightedAvg("carries"),
    progressiveCarries:   weightedAvg("progressiveCarries"),
    tackles:              weightedAvg("tackles"),
    tacklesWon:           weightedAvg("tacklesWon"),
    interceptions:        weightedAvg("interceptions"),
    clearances:           weightedAvg("clearances"),
    blocks:               weightedAvg("blocks"),
    pressures:            weightedAvg("pressures"),
    pressuresSuccess:     weightedAvg("pressuresSuccess"),
    recoveries:           weightedAvg("recoveries"),
    duelsTotal:           weightedAvg("duelsTotal"),
    duelsWon:             weightedAvg("duelsWon"),
    aerialDuelsTotal:     weightedAvg("aerialDuelsTotal"),
    aerialDuelsWon:       weightedAvg("aerialDuelsWon"),
    groundDuelsWon:       weightedAvg("groundDuelsWon"),
    distanceCovered:      weightedAvg("distanceCovered"),
    sprints:              weightedAvg("sprints"),
    sprintsHighIntensity: weightedAvg("sprintsHighIntensity"),
    foulsCommitted:       weightedAvg("foulsCommitted"),
    foulsDrawn:           weightedAvg("foulsDrawn"),

    // Minutes / appearances: sum across seasons (player actually played all those minutes)
    minutesPlayed: active.reduce((acc, s) => acc + s.stats.minutesPlayed, 0),
    appearances:   active.reduce((acc, s) => acc + s.stats.appearances, 0),
  };
}

function zeroStats(): RawStats {
  const keys: Array<keyof RawStats> = [
    "goals","assists","passesTotal","passesAccurate","passAccuracyPct","keyPasses",
    "progressivePasses","longPasses","longPassAccuracy","crosses","crossAccuracy",
    "shotsTotal","shotsOnTarget","shotsBlocked","xG","xA","xGChain","xGBuildup",
    "dribblesAttempted","dribblesSuccess","carries","progressiveCarries","tackles",
    "tacklesWon","interceptions","clearances","blocks","pressures","pressuresSuccess",
    "recoveries","duelsTotal","duelsWon","aerialDuelsTotal","aerialDuelsWon",
    "groundDuelsWon","minutesPlayed","appearances","distanceCovered","sprints",
    "sprintsHighIntensity","rating","yellowCards","redCards","foulsCommitted",
    "foulsDrawn","injuries","gamesMissed",
  ];
  return Object.fromEntries(keys.map((k) => [k, 0])) as unknown as RawStats;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface EnrichResult {
  total:      number;
  enriched:   number;
  noStats:    number;
  skipped:    number;
  errors:     number;
  durationMs: number;
}

async function main(): Promise<void> {
  const startedAt = Date.now();

  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║     ENRIQUECIMENTO MULTI-TEMPORADA (recency blend)   ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log(`  Seasons   : ${SEASON_IDS.join(" → ")}`);
  console.log(`  Pesos     : ${SEASON_IDS.map((_, i) => getWeight(i).toFixed(2)).join(", ")} (decay=${DECAY})`);
  console.log(`  Batch     : ${BATCH_SIZE}  |  Concurrency: ${CONCURRENCY}`);
  console.log(`  Dry run   : ${DRY_RUN}  |  Force: ${FORCE}`);
  console.log("");

  const result: EnrichResult = {
    total: 0, enriched: 0, noStats: 0, skipped: 0, errors: 0, durationMs: 0,
  };

  // Scope to players who belong to teams in the primary (most recent) season
  const where = FORCE
    ? {
        source: "sportmonks",
        externalId: { not: null },
        dbTeam: {
          seasons: { some: { externalId: PRIMARY_SEASON_ID } },
        },
      }
    : {
        source: "sportmonks",
        externalId: { not: null },
        dbTeam: {
          seasons: { some: { externalId: PRIMARY_SEASON_ID } },
        },
        statsSnapshots: {
          none: { minutes: { gt: 0 } },
        },
      };

  const total = await prisma.player.count({ where });
  console.log(`  Jogadores elegíveis: ${total}`);
  console.log(`  League context     : ${LEAGUE_CONTEXT}`);

  if (total === 0) {
    console.log("  Nada a enriquecer.\n");
    await prisma.$disconnect();
    return;
  }

  result.total = total;
  const limit = pLimit(CONCURRENCY);
  let offset = 0;
  let page   = 1;

  while (offset < total) {
    const players = await prisma.player.findMany({
      where,
      select: {
        id:         true,
        externalId: true,
        positions:  true,
        name:       true,
        age:        true,
      },
      skip: offset,
      take: BATCH_SIZE,
    });

    if (players.length === 0) break;

    console.log(`\n  Página ${page} — ${players.length} jogadores…`);

    await Promise.all(
      players.map((player) =>
        limit(async () => {
          if (!player.externalId || DRY_RUN) {
            result.skipped++;
            return;
          }

          try {
            // 1. Fetch all seasons in ONE API call
            const raw = await fetchPlayerStatsMultiSeason(
              Number(player.externalId),
              SEASON_IDS,
            );

            // 2. Parse per-season stats
            // Response: { statistics: [{ season_id, details: [...] }, ...] }
            const statisticsGroups: any[] = (raw as any).statistics ?? [];

            // Map season_id → normalized stats
            const perSeason: Array<{ stats: RawStats; weight: number }> = [];

            for (let i = 0; i < SEASON_IDS.length; i++) {
              const seasonId = SEASON_IDS[i];
              const group = statisticsGroups.find((g: any) => g.season_id === seasonId);
              const details: any[] = group?.details ?? [];
              const stats = normalizeStats(details);
              perSeason.push({ stats, weight: getWeight(i) });
            }

            // 3. Merge stats across seasons
            const merged = mergeStats(perSeason);

            const hasStats =
              merged.minutesPlayed > 0 ||
              merged.goals         > 0 ||
              merged.assists       > 0 ||
              merged.tackles       > 0 ||
              merged.passesTotal   > 0;

            if (!hasStats) {
              result.noStats++;
              await prisma.player.update({
                where: { id: player.id },
                data: {
                  overall:              null,
                  potential:            null,
                  overallPace:          null,
                  overallShooting:      null,
                  overallPassing:       null,
                  overallDribbling:     null,
                  overallDefending:     null,
                  overallPhysical:      null,
                  overallGkDiving:      null,
                  overallGkHandling:    null,
                  overallGkKicking:     null,
                  overallGkReflex:      null,
                  overallGkPositioning: null,
                  overallCalculatedAt:  new Date(),
                  dnaScore:             Prisma.JsonNull,
                  dnaCalculatedAt:      new Date(),
                },
              });
              return;
            }

            // 4. Calculate overall from merged stats (with age + league context)
            const primaryPosition = player.positions[0] ?? null;
            const overallResult   = calculateOverall(merged, primaryPosition, player.age, LEAGUE_CONTEXT);

            // 5. Upsert PlayerStats snapshot (using merged values)
            await prisma.playerStats.create({
              data: {
                playerId:           player.id,
                source:             "sportmonks_multiseason",
                goals:              merged.goals             > 0 ? merged.goals             : null,
                assists:            merged.assists           > 0 ? merged.assists           : null,
                shots:              merged.shotsTotal        > 0 ? Math.round(merged.shotsTotal)       : null,
                shotsOnTarget:      merged.shotsOnTarget     > 0 ? Math.round(merged.shotsOnTarget)    : null,
                xG:                 merged.xG                > 0 ? merged.xG                : null,
                xA:                 merged.xA                > 0 ? merged.xA                : null,
                xGChain:            merged.xGChain           > 0 ? merged.xGChain           : null,
                xGBuildup:          merged.xGBuildup         > 0 ? merged.xGBuildup         : null,
                passes:             merged.passesTotal       > 0 ? Math.round(merged.passesTotal)      : null,
                passAccuracy:       merged.passAccuracyPct   > 0 ? merged.passAccuracyPct   : null,
                keyPasses:          merged.keyPasses         > 0 ? Math.round(merged.keyPasses)        : null,
                progressivePasses:  merged.progressivePasses > 0 ? Math.round(merged.progressivePasses): null,
                longPasses:         merged.longPasses        > 0 ? Math.round(merged.longPasses)       : null,
                longPassAccuracy:   merged.longPassAccuracy  > 0 ? merged.longPassAccuracy  : null,
                crosses:            merged.crosses           > 0 ? Math.round(merged.crosses)          : null,
                crossAccuracy:      merged.crossAccuracy     > 0 ? merged.crossAccuracy     : null,
                dribblesAttempted:  merged.dribblesAttempted > 0 ? Math.round(merged.dribblesAttempted): null,
                dribblesSuccess:    merged.dribblesSuccess   > 0 ? Math.round(merged.dribblesSuccess)  : null,
                carries:            merged.carries           > 0 ? Math.round(merged.carries)          : null,
                progressiveCarries: merged.progressiveCarries> 0 ? Math.round(merged.progressiveCarries):null,
                tackles:            merged.tackles           > 0 ? Math.round(merged.tackles)          : null,
                tacklesWon:         merged.tacklesWon        > 0 ? Math.round(merged.tacklesWon)       : null,
                interceptions:      merged.interceptions     > 0 ? Math.round(merged.interceptions)    : null,
                clearances:         merged.clearances        > 0 ? Math.round(merged.clearances)       : null,
                blocks:             merged.blocks            > 0 ? Math.round(merged.blocks)           : null,
                pressures:          merged.pressures         > 0 ? Math.round(merged.pressures)        : null,
                pressuresSuccess:   merged.pressuresSuccess  > 0 ? Math.round(merged.pressuresSuccess) : null,
                recoveries:         merged.recoveries        > 0 ? Math.round(merged.recoveries)       : null,
                duelsTotal:         merged.duelsTotal        > 0 ? Math.round(merged.duelsTotal)       : null,
                duelsWon:           merged.duelsWon          > 0 ? Math.round(merged.duelsWon)         : null,
                aerialDuelsTotal:   merged.aerialDuelsTotal  > 0 ? Math.round(merged.aerialDuelsTotal) : null,
                aerialDuelsWon:     merged.aerialDuelsWon    > 0 ? Math.round(merged.aerialDuelsWon)   : null,
                groundDuelsWon:     merged.groundDuelsWon    > 0 ? Math.round(merged.groundDuelsWon)   : null,
                yellowCards:        merged.yellowCards       > 0 ? merged.yellowCards       : null,
                redCards:           merged.redCards          > 0 ? merged.redCards          : null,
                foulsCommitted:     merged.foulsCommitted    > 0 ? Math.round(merged.foulsCommitted)   : null,
                foulsDrawn:         merged.foulsDrawn        > 0 ? Math.round(merged.foulsDrawn)       : null,
                distanceCovered:    merged.distanceCovered   > 0 ? merged.distanceCovered   : null,
                sprints:            merged.sprints           > 0 ? Math.round(merged.sprints)          : null,
                rating:             merged.rating            > 0 ? merged.rating            : null,
                minutes:            merged.minutesPlayed     > 0 ? Math.round(merged.minutesPlayed)    : null,
                appearances:        merged.appearances       > 0 ? Math.round(merged.appearances)      : null,
              },
            });

            // 6. Update player with overall + breakdown + DNA + potential
            await prisma.player.update({
              where: { id: player.id },
              data: {
                overall:              overallResult.overall,
                potential:            overallResult.potential,
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
                dnaScore:             overallResult.dna as unknown as Prisma.InputJsonValue,
                dnaCalculatedAt:      new Date(),
              },
            });

            result.enriched++;
            await sleep(DELAY_MS);

            if (result.enriched % 20 === 0) {
              console.log(`    … ${result.enriched} enriquecidos`);
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
  console.log("  ENRIQUECIMENTO MULTI-TEMPORADA — RESULTADO FINAL");
  console.log(sep);
  console.log(`  Seasons usadas      : ${SEASON_IDS.join(", ")}`);
  console.log(`  Decay               : ${DECAY}`);
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
