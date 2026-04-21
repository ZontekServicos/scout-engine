/**
 * fix-season-year.ts
 *
 * Backfill script: corrects NULL seasonYear in PlayerSeason rows.
 *
 * WHAT IT DOES (two phases)
 * ─────────────────────────────────────────────────────────────────────────────
 *   Phase 1 — Fix Season.year
 *     Updates Season rows where year IS NULL by deriving from the name field
 *     (e.g. "2025/2026" → 2025).
 *
 *   Phase 2 — Fix PlayerSeason.seasonYear
 *     For every PlayerSeason where seasonYear IS NULL:
 *       1. Look up the linked Season row (via seasonId)
 *       2. Use Season.year (now filled by Phase 1) or derive from Season.name
 *       3. Update PlayerSeason.seasonYear
 *     Skips rows whose Season cannot be resolved.
 *
 * USAGE
 *   npx ts-node src/scripts/fix-season-year.ts
 *   npx ts-node src/scripts/fix-season-year.ts --dry-run
 */

import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import { prisma } from "../lib/prisma";

// ─── CLI ─────────────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes("--dry-run");

// ─── Helpers ─────────────────────────────────────────────────────────────────

function deriveYearFromLabel(label: string | null | undefined): number | null {
  if (!label) return null;
  const match = label.match(/(\d{4})/);
  return match ? Number(match[1]) : null;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const startedAt = Date.now();

  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║        FIX — PlayerSeason.seasonYear NULL            ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  if (DRY_RUN) console.log("  ⚠  DRY RUN — nenhuma escrita no banco.\n");

  // ── Phase 1: fix Season.year ──────────────────────────────────────────────

  const seasonsWithNullYear = await prisma.season.findMany({
    where: { year: null },
    select: { id: true, name: true },
  });

  console.log(`  Seasons com year NULL : ${seasonsWithNullYear.length}`);

  let seasonFixed = 0;
  let seasonSkipped = 0;

  for (const season of seasonsWithNullYear) {
    const derived = deriveYearFromLabel(season.name);
    if (derived === null) {
      seasonSkipped++;
      continue;
    }

    if (!DRY_RUN) {
      await prisma.season.update({
        where: { id: season.id },
        data:  { year: derived },
      });
    }
    seasonFixed++;
  }

  console.log(`  Season.year corrigidos : ${seasonFixed}`);
  console.log(`  Season.year não deriváveis: ${seasonSkipped}`);

  // ── Phase 2: fix PlayerSeason.seasonYear ─────────────────────────────────

  // Count before
  const nullBefore = await prisma.playerSeason.count({ where: { seasonYear: null } });
  console.log(`\n  PlayerSeason com seasonYear NULL (antes) : ${nullBefore}`);

  if (nullBefore === 0) {
    console.log("  Nada a corrigir.\n");
    await prisma.$disconnect();
    return;
  }

  // Load all season metadata (id → year/name) for fast lookup
  const allSeasons = await prisma.season.findMany({
    select: { id: true, name: true, year: true },
  });
  const seasonMap = new Map(allSeasons.map((s) => [s.id, s]));

  // Process in batches to avoid loading all rows at once
  // Collect all IDs upfront to avoid pagination drift (rows leave the NULL set as they're updated)
  const allNullIds = await prisma.playerSeason.findMany({
    where:  { seasonYear: null },
    select: { id: true, seasonId: true, seasonLabel: true },
  });

  const BATCH  = 500;
  let updated  = 0;
  let skipped  = 0;
  let noYear   = 0;
  let processed = 0;

  for (let i = 0; i < allNullIds.length; i += BATCH) {
    const batch = allNullIds.slice(i, i + BATCH);

    for (const row of batch) {
      processed++;
      const season = seasonMap.get(row.seasonId);
      const year   = season?.year ?? deriveYearFromLabel(season?.name ?? row.seasonLabel);

      if (year === null) {
        noYear++;
        continue;
      }

      if (!DRY_RUN) {
        await prisma.playerSeason.update({
          where: { id: row.id },
          data:  { seasonYear: year },
        });
      }
      updated++;
    }

    process.stdout.write(
      `\r  Processados: ${processed}/${allNullIds.length} — atualizados: ${updated} — sem ano: ${noYear}`,
    );
  }

  console.log(); // newline after progress

  // ── Validation ────────────────────────────────────────────────────────────

  const nullAfter = DRY_RUN
    ? nullBefore
    : await prisma.playerSeason.count({ where: { seasonYear: null } });

  const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
  const sep     = "═".repeat(58);

  console.log("\n" + sep);
  console.log("  FIX — RESULTADO FINAL");
  console.log(sep);
  if (DRY_RUN) console.log("  ⚠  DRY RUN — nenhuma escrita no banco.");
  console.log(`  Season.year corrigidos         : ${seasonFixed}`);
  console.log(`  PlayerSeason atualizados       : ${updated}`);
  console.log(`  Pulados (sem seasonId)         : ${skipped}`);
  console.log(`  Sem ano derivável              : ${noYear}`);
  console.log(`  seasonYear NULL antes          : ${nullBefore}`);
  console.log(`  seasonYear NULL depois         : ${nullAfter}`);
  console.log(`  Duração                        : ${elapsed}s`);

  if (!DRY_RUN && nullAfter > 0) {
    console.log(`\n  ⚠  Ainda restam ${nullAfter} rows com seasonYear NULL.`);
    console.log("     Verifique as temporadas sem nome reconhecível.");
  } else if (!DRY_RUN) {
    console.log("\n  ✓  Todos os seasonYear foram preenchidos.");
  }

  console.log(sep + "\n");

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("❌  Erro fatal:", (err as Error).message);
  await prisma.$disconnect();
  process.exit(1);
});
