import { prisma } from "../lib/prisma";
import { calculateOverallV2 } from "../analytics/overall-v2.engine";

async function main() {
  // 5 players with best v1 overall that also have stats
  const players = await prisma.player.findMany({
    where: { overall: { not: null }, statsSnapshots: { some: {} } },
    orderBy: { overall: "desc" },
    take: 5,
    select: {
      id: true, name: true, positions: true, age: true, league: true, overall: true,
      overallPace: true, overallShooting: true, overallPassing: true,
      overallDribbling: true, overallDefending: true, overallPhysical: true,
    },
  });

  console.log("| Jogador                     | Pos  | Liga                      | v1 | v2 | Tier       | Macro | Perf | Cons | Ctx |");
  console.log("|-----------------------------+------+---------------------------+----+----+------------+-------+------+------+-----|");

  for (const player of players) {
    const stats = await prisma.playerStats.findFirst({
      where: { playerId: player.id },
      orderBy: { createdAt: "desc" },
      select: {
        goals: true, assists: true, xG: true, xA: true,
        passAccuracy: true, passes: true, tackles: true, interceptions: true,
        rating: true, minutes: true, appearances: true,
      },
    });

    const r = calculateOverallV2(player as any, stats);
    const pos = player.positions[0]?.substring(0, 4) ?? "N/A";
    const liga = (player.league ?? "N/A").substring(0, 25);
    const name = player.name.substring(0, 28).padEnd(28);
    console.log(`| ${name} | ${pos.padEnd(4)} | ${liga.padEnd(25)} | ${String(player.overall).padStart(2)} | ${String(r.overall).padStart(2)} | ${r.tier.padEnd(10)} | ${r.macroSkillScore.toString().padStart(5)} | ${r.performanceScore.toString().padStart(4)} | ${r.consistencyScore.toString().padStart(4)} | ${r.contextScore.toString().padStart(3)} |`);
  }

  // Also test 2 players WITHOUT stats (fallback)
  const noStats = await prisma.player.findFirst({
    where: { overall: { not: null }, statsSnapshots: { none: {} } },
    orderBy: { overall: "desc" },
    select: {
      id: true, name: true, positions: true, age: true, league: true, overall: true,
      overallPace: true, overallShooting: true, overallPassing: true,
      overallDribbling: true, overallDefending: true, overallPhysical: true,
    },
  });
  if (noStats) {
    const r = calculateOverallV2(noStats as any, null);
    console.log(`\nSem stats: ${noStats.name} → v1=${noStats.overall} v2=${r.overall} [${r.tier}] (fallback perf=${r.performanceScore})`);
  }

  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
