import { prisma } from "../lib/prisma";
async function main() {
  const r = await prisma.$queryRawUnsafe<any[]>('SELECT status, COUNT(*) as cnt FROM "Match" GROUP BY status ORDER BY cnt DESC');
  for (const x of r) console.log(x.status + ": " + Number(x.cnt));
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
