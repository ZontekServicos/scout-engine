import { prisma } from "../lib/prisma";
async function main() {
  const total = await prisma.player.count({ where: { overall: { not: null } } });
  const comOverall = await prisma.player.count({ where: { overall: { gt: 0 } } });
  const elite = await prisma.player.count({ where: { overall: { gte: 80 } } });
  const top = await prisma.player.findFirst({ orderBy: { overall: "desc" }, select: { name: true, overall: true } });
  console.log(`Total com overall: ${total}`);
  console.log(`Com overall > 0:   ${comOverall}`);
  console.log(`Elite (>= 80):     ${elite}`);
  console.log(`Maior overall:     ${top?.name} = ${top?.overall}`);
  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
