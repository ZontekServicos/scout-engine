import fs from "fs";
import csv from "csv-parser";
import { PrismaClient } from "@prisma/client";
import { nameToSlug, normalizeName } from "../utils/normalizeName";
import { parsePositions } from "../utils/positions";

const BATCH_SIZE = 500;

type CsvPlayerRow = {
  short_name?: string;
  player_positions?: string;
  age?: string;
  nationality?: string;
  club_name?: string;
  league_name?: string;
  overall?: string;
  potential?: string;
  value_eur?: string;
};

export type ImportPlayersResult = {
  processed: number;
  inserted: number;
  skipped: number;
  batches: number;
};

type ProgressCallback = (info: {
  processed: number;
  inserted: number;
  skipped: number;
  batches: number;
}) => void;

export async function importPlayersFromCsv(
  prisma: PrismaClient,
  csvFilePath: string,
  onProgress?: ProgressCallback,
): Promise<ImportPlayersResult> {
  let processed = 0;
  let inserted = 0;
  let skipped = 0;
  let batches = 0;

  await prisma.player.deleteMany({
    where: {
      name: {
        startsWith: "Player ",
      },
    },
  });

  let buffer: Array<{
    slug: string;
    name: string;
    nameNormalized: string;
    positions: string[];
    age: number;
    nationality: string;
    team: string | null;
    league: string | null;
    marketValue: number | null;
    contractEnd: Date | null;
    overall: number | null;
    potential: number | null;
    attributes: any;
    archetype: any;
  }> = [];

  async function flushBuffer() {
    if (!buffer.length) return;

    const result = await prisma.player.createMany({
      data: buffer,
      skipDuplicates: true,
    });

    inserted += result.count;
    skipped += buffer.length - result.count;
    batches += 1;
    buffer = [];

    onProgress?.({ processed, inserted, skipped, batches });
  }

  await new Promise<void>((resolve, reject) => {
    const parser = fs.createReadStream(csvFilePath).pipe(csv());

    parser
      .on("data", async (row: CsvPlayerRow) => {
        try {
          processed += 1;

          const name = String(row.short_name ?? "").trim();
          if (!name) {
            skipped += 1;
            return;
          }

          const positions = parsePositions(String(row.player_positions ?? "CM"));
          if (!positions.length) {
            skipped += 1;
            return;
          }

          const age = Number(row.age ?? 0);
          const nationality = String(row.nationality ?? "Unknown").trim() || "Unknown";
          const overall = row.overall ? Number(row.overall) : null;
          const potential = row.potential ? Number(row.potential) : null;
          const marketValue = row.value_eur ? Number(row.value_eur) : null;
          const team = row.club_name ? String(row.club_name).trim() : null;
          const league = row.league_name ? String(row.league_name).trim() : null;

          /**
           * Se idade vier inválida, descartamos registro para manter qualidade do dado.
           */
          if (!Number.isFinite(age) || age <= 0) {
            skipped += 1;
            return;
          }

          const normalizedName = normalizeName(name);
          const slug = nameToSlug(name);

          const base = Math.max(35, Math.min(99, overall ?? 60));
          const attributes = {
            pace: base,
            shooting: base,
            passing: base,
            dribbling: base,
            defending: base,
            physical: base,
            overall: overall ?? base,
          };

          const archetype = {
            role: `Imported ${positions[0]}`,
          };

          buffer.push({
            slug,
            name,
            nameNormalized: normalizedName,
            positions,
            age,
            nationality,
            team,
            league,
            marketValue,
            contractEnd: null,
            overall,
            potential,
            attributes,
            archetype,
          });

          if (buffer.length >= BATCH_SIZE) {
            parser.pause();
            flushBuffer()
              .then(() => parser.resume())
              .catch(reject);
          }
        } catch (error) {
          reject(error);
        }
      })
      .on("end", () => {
        flushBuffer().then(resolve).catch(reject);
      })
      .on("error", reject);
  });

  return { processed, inserted, skipped, batches };
}
