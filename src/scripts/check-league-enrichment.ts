import { prisma } from "../lib/prisma";

async function main() {
  const rows = await prisma.$queryRawUnsafe<any[]>(`
    SELECT
      COALESCE(league, 'unknown') as league,
      COUNT(*)::int as total,
      COUNT(overall)::int as enriched,
      (COUNT(*) - COUNT(overall))::int as pending,
      MAX(overall) as max_overall
    FROM "Player"
    WHERE source = 'sportmonks'
    GROUP BY league
    ORDER BY pending DESC
    LIMIT 25
  `);

  console.log("LIGA".padEnd(30) + "TOTAL".padEnd(8) + "ENRICHED".padEnd(10) + "PENDING".padEnd(9) + "MAX");
  console.log("-".repeat(65));
  for (const r of rows) {
    const league = String(r.league ?? "unknown").substring(0, 28).padEnd(30);
    console.log(league + String(r.total).padEnd(8) + String(r.enriched).padEnd(10) + String(r.pending).padEnd(9) + (r.max_overall ?? "null"));
  }

  const totals = await prisma.$queryRawUnsafe<any[]>(`
    SELECT
      COUNT(*)::int as total,
      COUNT(overall)::int as enriched,
      (COUNT(*) - COUNT(overall))::int as pending
    FROM "Player"
    WHERE source = 'sportmonks'
  `);
  const t = totals[0];
  console.log("-".repeat(65));
  console.log("TOTAL".padEnd(30) + String(t.total).padEnd(8) + String(t.enriched).padEnd(10) + String(t.pending));

  process.exit(0);
}

main().catch(e => { console.error(e.message); process.exit(1); });
