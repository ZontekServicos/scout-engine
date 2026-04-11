import { prisma } from "../lib/prisma";
async function main() {
  // Jogador com maior overall no banco
  const topPlayer = await prisma.player.findFirst({
    where: { overall: { not: null } },
    orderBy: { overall: "desc" },
    select: { id: true, name: true, overall: true, positions: true, league: true,
              overallPace: true, overallShooting: true, overallPassing: true,
              overallDribbling: true, overallDefending: true, overallPhysical: true },
  });
  console.log("=== TOP PLAYER ===");
  console.log(JSON.stringify(topPlayer, null, 2));

  if (!topPlayer) { process.exit(0); }

  // Verificar PlayerStats desse jogador
  const stats = await prisma.playerStats.findMany({
    where: { playerId: topPlayer.id },
    select: {
      goals: true, assists: true, xG: true, xA: true, minutes: true,
      appearances: true, rating: true, passAccuracy: true,
      tackles: true, interceptions: true, shots: true, passes: true,
    },
  });
  console.log("\n=== PLAYER STATS ===");
  console.log(JSON.stringify(stats, null, 2));

  // Verificar o que está disponível em PlayerStats globalmente
  const coverage = await prisma.$queryRawUnsafe<any[]>(`
    SELECT
      COUNT(*) as total,
      COUNT(goals) as with_goals,
      COUNT(assists) as with_assists,
      COUNT(tackles) as with_tackles,
      COUNT(interceptions) as with_interceptions,
      COUNT(rating) as with_rating,
      COUNT("passAccuracy") as with_pass_acc,
      COUNT(minutes) as with_minutes,
      AVG(goals) as avg_goals,
      AVG(minutes) as avg_minutes
    FROM "PlayerStats"
  `);
  console.log("\n=== COBERTURA GLOBAL DE PLAYERSTATS ===");
  const c = coverage[0];
  for (const [k, v] of Object.entries(c)) {
    const val = typeof v === 'bigint' ? Number(v) : (typeof v === 'string' ? parseFloat(v).toFixed(1) : v);
    console.log(`  ${k}: ${val}`);
  }

  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
