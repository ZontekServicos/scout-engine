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

  acceleration?: string;
  sprint_speed?: string;
  agility?: string;
  balance?: string;
  reactions?: string;

  finishing?: string;
  heading_accuracy?: string;
  volleys?: string;
  short_passing?: string;

  dribbling?: string;
  curve?: string;
  fk_accuracy?: string;
  ball_control?: string;

  shot_power?: string;
  jumping?: string;
  stamina?: string;
  strength?: string;
  long_shots?: string;

  aggression?: string;
  interceptions?: string;
  positioning?: string;
  vision?: string;
  penalties?: string;
  composure?: string;

  standing_tackle?: string;
  sliding_tackle?: string;
  defensive_awareness?: string;
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

  // 🧹 LIMPA COMPLETAMENTE A TABELA PLAYER
  await prisma.player.deleteMany();

  let buffer: any[] = [];

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
          if (!Number.isFinite(age) || age <= 0) {
            skipped += 1;
            return;
          }

          const nationality = String(row.nationality ?? "Unknown").trim() || "Unknown";

          const overall = row.overall ? Number(row.overall) : null;
          const potential = row.potential ? Number(row.potential) : null;
          const marketValue = row.value_eur ? Number(row.value_eur) : null;

          const team = row.club_name ? String(row.club_name).trim() : null;
          const league = row.league_name ? String(row.league_name).trim() : null;

          const normalizedName = normalizeName(name);
          const slug = nameToSlug(name);

          const attributes = {
            attacking: {
              finishing: Number(row.finishing ?? 50),
              headingAccuracy: Number(row.heading_accuracy ?? 50),
              volleys: Number(row.volleys ?? 50),
              shortPassing: Number(row.short_passing ?? 50),
            },

            skill: {
              dribbling: Number(row.dribbling ?? 50),
              curve: Number(row.curve ?? 50),
              fkAccuracy: Number(row.fk_accuracy ?? 50),
              ballControl: Number(row.ball_control ?? 50),
            },

            movement: {
              acceleration: Number(row.acceleration ?? 50),
              sprintSpeed: Number(row.sprint_speed ?? 50),
              agility: Number(row.agility ?? 50),
              balance: Number(row.balance ?? 50),
              reactions: Number(row.reactions ?? 50),
            },

            power: {
              shotPower: Number(row.shot_power ?? 50),
              jumping: Number(row.jumping ?? 50),
              stamina: Number(row.stamina ?? 50),
              strength: Number(row.strength ?? 50),
              longShots: Number(row.long_shots ?? 50),
            },

            mentality: {
              aggression: Number(row.aggression ?? 50),
              interceptions: Number(row.interceptions ?? 50),
              positioning: Number(row.positioning ?? 50),
              vision: Number(row.vision ?? 50),
              penalties: Number(row.penalties ?? 50),
              composure: Number(row.composure ?? 50),
            },

            defending: {
              defensiveAwareness: Number(row.defensive_awareness ?? 50),
              standingTackle: Number(row.standing_tackle ?? 50),
              slidingTackle: Number(row.sliding_tackle ?? 50),
            },

            overall: overall ?? 50,
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
