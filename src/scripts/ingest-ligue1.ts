import { ingestLeagueWithKnownSeason } from "../ingestion/hierarchy.ingestion.service";

async function main() {
  console.log("Iniciando ingestão da Ligue 1 (league=301, season=25651)...");
  const result = await ingestLeagueWithKnownSeason(301, 25651);
  console.log("Resultado:", JSON.stringify(result, null, 2));
  process.exit(0);
}

main().catch((e) => {
  console.error("Erro:", e.message);
  process.exit(1);
});
