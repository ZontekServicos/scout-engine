import { ingestLeagueWithKnownSeason } from "../ingestion/hierarchy.ingestion.service";

async function main() {
  console.log("Iniciando ingestão da Bundesliga (league=82, season=25646)...");
  const result = await ingestLeagueWithKnownSeason(82, 25646);
  console.log("Resultado:", JSON.stringify(result, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error("Erro:", e.message);
  process.exit(1);
});
