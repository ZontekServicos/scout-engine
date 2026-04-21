/**
 * recalculate-overall-sportmonks.ts
 *
 * Recalculates overall for Sportmonks players whose PlayerStats lack advanced
 * fields (xG, carries, progressive passes, distanceCovered, sprints).
 *
 * Uses the position-sensitive fallback model in overall.engine.ts.
 * Players with advanced stats are skipped — their full-model calculation is correct.
 *
 * WHAT IS UPDATED
 *   • Player.overall + breakdown fields + potential + overallCalculatedAt
 *   • PlayerSeason.overall for the most recent season
 *
 * USAGE
 *   npx ts-node src/scripts/recalculate-overall-sportmonks.ts
 *   npx ts-node src/scripts/recalculate-overall-sportmonks.ts --dry-run
 *   npx ts-node src/scripts/recalculate-overall-sportmonks.ts --batch=100
 *   npx ts-node src/scripts/recalculate-overall-sportmonks.ts --sample=50   ← validate first
 *
 * DEBUG OUTPUT (per-player detail)
 *   OVERALL_DEBUG=1 npx ts-node src/scripts/recalculate-overall-sportmonks.ts --sample=20
 */

import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import { prisma }                               from "../lib/prisma";
import { calculateOverall, hasAdvancedStats }   from "../analytics/overall.engine";
import type { StatsInput }                      from "../analytics/overall.engine";
import { resolveLeagueContext }                 from "../analytics/overall-v2.engine";

// ─── CLI ─────────────────────────────────────────────────────────────────────

