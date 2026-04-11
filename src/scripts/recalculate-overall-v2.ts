/**
 * recalculate-overall-v2.ts
 *
 * Recalcula o overall de todos os jogadores usando os dados já existentes no banco
 * (Player + PlayerStats) — sem chamar a API do Sportmonks.
 *
 * Usa calculateOverallV2 (4 pilares):
 *   MacroSkill×0.50 + Performance×0.25 + Consistency×0.15 + Context×0.10
 *
 * O campo player.overall (v1) é IGNORADO (passado como null) para forçar o
 * cálculo pelo MacroSkillScore a partir dos blocos overallShooting/Passing/etc.
 * Isso evita propagar o overall errado gerado pelo bug dos type_ids.
 *
 * Usage:
 *   npx ts-node src/scripts/recalculate-overall-v2.ts
 *   npx ts-node src/scripts/recalculate-overall-v2.ts --dry-run
 *   npx ts-node src/scripts/recalculate-overall-v2.ts --batch=200
 */

import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import { prisma } from "../lib/prisma";
import { calculateOverallV2 } from "../analytics/overall-v2.engine";

const args = process.argv.slice(2);
const DRY_RUN    = args.includes("--dry-run");
const batchArg   = args.find(a => a.startsWith("--batch="))?.split("=")[1];
const BATCH_SIZE = batchArg ? Number(batchArg) : 500;

async function main() {
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║     RECALCULO OVERALL v2 — dados existentes no banco ║");
  console.log("╚══════════════════════════════════════════════════════╝");
  console.log(`  Dry run : ${DRY_RUN}`);
  console.log(`  Batch   : ${BATCH_SIZE}`);
  console.log("");

  // Conta jogadores com pelo menos uma entrada de PlayerStats
  const total = await prisma.player.count({
    where: { playerStats: { some: {} } },
  });
  console.log(`  Jogadores com PlayerStats: ${total}\n`);

  let processed = 0;
  let updated    = 0;
  let skipped    = 0;
  let errors     = 0;
  let offset     = 0;

  while (offset < total) {
    const players = await prisma.player.findMany({
      where: { playerStats: { some: {} } },
      select: {
        id:               true,
        positions:        true,
        age:              true,
        league:           true,
        // NÃO selecionamos overall — passamos null para forçar cálculo pelos blocos
        overallPace:      true,
        overallShooting:  true,
        overallPassing:   true,
        overallDribbling: true,
        overallDefending: true,
        overallPhysical:  true,
      },
      orderBy: { id: "asc" },
      skip: offset,
      take: BATCH_SIZE,
    });

    if (players.length === 0) break;

    for (const player of players) {
      try {
        // Pega o PlayerStats mais recente (com mais dados)
        const stats = await prisma.playerStats.findFirst({
          where: { playerId: player.id },
          orderBy: { createdAt: "desc" },
          select: {
            goals: true, assists: true,
            xG: true, xA: true,
            passAccuracy: true, passes: true,
            tackles: true, interceptions: true,
            rating: true, minutes: true, appearances: true,
          },
        });

        if (!stats) { skipped++; continue; }

        // Passa overall: null para forçar macroScore pelos blocos (ignora v1 errado)
        const playerInput = { ...player, overall: null };
        const result = calculateOverallV2(playerInput, stats);

        if (!DRY_RUN) {
          await prisma.player.update({
            where: { id: player.id },
            data: {
              overall:          result.overall,
              overallPace:      result.macroSkills.pace,
              overallShooting:  result.macroSkills.shooting,
              overallPassing:   result.macroSkills.passing,
              overallDribbling: result.macroSkills.dribbling,
              overallDefending: result.macroSkills.defending,
              overallPhysical:  result.macroSkills.physical,
              overallCalculatedAt: new Date(),
            },
          });
        }

        updated++;
      } catch (err) {
        errors++;
        if (errors <= 5) {
          console.error(`  ✗ player ${player.id}: ${(err as Error).message}`);
        }
      }

      processed++;
    }

    offset += players.length;
    console.log(`  Processados: ${processed}/${total}  atualizados=${updated}  erros=${errors}`);
  }

  // Resumo final
  const sep = "═".repeat(55);
  console.log("\n" + sep);
  console.log("  RESULTADO FINAL");
  console.log(sep);
  console.log(`  Processados : ${processed}`);
  console.log(`  Atualizados : ${updated}`);
  console.log(`  Pulados     : ${skipped}`);
  console.log(`  Erros       : ${errors}`);
  if (DRY_RUN) console.log("\n  ⚠  DRY RUN — nenhuma escrita no banco.");

  // Mostra distribuição de tiers se não for dry-run
  if (!DRY_RUN && updated > 0) {
    const tiers = await prisma.$queryRawUnsafe<any[]>(`
      SELECT
        CASE
          WHEN overall >= 88 THEN 'WORLD_CLASS (88+)'
          WHEN overall >= 82 THEN 'ELITE (82-87)'
          WHEN overall >= 76 THEN 'PREMIUM (76-81)'
          WHEN overall >= 68 THEN 'STANDARD (68-75)'
          WHEN overall >= 50 THEN 'PROSPECT (50-67)'
          ELSE                    'DEVELOPING (<50)'
        END as tier,
        COUNT(*)::int as count,
        MAX(overall) as max_overall
      FROM "Player"
      WHERE overall IS NOT NULL
      GROUP BY 1
      ORDER BY MAX(overall) DESC
    `);
    console.log("\n  DISTRIBUIÇÃO DE TIERS:");
    for (const t of tiers) {
      console.log(`    ${String(t.tier).padEnd(22)} ${String(t.count).padStart(5)} jogadores  max=${t.max_overall}`);
    }
  }

  console.log(sep + "\n");
  await prisma.$disconnect();
}

main().catch(async err => {
  console.error("❌ Erro fatal:", err.message);
  await prisma.$disconnect();
  process.exit(1);
});
