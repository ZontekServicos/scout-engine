import { prisma } from "../lib/prisma";
import { smGet } from "../integrations/sportmonks/sportmonks.client";

const SEASON_EXTERNAL_ID = 26763;
const SEASON_UUID = "533ec602-c0ca-45b4-8f08-4747ac92a49b";

interface SportmonksFixture {
  id: number;
  name?: string;
  starting_at?: string;
  result_info?: string;
  state?: { developer_name?: string };
  localteam_id?: number;
  visitorteam_id?: number;
  leg?: string;
  round?: { name?: string };
}

async function main() {
  console.log(`Fetching fixtures for season ${SEASON_EXTERNAL_ID}...`);

  const raw = await smGet<{ data: { fixtures?: SportmonksFixture[] } }>(
    `/seasons/${SEASON_EXTERNAL_ID}`,
    { include: ["fixtures"] },
  );

  const fixtures: SportmonksFixture[] = raw.data?.fixtures ?? [];
  console.log(`Total fixtures from API: ${fixtures.length}`);

  let ingested = 0;
  let skipped = 0;

  for (const f of fixtures) {
    try {
      await prisma.match.upsert({
        where: { externalId: String(f.id) },
        update: {
          status: f.state?.developer_name ?? "UNKNOWN",
          playedAt: f.starting_at ? new Date(f.starting_at) : null,
        },
        create: {
          externalId: String(f.id),
          seasonId: SEASON_UUID,
          status: f.state?.developer_name ?? "UNKNOWN",
          playedAt: f.starting_at ? new Date(f.starting_at) : null,
        },
      });
      ingested++;
    } catch (e: any) {
      console.error(`  Error on fixture ${f.id}: ${e.message}`);
      skipped++;
    }
  }

  console.log(`Done. Ingested: ${ingested}, Skipped/Errors: ${skipped}`);
  process.exit(0);
}

main().catch((e) => { console.error(e.message); process.exit(1); });