const args      = process.argv.slice(2);
const DRY_RUN   = args.includes("--dry-run");
const batchArg  = args.find((a) => a.startsWith("--batch="))?.split("=")[1];
const sampleArg = args.find((a) => a.startsWith("--sample="))?.split("=")[1];
const BATCH     = batchArg  ? Number(batchArg)  : 200;
const SAMPLE    = sampleArg ? Number(sampleArg) : null;  // null = process all

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const startedAt = Date.now();

  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║   RECALCULO OVERALL — Sportmonks (fallback model)   ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  if (DRY_RUN)   console.log("  ⚠  DRY RUN   — sem escrita no banco.");
  if (SAMPLE)    console.log(`  🔍 SAMPLE    — processando apenas ${SAMPLE} jogadores (dry-run implícito).`);
  console.log();

  const totalCandidates = await prisma.player.count({
    where: { source: "sportmonks", statsSnapshots: { some: {} } },
  });

  const limit = SAMPLE ?? totalCandidates;
  console.log(`  Jogadores Sportmonks com PlayerStats : ${totalCandidates}`);
  if (SAMPLE) console.log(`  Limite da amostra                    : ${SAMPLE}`);
  console.log();

  let processed   = 0;
  let fallbackCnt = 0;
  let fullCnt     = 0;
  let updated     = 0;
  let noStats     = 0;
  let offset      = 0;

  while (offset < limit) {
    const batchSize = SAMPLE ? Math.min(BATCH, SAMPLE - offset) : BATCH;

    const players = await prisma.player.findMany({
      where: { source: "sportmonks", statsSnapshots: { some: {} } },
      select: {
        id:        true,
        name:      true,
        positions: true,
        age:       true,
        league:    true,
        statsSnapshots: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            goals:              true,
            assists:            true,
            shots:              true,
            shotsOnTarget:      true,
            xG:                 true,
            xA:                 true,
            xGChain:            true,
            xGBuildup:          true,
            passes:             true,
            passAccuracy:       true,
            keyPasses:          true,
            progressivePasses:  true,
            longPasses:         true,
            longPassAccuracy:   true,
            crosses:            true,
            crossAccuracy:      true,
            dribblesAttempted:  true,
            dribblesSuccess:    true,
            carries:            true,
            progressiveCarries: true,
            tackles:            true,
            tacklesWon:         true,
            interceptions:      true,
            clearances:         true,
            blocks:             true,
            pressures:          true,
            pressuresSuccess:   true,
            recoveries:         true,
            duelsTotal:         true,
            duelsWon:           true,
            aerialDuelsTotal:   true,
            aerialDuelsWon:     true,
            groundDuelsWon:     true,
            yellowCards:        true,
            redCards:           true,
            foulsCommitted:     true,
            foulsDrawn:         true,
            saves:              true,
            savePct:            true,
            cleanSheets:        true,
            goalsConceded:      true,
            distanceCovered:    true,
            sprints:            true,
            rating:             true,
            minutes:            true,
            appearances:        true,
          },
        },
        playerSeasons: {
          orderBy: [{ seasonYear: "desc" }, { createdAt: "desc" }],
          take: 1,
          select: { id: true },
        },
      },
      orderBy: { id: "asc" },
      skip: offset,
      take: batchSize,
    });

    if (players.length === 0) break;

    for (const player of players) {
      if (processed >= limit) break;
      processed++;

      const rawStats = player.statsSnapshots[0];
      if (!rawStats) { noStats++; continue; }

      const stats: StatsInput = rawStats;

      // Skip players who already have advanced stats — full model is correct
      if (hasAdvancedStats(stats)) {
        fullCnt++;
        continue;
      }

      fallbackCnt++;

      const leagueCtx = resolveLeagueContext(player.league);
      const result    = calculateOverall(
        stats,
        player.positions[0] ?? null,
        player.age,
        leagueCtx,
        player.id,
      );

      // Sample mode: always log per-player detail (no DB writes)
      if (SAMPLE) {
        console.log(
          `  ${String(processed).padStart(4)}  ${(player.name ?? "?").padEnd(28).slice(0, 28)}` +
          `  pos=${String(player.positions[0] ?? "?").padEnd(12)}` +
          `  rating=${String(stats.rating?.toFixed(2) ?? "-").padEnd(5)}` +
          `  min=${String(stats.minutes ?? 0).padEnd(5)}` +
          `  → overall=${result.overall}`,
        );
        continue;
      }

      if (!DRY_RUN) {
        // Update Player
        await prisma.player.update({
          where: { id: player.id },
          data: {
            overall:              result.overall,
            potential:            result.potential,
            overallPace:          result.breakdown.pace,
            overallShooting:      result.breakdown.shooting,
            overallPassing:       result.breakdown.passing,
            overallDribbling:     result.breakdown.dribbling,
            overallDefending:     result.breakdown.defending,
            overallPhysical:      result.breakdown.physical,
            overallCalculatedAt:  new Date(),
          },
        });

        // Update most recent PlayerSeason
        const latestSeason = player.playerSeasons[0];
        if (latestSeason) {
          await prisma.playerSeason.update({
            where: { id: latestSeason.id },
            data:  { overall: result.overall, potential: result.potential },
          });
        }
      }

      updated++;
    }

    offset += batchSize;

    if (!SAMPLE) {
      process.stdout.write(
        `\r  Processados: ${processed}/${limit}` +
        ` — fallback: ${fallbackCnt} — full: ${fullCnt} — atualizados: ${updated}`,
      );
    }
  }

  console.log("\n");

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  const sep     = "═".repeat(58);

  console.log(sep);
  console.log("  RESULTADO FINAL");
  console.log(sep);
  if (SAMPLE)  console.log("  🔍 SAMPLE — nenhuma escrita realizada.");
  if (DRY_RUN) console.log("  ⚠  DRY RUN — sem escrita no banco.");
  console.log(`  Processados                  : ${processed}`);
  console.log(`  Fallback (sem stats avançadas): ${fallbackCnt}`);
  console.log(`  Full model (pulados)          : ${fullCnt}`);
  console.log(`  Sem PlayerStats               : ${noStats}`);
  console.log(`  Atualizados no banco          : ${updated}`);
  console.log(`  Duração                       : ${elapsed}s`);

  if (!DRY_RUN) {
    const newAvg = await prisma.$queryRawUnsafe<{ avg: string }[]>(`
      SELECT ROUND(AVG(overall::numeric), 1) as avg
      FROM "Player"
      WHERE source = 'sportmonks' AND overall IS NOT NULL
    `);
    const newMax = await prisma.$queryRawUnsafe<{ max: number }[]>(`
      SELECT MAX(overall) as max FROM "Player" WHERE source = 'sportmonks'
    `);
    console.log(`  Overall médio pós-recálculo  : ${newAvg[0]?.avg ?? "?"}`);
    console.log(`  Overall máximo pós-recálculo : ${newMax[0]?.max ?? "?"}`);
  }

  console.log(sep + "\n");

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("❌  Erro fatal:", (err as Error).message);
  await prisma.$disconnect();
  process.exit(1);
});
