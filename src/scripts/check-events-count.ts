import { prisma } from "../lib/prisma";
async function main() {
  const total = await prisma.matchEvent.count();
  console.log("Total MatchEvents no banco:", total);

  const byType = await prisma.matchEvent.groupBy({
    by: ["type"],
    _count: { type: true },
    orderBy: { _count: { type: "desc" } },
    take: 10,
  });
  console.log("\nPor tipo:");
  for (const r of byType) console.log(`  ${r.type}: ${r._count.type}`);

  const matchesWithEvents = await prisma.$queryRawUnsafe<any[]>(`
    SELECT COUNT(DISTINCT "matchId") as partidas FROM "MatchEvent"
  `);
  console.log("\nPartidas com eventos:", Number(matchesWithEvents[0].partidas));

  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
