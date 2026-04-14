/**
 * compute-soccermind-overall.ts
 *
 * Calcula o SoccerMind Overall para todos os jogadores com dados no banco.
 *
 * ALGORITMO em 2 fases:
 *
 *   FASE 1 — População
 *     Lê todos os PlayerStats com minutes >= 450.
 *     Para cada grupo posicional (GK / DEF / MID / ATT), constrói arrays
 *     ordenados com os valores de cada métrica. Esses arrays servem como
 *     distribuição de referência para o cálculo de percentis.
 *
 *   FASE 2 — Scoring
 *     Para cada jogador com PlayerStats (qualquer quantidade de minutos),
 *     calcula o SoccerMind Overall usando a distribuição da Fase 1.
 *     Salva o resultado em Player.overall.
 *
 * Usage:
 *   npx ts-node src/scripts/compute-soccermind-overall.ts
 *   npx ts-node src/scripts/compute-soccermind-overall.ts --dry-run
 *   npx ts-node src/scripts/compute-soccermind-overall.ts --batch=500
 */

import * as dotenv from "dotenv";
import * as path from "path";
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import { prisma } from "../lib/prisma";
import {
  calculateSoccerMindOverall,
  calculatePotential,
  calculateMarketValue,
  resolvePositionGroup,
  sortedSamples,
  type MetricSamples,
  type PopulationStats,
  type PositionGroup,
  SM_MIN_MINUTES,
} from "../analytics/soccermind-overall.engine";

