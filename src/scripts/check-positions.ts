/**
 * check-positions.ts
 * Mostra todas as posições distintas no banco e como ficam mapeadas
 * pelo resolvePositionGroup do soccermind-overall.engine.
 */
import { prisma } from "../lib/prisma";
import { resolvePositionGroup } from "../analytics/soccermind-overall.engine";

async function main() {
  const rows = await prisma.$queryRawUnsafe<{ positions: string[] }[]>(
    `SELECT DISTINCT positions FROM "Player" WHERE positions != '{}'`,
  );

  const posCounter  = new Map<string, number>();
  const groupTotals = { GK: 0, DEF: 0, MID: 0, ATT: 0 };
  const unmapped: string[] = [];

  // Conta todos os valores de posição individuais
  for (const r of rows) {
    for (const pos of r.positions) {
      posCounter.set(pos, (posCounter.get(pos) ?? 0) + 1);
    }
  }

  // Simula mapeamento com dados reais de jogadores
  const players = await prisma.player.findMany({
    select: { name: true, positions: true },
    take: 9999,
  });

  for (const p of players) {
    const group = resolvePositionGroup(p.positions);
    groupTotals[group]++;
    // detecta posições não mapeadas explicitamente
    for (const pos of p.positions) {
      const key = pos.toUpperCase().trim().replace(/\s+/g, " ");
      if (!["GK","GOALKEEPER","DEFENDER","CENTRE BACK","CENTER BACK","CENTRE-BACK",
            "RIGHT BACK","LEFT BACK","RIGHT WING BACK","LEFT WING BACK","SWEEPER",
            "CB","SW","FB","WB","LB","RB","LWB","RWB",
            "MIDFIELDER","CENTRAL MIDFIELD","DEFENSIVE MIDFIELD","ATTACKING MIDFIELD",
            "CENTRAL MIDFIELDER","DEFENSIVE MIDFIELDER","ATTACKING MIDFIELDER",
            "LEFT MIDFIELD","RIGHT MIDFIELD","CM","CDM","CAM","DM","AM","LM","RM","MEZ","WM",
            "LEFT WING","RIGHT WING","LEFT WINGER","RIGHT WINGER","WINGER","LW","RW","W",
            "ATTACKER","CENTRE FORWARD","CENTER FORWARD","CENTRE-FORWARD","STRIKER",
            "SECOND STRIKER","ST","CF","SS"].includes(key)) {
        if (!unmapped.includes(key)) unmapped.push(key);
      }
    }
  }

  // ── Valores distintos de posição ─────────────────────────────────────────
  console.log(`\nValores distintos no banco (${posCounter.size} únicos):\n`);
  const sorted = [...posCounter.entries()].sort((a, b) => b[1] - a[1]);
  for (const [val, cnt] of sorted) {
    const group = resolvePositionGroup([val]);
    console.log(`  "${val}"`.padEnd(30) + `→ ${group.padEnd(4)}  × ${cnt}`);
  }

  // ── Distribuição final ───────────────────────────────────────────────────
  console.log("\n═".repeat(50));
  console.log("  DISTRIBUIÇÃO POR GRUPO (total de jogadores):\n");
  const grand = Object.values(groupTotals).reduce((a, b) => a + b, 0);
  for (const [grp, cnt] of Object.entries(groupTotals)) {
    const pct = grand > 0 ? ((cnt / grand) * 100).toFixed(1) : "0.0";
    const bar = "█".repeat(Math.round(Number(pct) / 2));
    console.log(`  ${grp.padEnd(4)} ${String(cnt).padStart(5)}  ${pct.padStart(5)}%  ${bar}`);
  }
  console.log(`${"─".repeat(50)}`);
  console.log(`  Total: ${grand}`);

  if (unmapped.length > 0) {
    console.log(`\n  ⚠  Posições SEM mapeamento explícito (caem no fallback MID):`);
    for (const u of unmapped) console.log(`    - "${u}"`);
  } else {
    console.log(`\n  ✓  Todas as posições estão mapeadas explicitamente.`);
  }

  process.exit(0);
}

main().catch(e => { console.error(e.message); process.exit(1); });
