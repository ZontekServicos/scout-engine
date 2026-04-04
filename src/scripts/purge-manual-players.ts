/**
 * purge-manual-players.ts
 *
 * Safely removes players imported from CSV/dataset files (source = "manual")
 * so the database contains only structured Sportmonks data.
 *
 * CASCADE DELETE order (avoids FK violations):
 *   AnalysisComparison → PlayerMetrics → PlayerFinancials
 *   → PlayerRiskSnapshot → PlayerStats → MatchEvent (playerId set null)
 *   → Player
 *
 * This script NEVER touches players with source = "sportmonks".
 *
 * Usage:
 *   npx ts-node src/scripts/purge-manual-players.ts --dry-run   ← count only
 *   npx ts-node src/scripts/purge-manual-players.ts             ← DELETE for real
 *   npx ts-node src/scripts/purge-manual-players.ts --source fc26   ← custom source
 */

import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import { prisma } from "../lib/prisma";

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");

const sourceArg = args.find((a) => a.startsWith("--source="))?.split("=")[1]
  ?? args[args.indexOf("--source") + 1];

// Which sources to purge — never purge "sportmonks"
const PURGE_SOURCES = sourceArg
  ? [sourceArg].filter((s) => s !== "sportmonks")
  : ["manual", "fc26", "csv", "dataset"];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║          PURGE DE JOGADORES MANUAIS / DATASET       ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log(`  Fontes a purgar: ${PURGE_SOURCES.join(", ")}`);
  console.log(`  Dry run: ${DRY_RUN}\n`);

  // Count by source before purge
  const countsBefore = await prisma.player.groupBy({
    by: ["source"],
    _count: { id: true },
    where: { source: { in: PURGE_SOURCES } },
  });

  if (countsBefore.length === 0) {
    console.log("  ✅ Nenhum jogador manual encontrado. Nada a fazer.");
    await prisma.$disconnect();
    return;
  }

  console.log("  Contagem por fonte:");
  let totalToDelete = 0;
  for (const row of countsBefore) {
    console.log(`    ${row.source.padEnd(12)} : ${row._count.id} jogadores`);
    totalToDelete += row._count.id;
  }
  console.log(`\n  Total a remover: ${totalToDelete}`);

  if (DRY_RUN) {
    console.log("\n  ⚠  DRY RUN — nenhuma remoção executada.");
    await prisma.$disconnect();
    return;
  }

  // Confirm — in non-interactive environments just proceed
  console.log("\n  Iniciando remoção em cascata…");

  // Fetch IDs of players to delete
  const players = await prisma.player.findMany({
    where: { source: { in: PURGE_SOURCES } },
    select: { id: true },
  });
  const ids = players.map((p) => p.id);

  if (ids.length === 0) {
    console.log("  Nenhum jogador a remover.");
    await prisma.$disconnect();
    return;
  }

  // 1. AnalysisComparison (references playerId)
  const delComparisons = await prisma.analysisComparison.deleteMany({
    where: { playerId: { in: ids } },
  });
  console.log(`  ✓ AnalysisComparison removidos : ${delComparisons.count}`);

  // 2. PlayerMetrics
  const delMetrics = await prisma.playerMetrics.deleteMany({
    where: { playerId: { in: ids } },
  });
  console.log(`  ✓ PlayerMetrics removidos      : ${delMetrics.count}`);

  // 3. PlayerFinancials
  const delFinancials = await prisma.playerFinancials.deleteMany({
    where: { playerId: { in: ids } },
  });
  console.log(`  ✓ PlayerFinancials removidos   : ${delFinancials.count}`);

  // 4. PlayerRiskSnapshot
  const delRisk = await prisma.playerRiskSnapshot.deleteMany({
    where: { playerId: { in: ids } },
  });
  console.log(`  ✓ PlayerRiskSnapshot removidos : ${delRisk.count}`);

  // 5. PlayerStats
  const delStats = await prisma.playerStats.deleteMany({
    where: { playerId: { in: ids } },
  });
  console.log(`  ✓ PlayerStats removidos        : ${delStats.count}`);

  // 6. MatchEvent — set playerId = null (FK is ON DELETE SET NULL in schema)
  //    Prisma doesn't expose updateMany for this directly when using set null,
  //    but we can do it via raw query for safety.
  await prisma.$executeRawUnsafe(
    `UPDATE "MatchEvent" SET "playerId" = NULL WHERE "playerId" = ANY($1::text[])`,
    ids,
  );
  console.log(`  ✓ MatchEvent.playerId nullificados para ${ids.length} jogadores`);

  // 7. Player
  const delPlayers = await prisma.player.deleteMany({
    where: { id: { in: ids } },
  });
  console.log(`  ✓ Players removidos            : ${delPlayers.count}`);

  // Final count
  const remaining = await prisma.player.count();
  const sportmonks = await prisma.player.count({ where: { source: "sportmonks" } });

  const sep = "═".repeat(58);
  console.log("\n" + sep);
  console.log("  PURGE CONCLUÍDO");
  console.log(sep);
  console.log(`  Jogadores removidos     : ${delPlayers.count}`);
  console.log(`  Jogadores restantes     : ${remaining}`);
  console.log(`    → Sportmonks          : ${sportmonks}`);
  console.log(`    → Outras fontes       : ${remaining - sportmonks}`);
  console.log(sep + "\n");

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("❌ Erro fatal:", (err as Error).message);
  await prisma.$disconnect();
  process.exit(1);
});
