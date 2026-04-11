import { prisma } from "../lib/prisma";
async function main() {
  // Top players by name
  const named = await prisma.player.findMany({
    where: { name: { contains: "Mbappe", mode: "insensitive" } },
    select: { id:true, name:true, overall:true, positions:true,
      overallPace:true, overallShooting:true, overallPassing:true,
      overallDribbling:true, overallDefending:true, overallPhysical:true },
  });
  const salah = await prisma.player.findMany({
    where: { name: { contains: "Salah", mode: "insensitive" } },
    select: { id:true, name:true, overall:true, positions:true,
      overallPace:true, overallShooting:true, overallPassing:true,
      overallDribbling:true, overallDefending:true, overallPhysical:true },
  });
  const haaland = await prisma.player.findMany({
    where: { name: { contains: "Haaland", mode: "insensitive" } },
    select: { id:true, name:true, overall:true, positions:true,
      overallPace:true, overallShooting:true, overallPassing:true,
      overallDribbling:true, overallDefending:true, overallPhysical:true },
  });

  console.log("=== MBAPPE ==="); for (const p of named) console.log(JSON.stringify(p));
  console.log("=== SALAH ===");  for (const p of salah)  console.log(JSON.stringify(p));
  console.log("=== HAALAND ===");for (const p of haaland)console.log(JSON.stringify(p));

  // Top 5 by overall
  const top5 = await prisma.player.findMany({
    orderBy: { overall: "desc" }, take: 5,
    where: { overall: { not: null } },
    select: { name:true, overall:true, overallPace:true, overallShooting:true,
      overallPassing:true, overallDribbling:true, overallDefending:true, overallPhysical:true, positions:true },
  });
  console.log("\n=== TOP 5 OVERALL ===");
  for (const p of top5) console.log(JSON.stringify(p));

  // PlayerStats for Salah
  if (salah.length > 0) {
    const stats = await prisma.playerStats.findMany({
      where: { playerId: salah[0].id },
      select: { goals:true, assists:true, xG:true, xA:true, minutes:true,
        appearances:true, rating:true, passAccuracy:true, tackles:true, passes:true },
    });
    console.log("\n=== SALAH STATS ==="); console.log(JSON.stringify(stats, null, 2));
  }

  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
