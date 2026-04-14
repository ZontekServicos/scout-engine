/**
 * recalculate-market-value.ts
 *
 * Recalcula o marketValue de todos os jogadores com overall != null.
 *
 * Algoritmo:
 *   1. Busca jogadores com overall IS NOT NULL em batches de BATCH_SIZE.
 *   2. Para cada jogador, recalcula potential (se nulo) e marketValue usando
 *      calculateMarketValue do soccermind-overall.engine.
 *   3. Salva o novo marketValue no banco.
 *
 * Flags:
 *   --dry-run         Calcula mas não grava no banco.
 *   --force           Sobrescreve marketValue mesmo quando já existe.
 *   --batch=N         Tamanho do lote (default: 500).
 *
 * Usage:
 *   npx ts-node src/scripts/recalculate-market-value.ts
 *   npx ts-node src/scripts/recalculate-market-value.ts --dry-run
 *   npx ts-node src/scripts/recalculate-market-value.ts --force --batch=1000
 */

import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import { prisma } from "../lib/prisma";
import {
  calculateMarketValue,
  calculatePotential,
  resolvePositionGroup,
} from "../analytics/soccermind-overall.engine";

// ─────────────────────────────────────────────────────────────────────────────
// CLI args
// ─────────────────────────────────────────────────────────────────────────────

const args        = process.argv.slice(2);
const DRY_RUN     = args.includes("--dry-run");
const FORCE       = args.includes("--force");
const batchArg    = args.find((a) => a.startsWith("--batch="))?.split("=")[1];
const BATCH_SIZE  = batchArg ? Math.max(1, Number(batchArg)) : 500;

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const sep = "═".repeat(58);

  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║         SOCCERMIND — RECALCULAR MARKET VALUE             ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log(`  Dry run  : ${DRY_RUN}`);
  console.log(`  Force    : ${FORCE}  (sobrescreve marketValue existente)`);
  console.log(`  Batch    : ${BATCH_SIZE}`);
  console.log("");

  // ── Contagem total ──────────────────────────────────────────────────────────
  const total = await prisma.player.count({
    where: { overall: { not: null } },
  });
  console.log(`  Jogadores elegíveis (overall != null): ${total}\n`);

  if (total === 0) {
    console.log("  Nenhum jogador encontrado. Encerrando.\n");
    await prisma.$disconnect();
    return;
  }

  // ── Contadores ──────────────────────────────────────────────────────────────
  let processed = 0;
  let updated   = 0;
  let skipped   = 0;  // já tem valor e --force não foi passado
  let errors    = 0;
  let offset    = 0;

  // ── Loop de batches ─────────────────────────────────────────────────────────
  while (offset < total) {
    const players = await prisma.player.findMany({
      where:   { overall: { not: null } },
      select: {
        id:          true,
        overall:     true,
        potential:   true,
        age:         true,
        positions:   true,
        league:      true,
        marketValue: true,
      },
      orderBy: { id: "asc" },
      skip:    offset,
      take:    BATCH_SIZE,
    });

    if (players.length === 0) break;

    for (const player of players) {
      try {
        // overall nunca é null aqui (WHERE garante), mas TS precisa de narrowing
        const overall = player.overall!;

        // Pular se já tem valor e --force não foi passado
        if (!FORCE && player.marketValue !== null) {
          skipped++;
          processed++;
          continue;
        }

        const positionGroup = resolvePositionGroup(player.positions);

        // Usa o potential existente; recalcula apenas quando ausente
        const potential =
          player.potential ??
          calculatePotential(overall, player.age);

        const marketValue = calculateMarketValue({
          overall,
          potential,
          age:           player.age ?? 25,
          positionGroup,
          league:        player.league,
        });

        if (!DRY_RUN) {
          await prisma.player.update({
            where: { id: player.id },
            data:  { marketValue },
          });
        }

        updated++;
      } catch (err) {
        errors++;
        if (errors <= 10) {
          console.error(`  ✗ player ${player.id}: ${(err as Error).message}`);
        }
      }

      processed++;
    }

    offset += players.length;

    // Log de progresso a cada batch concluído
    const pct = Math.min(100, Math.round((processed / total) * 100));
    process.stdout.write(
      `\r  Progresso: ${processed}/${total} (${pct}%)  atualizados=${updated}  pulados=${skipped}  erros=${errors}   `,
    );
  }

  // ── Relatório final ─────────────────────────────────────────────────────────
  console.log("\n");
  console.log(sep);
  console.log("  MARKET VALUE — RESULTADO");
  console.log(sep);
  console.log(`  Processados  : ${processed}`);
  console.log(`  Atualizados  : ${updated}`);
  console.log(`  Pulados      : ${skipped}  (já possuem valor; use --force para sobrescrever)`);
  console.log(`  Erros        : ${errors}`);

  if (DRY_RUN) {
    console.log("\n  ⚠  DRY RUN — nenhuma escrita realizada.");
  }

  // ── Distribuição de market value (apenas quando escreveu) ─────────────────
  if (!DRY_RUN && updated > 0) {
    const mvStats = await prisma.$queryRawUnsafe<
      { faixa: string; players: number; avg_m_eur: string; max_m_eur: string }[]
    >(`
      SELECT
        CASE
          WHEN overall >= 80 THEN '80+  ELITE'
          WHEN overall >= 70 THEN '70–79 BOM'
          WHEN overall >= 60 THEN '60–69 MÉDIO'
          ELSE                    '<60  REGULAR'
        END as faixa,
        COUNT(*)::int                                    as players,
        ROUND((AVG("marketValue") / 1000000.0)::numeric, 1)::text  as avg_m_eur,
        ROUND((MAX("marketValue") / 1000000.0)::numeric, 1)::text  as max_m_eur
      FROM "Player"
      WHERE overall IS NOT NULL AND "marketValue" IS NOT NULL AND overall > 0
      GROUP BY 1
      ORDER BY MAX(overall) DESC
    `);

    console.log("\n  MARKET VALUE por faixa de overall:");
    console.log("  " + "-".repeat(55));
    console.log(
      "  " +
        "Faixa".padEnd(16) +
        "Players".padEnd(10) +
        "Avg (M€)".padEnd(12) +
        "Max (M€)",
    );
    for (const r of mvStats) {
      console.log(
        `  ${String(r.faixa).padEnd(15)} ${String(r.players).padStart(6)}    ` +
          `€${String(r.avg_m_eur).padStart(6)}M      €${r.max_m_eur}M`,
      );
    }
    console.log("  " + "-".repeat(55));
  }

  console.log(sep + "\n");

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("\n❌ Erro fatal:", err.message);
  await prisma.$disconnect();
  process.exit(1);
});
