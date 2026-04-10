import { ingestLeagueWithKnownSeason } from "../ingestion/hierarchy.ingestion.service";

async function main() {
  console.log("Iniciando ingestão da Champions League (league=2, season=25580)...");
  const result = await ingestLeagueWithKnownSeason(2, 25580);
  console.log("Resultado:", JSON.stringify(result, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error("Erro:", e.message);
  process.exit(1);
});
