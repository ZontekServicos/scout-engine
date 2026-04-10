import { prisma } from "../lib/prisma";

async function main() {
  // Check event types for Samuel Lino
  const events = await prisma.matchEvent.findMany({
    where: { playerId: "41c48883-70cc-477e-b6ac-0d2f0c527bbc" },
    select: { type: true, outcome: true, minute: true },
  });
  console.log("Samuel Lino events:", JSON.stringify(events, null, 2));

  // Check overall event type distribution in Brasileirão 2026
  const dist = await prisma.matchEvent.groupBy({
    by: ["type"],
    where: { match: { season: { externalId: 26763 } } },
    _count: { type: true },
    orderBy: { _count: { type: "desc" } },
  });
  console.log("\nEvent type distribution in Brasileirão 2026:");
  dist.forEach(d => console.log(`  ${d.type}: ${d._count.type}`));

  process.exit(0);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
