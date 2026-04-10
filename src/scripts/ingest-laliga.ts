import { ingestLeagueWithKnownSeason } from "../ingestion/hierarchy.ingestion.service";

async function main() {
  console.log("Iniciando ingestão da La Liga (league=564, season=25659)...");
  const result = await ingestLeagueWithKnownSeason(564, 25659);
  console.log("Resultado:", JSON.stringify(result, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error("Erro:", e.message);
  process.exit(1);
});
