import { ingestLeagueWithKnownSeason } from "../ingestion/hierarchy.ingestion.service";

async function main() {
  console.log("Iniciando ingestão da Serie A italiana (league=384, season=25533)...");
  const result = await ingestLeagueWithKnownSeason(384, 25533);
  console.log("Resultado:", JSON.stringify(result, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error("Erro:", e.message);
  process.exit(1);
});