const args = process.argv.slice(2);
const DRY_RUN     = args.includes("--dry-run");
const FORCE_VALUE = args.includes("--force-value");  // sobrescreve marketValue existente
const batchArg    = args.find(a => a.startsWith("--batch="))?.split("=")[1];
const BATCH_SIZE  = batchArg ? Number(batchArg) : 500;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function per90(stat: number | null | undefined, mins: number): number {
  if (!stat || mins < 1) return 0;
  return (stat / mins) * 90;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function emptyMetricSamples(): MetricSamples {
  return {
    goals90: [], xG90: [], shotsOnTarget90: [], conversionRate: [],
    assists90: [], xA90: [], keyPasses90: [], passAccuracy: [],
    tackles90: [], interceptions90: [], aerialDuelsWon90: [],
    rating: [], availability: [], minuteRegularity: [],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// FASE 1 — Construção da distribuição populacional
// ─────────────────────────────────────────────────────────────────────────────

async function buildPopulationStats(): Promise<PopulationStats> {
  console.log("  [Fase 1] Carregando população (minutes >= " + SM_MIN_MINUTES + ")...");

  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT
      p.positions,
      ps.goals, ps.assists, ps."xG", ps."xA",
      ps."keyPasses", ps."passAccuracy", ps.passes,
      ps.tackles, ps.interceptions,
      ps.shots, ps."shotsOnTarget",
      ps."aerialDuelsWon",
      ps.rating, ps.minutes, ps.appearances
    FROM "PlayerStats" ps
    JOIN "Player" p ON p.id = ps."playerId"
    WHERE ps.minutes >= ${SM_MIN_MINUTES}
  `);

  const groups: Record<PositionGroup, ReturnType<typeof emptyMetricSamples>> = {
    GK:  emptyMetricSamples(),
    DEF: emptyMetricSamples(),
    MID: emptyMetricSamples(),
    ATT: emptyMetricSamples(),
  };

  for (const r of rows) {
    const positions: string[] = Array.isArray(r.positions) ? r.positions : [];
    const group   = resolvePositionGroup(positions);
    const mins    = Number(r.minutes) || 0;
    const apps    = Number(r.appearances) || 0;
    const shots   = Number(r.shots) || 0;
    const goals   = Number(r.goals) || 0;
    const g       = groups[group];

    g.goals90.push(per90(r.goals, mins));
    g.xG90.push(per90(r.xG, mins));
    g.shotsOnTarget90.push(per90(r.shotsOnTarget, mins));
    g.conversionRate.push(shots > 0 ? clamp((goals / shots) * 100, 0, 100) : 0);
    g.assists90.push(per90(r.assists, mins));
    g.xA90.push(per90(r.xA, mins));
    g.keyPasses90.push(per90(r.keyPasses, mins));
    g.passAccuracy.push(clamp(Number(r.passAccuracy) || 0, 0, 100));
    g.tackles90.push(per90(r.tackles, mins));
    g.interceptions90.push(per90(r.interceptions, mins));
    g.aerialDuelsWon90.push(per90(r.aerialDuelsWon, mins));
    g.rating.push(clamp((Number(r.rating) || 0) * 10, 0, 100)); // normalize 0–10 → 0–100
    g.availability.push(clamp((apps / 34) * 100, 0, 100));
    const avgMin = apps > 0 ? mins / apps : 0;
    g.minuteRegularity.push(clamp((avgMin / 90) * 100, 0, 100));
  }

  const totalByGroup: Record<string, number> = {};
  for (const [grp, samples] of Object.entries(groups)) {
    totalByGroup[grp] = samples.goals90.length;
  }
  console.log("  [Fase 1] Amostra por grupo:", JSON.stringify(totalByGroup));

  // ── Validação de distribuição ──────────────────────────────────────────
  const grandTotal = Object.values(totalByGroup).reduce((a, b) => a + b, 0);
  if (grandTotal > 0) {
    const midPct = ((totalByGroup["MID"] ?? 0) / grandTotal * 100).toFixed(1);
    if ((totalByGroup["MID"] ?? 0) / grandTotal > 0.90) {
      console.warn(
        `  ⚠  AVISO: ${midPct}% da população está em MID — provável problema de mapeamento de posição!`,
      );
    } else {
      console.log(`  [Fase 1] Distribuição OK — MID representa ${midPct}% da população.`);
    }
  }

  // Sort all arrays ascending for binary-search percentile lookup
  const pop: PopulationStats = {} as PopulationStats;
  for (const [grp, samples] of Object.entries(groups) as [PositionGroup, MetricSamples][]) {
    pop[grp] = {
      goals90:           sortedSamples(samples.goals90),
      xG90:              sortedSamples(samples.xG90),
      shotsOnTarget90:   sortedSamples(samples.shotsOnTarget90),
      conversionRate:    sortedSamples(samples.conversionRate),
      assists90:         sortedSamples(samples.assists90),
      xA90:              sortedSamples(samples.xA90),
      keyPasses90:       sortedSamples(samples.keyPasses90),
      passAccuracy:      sortedSamples(samples.passAccuracy),
      tackles90:         sortedSamples(samples.tackles90),
      interceptions90:   sortedSamples(samples.interceptions90),
      aerialDuelsWon90:  sortedSamples(samples.aerialDuelsWon90),
      rating:            sortedSamples(samples.rating),
      availability:      sortedSamples(samples.availability),
      minuteRegularity:  sortedSamples(samples.minuteRegularity),
    };
  }

  return pop;
}

// ─────────────────────────────────────────────────────────────────────────────
// FASE 2 — Scoring de todos os jogadores
// ─────────────────────────────────────────────────────────────────────────────

async function scoreAllPlayers(pop: PopulationStats): Promise<void> {
  const total = await prisma.player.count({
    where: { statsSnapshots: { some: {} } },
  });
  console.log(`\n  [Fase 2] Calculando overall para ${total} jogadores...`);

  let processed = 0;
  let updated   = 0;
  let errors    = 0;
  let offset    = 0;

  while (offset < total) {
    const players = await prisma.player.findMany({
      where: { statsSnapshots: { some: {} } },
      select: {
        id:          true,
        positions:   true,
        league:      true,
        age:         true,
        marketValue: true,   // para respeitar valores manuais existentes
      },
      orderBy: { id: "asc" },
      skip:  offset,
      take:  BATCH_SIZE,
    });

    if (players.length === 0) break;

    for (const player of players) {
      try {
        const stats = await prisma.playerStats.findFirst({
          where:   { playerId: player.id },
          orderBy: { createdAt: "desc" },
          select: {
            goals: true, assists: true,
            xG: true, xA: true,
            keyPasses: true, passAccuracy: true, passes: true,
            tackles: true, interceptions: true,
            shots: true, shotsOnTarget: true,
            aerialDuelsWon: true,
            rating: true, minutes: true, appearances: true,
          },
        });

        if (!stats) { processed++; continue; }

        const result = calculateSoccerMindOverall(
          { ...player, ...stats },
          pop,
        );

        const potential = calculatePotential(result.overall, player.age);

        // Calcula market value — respeita valor manual pré-existente
        // a menos que --force-value seja passado explicitamente
        const shouldCalcValue = FORCE_VALUE || player.marketValue == null;
        const marketValue = shouldCalcValue
          ? calculateMarketValue({
              overall:       result.overall,
              potential,
              age:           player.age,
              positionGroup: result.positionGroup,
              league:        player.league,
            })
          : player.marketValue;

        if (!DRY_RUN) {
          await prisma.player.update({
            where: { id: player.id },
            data: {
              overall:             result.overall,
              potential,
              marketValue,
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
    if (processed % 1000 === 0 || offset >= total) {
      console.log(`    … ${processed}/${total}  atualizados=${updated}  erros=${errors}`);
    }
  }

  // ── Relatório final ────────────────────────────────────────────────────────

  const sep = "═".repeat(58);
  console.log("\n" + sep);
  console.log("  SOCCERMIND OVERALL — RESULTADO");
  console.log(sep);
  console.log(`  Processados  : ${processed}`);
  console.log(`  Atualizados  : ${updated}`);
  console.log(`  Erros        : ${errors}`);
  if (DRY_RUN) {
    console.log("\n  ⚠  DRY RUN — nenhuma escrita realizada.");
  }

  if (!DRY_RUN && updated > 0) {
    const tiers = await prisma.$queryRawUnsafe<any[]>(`
      SELECT
        CASE
          WHEN overall >= 82 THEN '82–85  ELITE'
          WHEN overall >= 76 THEN '76–81  MUITO BOM'
          WHEN overall >= 68 THEN '68–75  BOM'
          WHEN overall >= 58 THEN '58–67  MEDIANO'
          ELSE                    '40–57  REGULAR'
        END as tier,
        COUNT(*)::int as count,
        ROUND(COUNT(*)::numeric * 100 / SUM(COUNT(*)) OVER (), 1) as pct,
        MAX(overall) as max_ov
      FROM "Player"
      WHERE overall IS NOT NULL AND overall > 0
      GROUP BY 1
      ORDER BY MAX(overall) DESC
    `);

    console.log("\n  DISTRIBUIÇÃO DE TIERS:");
    console.log("  " + "-".repeat(45));
    for (const t of tiers) {
      const bar = "█".repeat(Math.round(Number(t.pct) / 2));
      console.log(`  ${String(t.tier).padEnd(18)} ${String(t.count).padStart(5)}  ${String(t.pct).padStart(5)}%  ${bar}`);
    }
    console.log("  " + "-".repeat(45));

    const stats = await prisma.$queryRawUnsafe<any[]>(`
      SELECT MAX(overall) as max, MIN(overall) as min,
             ROUND(AVG(overall::numeric), 1) as media
      FROM "Player" WHERE overall IS NOT NULL AND overall > 0
    `);
    const s = stats[0];
    console.log(`\n  Overall  — Max: ${s.max}  |  Min: ${s.min}  |  Média: ${s.media}`);

    // Validação do potential por faixa de idade
    const potStats = await prisma.$queryRawUnsafe<any[]>(`
      SELECT
        CASE
          WHEN age <= 21 THEN '≤21 jovem'
          WHEN age <= 24 THEN '22–24'
          WHEN age <= 27 THEN '25–27'
          WHEN age <= 30 THEN '28–30'
          ELSE                '31+'
        END as faixa,
        COUNT(*)::int as players,
        ROUND(AVG(overall::numeric), 1)   as avg_overall,
        ROUND(AVG(potential::numeric), 1) as avg_potential,
        ROUND(AVG((potential - overall)::numeric), 1) as avg_gap
      FROM "Player"
      WHERE overall IS NOT NULL AND potential IS NOT NULL AND overall > 0
      GROUP BY 1
      ORDER BY MIN(age)
    `);
    console.log("\n  POTENTIAL por faixa de idade:");
    console.log("  " + "-".repeat(60));
    console.log("  Faixa".padEnd(12) + "Players".padEnd(10) + "Avg OV".padEnd(10) + "Avg POT".padEnd(10) + "Gap");
    for (const r of potStats) {
      console.log(
        `  ${String(r.faixa).padEnd(11)} ${String(r.players).padStart(6)}    ` +
        `${String(r.avg_overall).padStart(5)}     ${String(r.avg_potential).padStart(5)}    +${r.avg_gap}`
      );
    }
    console.log("  " + "-".repeat(60));

    // Validação de market value por faixa de overall
    const mvStats = await prisma.$queryRawUnsafe<any[]>(`
      SELECT
        CASE
          WHEN overall >= 80 THEN '80+  ELITE'
          WHEN overall >= 70 THEN '70–79 BOM'
          WHEN overall >= 60 THEN '60–69 MÉDIO'
          ELSE                    '<60  REGULAR'
        END as faixa,
        COUNT(*)::int as players,
        ROUND((AVG("marketValue") / 1000000.0)::numeric, 1) as avg_m_eur,
        ROUND((MAX("marketValue") / 1000000.0)::numeric, 1) as max_m_eur
      FROM "Player"
      WHERE overall IS NOT NULL AND "marketValue" IS NOT NULL AND overall > 0
      GROUP BY 1
      ORDER BY MAX(overall) DESC
    `);
    console.log("\n  MARKET VALUE por faixa de overall:");
    console.log("  " + "-".repeat(55));
    console.log("  Faixa".padEnd(16) + "Players".padEnd(10) + "Avg (M€)".padEnd(12) + "Max (M€)");
    for (const r of mvStats) {
      console.log(
        `  ${String(r.faixa).padEnd(15)} ${String(r.players).padStart(6)}    ` +
        `€${String(r.avg_m_eur).padStart(6)}M      €${r.max_m_eur}M`
      );
    }
    console.log("  " + "-".repeat(55));
  }

  console.log(sep + "\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║        SOCCERMIND OVERALL — CÁLCULO PROPRIETÁRIO         ║");
  console.log("╚══════════════════════════════════════════════════════════╝");
  console.log(`  Range    : 40–85`);
  console.log(`  Grupos   : GK / DEF / MID / ATT`);
  console.log(`  Dry run      : ${DRY_RUN}`);
  console.log(`  Force value  : ${FORCE_VALUE}  (sobrescreve marketValue existente)`);
  console.log(`  Batch    : ${BATCH_SIZE}`);
  console.log("");

  const pop = await buildPopulationStats();
  await scoreAllPlayers(pop);

  await prisma.$disconnect();
}

main().catch(async err => {
  console.error("❌ Erro fatal:", err.message);
  await prisma.$disconnect();
  process.exit(1);
});
