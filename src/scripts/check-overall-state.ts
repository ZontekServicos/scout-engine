import { prisma } from "../lib/prisma";
async function main() {
  const r = await prisma.$queryRawUnsafe<any[]>(`
    SELECT 
      COUNT(*) as total,
      COUNT(CASE WHEN overall > 0 THEN 1 END) as com_overall,
      COUNT(CASE WHEN overall >= 80 THEN 1 END) as elite,
      MAX(overall) as max_overall,
      ROUND(AVG(overall::numeric), 1) as media_overall
    FROM "Player"
    WHERE overall IS NOT NULL
  `);
  const s = r[0];
  console.log(`Total com overall: ${Number(s.total)}`);
  console.log(`Com overall > 0:   ${Number(s.com_overall)}`);
  console.log(`Elite (>= 80):     ${Number(s.elite)}`);
  console.log(`Max overall:       ${s.max_overall}`);
  console.log(`Média overall:     ${s.media_overall}`);
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
