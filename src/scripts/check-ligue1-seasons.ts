import { prisma } from "../lib/prisma";

async function main() {
  const seasons = await prisma.$queryRawUnsafe<any[]>(`
    SELECT s.id, s."externalId", s.year, s."isCurrent"
    FROM "Season" s
    JOIN "League" l ON s."leagueId" = l.id
    WHERE l."externalId" = 301
    ORDER BY s.year DESC
    LIMIT 5
  `);
  console.log(JSON.stringify(seasons, null, 2));
  process.exit(0);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
