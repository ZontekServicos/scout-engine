import { prisma } from "../lib/prisma";
import { ingestMatchEvents } from "../ingestion/match.ingestion.service";

async function main() {
  const matches = await prisma.match.findMany({
    where: { season: { externalId: 25580 } },
    select: { id: true, externalId: true, status: true },
    orderBy: { startingAt: "asc" },
    take: 20,
  });

  console.log(`Found ${matches.length} matches`);

  let totalEvents = 0;
  let errorCount = 0;

  for (const match of matches) {
    try {
      console.log(`  Fixture ${match.externalId}...`);
      const events = await ingestMatchEvents(match.externalId);
      totalEvents += events.length;
      console.log(`    → ${events.length} events`);
      await new Promise((r) => setTimeout(r, 300));
    } catch (e: any) {
      console.error(`    Error: ${e.message}`);
      errorCount++;
    }
  }

  console.log(`\nDone. Total events: ${totalEvents}, Errors: ${errorCount}`);
  process.exit(0);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
