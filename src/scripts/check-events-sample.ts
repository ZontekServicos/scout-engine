import { prisma } from "../lib/prisma";
async function main() {
  // How many distinct players have events?
  const r = await prisma.$queryRawUnsafe<any[]>(`
    SELECT COUNT(DISTINCT "playerId") as players_with_events
    FROM "MatchEvent" WHERE "playerId" IS NOT NULL
  `);
  console.log("Jogadores com eventos:", Number(r[0].players_with_events));

  // Sample: check if minute field has data
  const sample = await prisma.matchEvent.findMany({
    where: { playerId: { not: null }, minute: { not: null } },
    select: { type: true, minute: true, outcome: true },
    take: 5,
  });
  console.log("\nSample eventos com minuto:");
  for (const e of sample) console.log(`  type=${e.type} minute=${e.minute} outcome=${e.outcome}`);

  // Check SUBSTITUTION events — do they have minute data?
  const subWithMinute = await prisma.matchEvent.count({
    where: { type: "SUBSTITUTION", minute: { not: null } },
  });
  const subTotal = await prisma.matchEvent.count({ where: { type: "SUBSTITUTION" } });
  console.log(`\nSUBSTITUTION com minuto: ${subWithMinute}/${subTotal}`);

  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
