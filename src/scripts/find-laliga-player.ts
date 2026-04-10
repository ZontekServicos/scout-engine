import { prisma } from "../lib/prisma";

async function main() {
  const topPlayers = await prisma.matchEvent.groupBy({
    by: ["playerId"],
    where: {
      match: { season: { externalId: 25659 } },
      playerId: { not: null },
      type: { in: ["GOAL", "YELLOW_CARD", "SHOT", "FOUL"] },
    },
    _count: { playerId: true },
    orderBy: { _count: { playerId: "desc" } },
    take: 5,
  });

  console.log("Top La Liga players by notable events:");
  for (const p of topPlayers) {
    if (!p.playerId) continue;
    const player = await prisma.player.findUnique({
      where: { id: p.playerId },
      select: { id: true, name: true },
    });
    console.log(`  ${player?.name ?? "Unknown"} (id: ${p.playerId}) — ${p._count.playerId} events`);
  }
  process.exit(0);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
