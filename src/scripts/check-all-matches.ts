import { prisma } from "../lib/prisma";
async function main() {
  const r1 = await prisma.$queryRawUnsafe<any[]>(`
    SELECT l.name as liga, COUNT(*) as total_partidas,
      SUM(CASE WHEN m.status = 'FT' THEN 1 ELSE 0 END) as finalizadas
    FROM "Match" m
    JOIN "Season" s ON m."seasonId" = s.id
    JOIN "League" l ON s."leagueId" = l.id
    GROUP BY l.name ORDER BY total_partidas DESC
  `);
  console.log("=== PASSO 1: Partidas por liga ===");
  for (const row of r1) console.log("  " + row.liga + ": total=" + Number(row.total_partidas) + ", FT=" + Number(row.finalizadas));

  const r2 = await prisma.$queryRawUnsafe<any[]>(`
    SELECT l.name as liga,
      COUNT(DISTINCT m.id) as partidas_com_eventos,
      COUNT(me.id) as total_eventos
    FROM "MatchEvent" me
    JOIN "Match" m ON me."matchId" = m.id
    JOIN "Season" s ON m."seasonId" = s.id
    JOIN "League" l ON s."leagueId" = l.id
    GROUP BY l.name
  `);
  console.log("\n=== PASSO 2: Eventos já ingeridos ===");
  for (const row of r2) console.log("  " + row.liga + ": partidas_com_eventos=" + Number(row.partidas_com_eventos) + ", total_eventos=" + Number(row.total_eventos));

  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
