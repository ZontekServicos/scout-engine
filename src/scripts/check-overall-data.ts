import { prisma } from "../lib/prisma";
async function main() {
  // Passo 1 & 2: valores reais dos blocos
  const r1 = await prisma.$queryRawUnsafe<any[]>(`
    SELECT name, "overallPace", "overallShooting", "overallPassing",
           "overallDribbling", "overallDefending", "overallPhysical",
           overall, positions
    FROM "Player"
    WHERE "overallPace" IS NOT NULL AND "overallPace" > 0
    ORDER BY overall DESC NULLS LAST
    LIMIT 10
  `);
  console.log("=== BLOCOS OVERALL (top 10 por overall) ===");
  for (const p of r1) {
    console.log(`${p.name}: overall=${p.overall} PAC=${p.overallPace} SHO=${p.overallShooting} PAS=${p.overallPassing} DRI=${p.overallDribbling} DEF=${p.overallDefending} PHY=${p.overallPhysical} pos=${JSON.stringify(p.positions)}`);
  }

  // Passo 4: jogadores com overall >= 80
  const r2 = await prisma.$queryRawUnsafe<any[]>(`
    SELECT id, name, overall, "overallPace", "overallShooting", positions
    FROM "Player"
    WHERE overall >= 80
    ORDER BY overall DESC
    LIMIT 5
  `);
  console.log("\n=== JOGADORES OVERALL >= 80 ===");
  for (const p of r2) console.log(`${p.name}: overall=${p.overall} PAC=${p.overallPace} SHO=${p.overallShooting} id=${p.id}`);

  // Distribuição de valores para entender escala
  const r3 = await prisma.$queryRawUnsafe<any[]>(`
    SELECT 
      MIN("overallPace") as min_pace, MAX("overallPace") as max_pace,
      AVG("overallPace") as avg_pace,
      MIN(overall) as min_ov, MAX(overall) as max_ov, AVG(overall) as avg_ov,
      COUNT(*) FILTER (WHERE "overallPace" IS NOT NULL) as with_pace
    FROM "Player"
  `);
  const s = r3[0];
  console.log(`\n=== ESCALA ===`);
  console.log(`overallPace: min=${s.min_pace} max=${s.max_pace} avg=${parseFloat(s.avg_pace).toFixed(1)}`);
  console.log(`overall:     min=${s.min_ov}  max=${s.max_ov}  avg=${parseFloat(s.avg_ov).toFixed(1)}`);
  console.log(`Jogadores com overallPace preenchido: ${s.with_pace}`);

  process.exit(0);
}
main().catch(e => { console.error(e.message); process.exit(1); });
