import { ingestMatchesBySeason } from "../ingestion/match.ingestion.service";

const SEASON_EXTERNAL_ID = 26763;

async function main() {
  console.log(`Ingesting matches for Brasileirão season ${SEASON_EXTERNAL_ID}...`);
  const matches = await ingestMatchesBySeason(SEASON_EXTERNAL_ID);
  console.log(`Done. Ingested ${matches.length} matches.`);
  process.exit(0);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
