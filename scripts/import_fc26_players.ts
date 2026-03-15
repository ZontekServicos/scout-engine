import "dotenv/config";
import fs from "fs";
import path from "path";
import csv from "csv-parser";
import { PrismaClient, Prisma } from "@prisma/client";
import { nameToSlug, normalizeName } from "../src/utils/normalizeName";
import { parsePositions } from "../src/utils/positions";

const prisma = new PrismaClient();
const DEFAULT_CSV_PATH = path.resolve(process.cwd(), "dataset", "fc26_players.csv");
const SOURCE = "fc26";

type Fc26CsvRow = {
  player_id?: string;
  short_name?: string;
  long_name?: string;
  player_positions?: string;
  overall?: string;
  potential?: string;
  value_eur?: string;
  age?: string;
  league_name?: string;
  club_name?: string;
  nationality_name?: string;
  player_face_url?: string;
  pace?: string;
  shooting?: string;
  passing?: string;
  dribbling?: string;
  defending?: string;
  physic?: string;
  attacking_crossing?: string;
  attacking_finishing?: string;
  attacking_heading_accuracy?: string;
  attacking_short_passing?: string;
  attacking_volleys?: string;
  skill_dribbling?: string;
  skill_curve?: string;
  skill_fk_accuracy?: string;
  skill_long_passing?: string;
  skill_ball_control?: string;
  movement_acceleration?: string;
  movement_sprint_speed?: string;
  movement_agility?: string;
  movement_reactions?: string;
  movement_balance?: string;
  power_shot_power?: string;
  power_jumping?: string;
  power_stamina?: string;
  power_strength?: string;
  power_long_shots?: string;
  mentality_aggression?: string;
  mentality_interceptions?: string;
  mentality_positioning?: string;
  mentality_vision?: string;
  mentality_penalties?: string;
  mentality_composure?: string;
  defending_marking_awareness?: string;
  defending_standing_tackle?: string;
  defending_sliding_tackle?: string;
  goalkeeping_diving?: string;
  goalkeeping_handling?: string;
  goalkeeping_kicking?: string;
  goalkeeping_positioning?: string;
  goalkeeping_reflexes?: string;
};

type FlatAttributes = {
  pace: number | null;
  shooting: number | null;
  passing: number | null;
  dribbling: number | null;
  defending: number | null;
  physical: number | null;
  crossing: number | null;
  finishing: number | null;
  headingAccuracy: number | null;
  shortPassing: number | null;
  volleys: number | null;
  curve: number | null;
  fkAccuracy: number | null;
  longPassing: number | null;
  ballControl: number | null;
  acceleration: number | null;
  sprintSpeed: number | null;
  agility: number | null;
  reactions: number | null;
  balance: number | null;
  shotPower: number | null;
  jumping: number | null;
  stamina: number | null;
  strength: number | null;
  longShots: number | null;
  aggression: number | null;
  interceptions: number | null;
  attackPosition: number | null;
  vision: number | null;
  penalties: number | null;
  composure: number | null;
  defensiveAwareness: number | null;
  standingTackle: number | null;
  slidingTackle: number | null;
  gkDiving: number | null;
  gkHandling: number | null;
  gkKicking: number | null;
  gkPositioning: number | null;
  gkReflexes: number | null;
};

type ImportStats = {
  processed: number;
  created: number;
  updated: number;
  skipped: number;
};

function parseOptionalInt(value: unknown): number | null {
  if (value == null) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function clampRating(value: number | null) {
  if (!Number.isFinite(value)) return null;
  return Math.max(1, Math.min(99, Math.round(Number(value))));
}

function parseOptionalFloat(value: unknown): number | null {
  if (value == null) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function compactObject<T extends Record<string, number | null>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => typeof item === "number" && Number.isFinite(item)),
  ) as Record<string, number>;
}

function buildAttributes(row: Fc26CsvRow, overall: number | null, potential: number | null) {
  const flat: FlatAttributes = {
    pace: clampRating(parseOptionalInt(row.pace)),
    shooting: clampRating(parseOptionalInt(row.shooting)),
    passing: clampRating(parseOptionalInt(row.passing)),
    dribbling: clampRating(parseOptionalInt(row.dribbling) ?? parseOptionalInt(row.skill_dribbling)),
    defending: clampRating(parseOptionalInt(row.defending)),
    physical: clampRating(parseOptionalInt(row.physic)),
    crossing: clampRating(parseOptionalInt(row.attacking_crossing)),
    finishing: clampRating(parseOptionalInt(row.attacking_finishing)),
    headingAccuracy: clampRating(parseOptionalInt(row.attacking_heading_accuracy)),
    shortPassing: clampRating(parseOptionalInt(row.attacking_short_passing)),
    volleys: clampRating(parseOptionalInt(row.attacking_volleys)),
    curve: clampRating(parseOptionalInt(row.skill_curve)),
    fkAccuracy: clampRating(parseOptionalInt(row.skill_fk_accuracy)),
    longPassing: clampRating(parseOptionalInt(row.skill_long_passing)),
    ballControl: clampRating(parseOptionalInt(row.skill_ball_control)),
    acceleration: clampRating(parseOptionalInt(row.movement_acceleration)),
    sprintSpeed: clampRating(parseOptionalInt(row.movement_sprint_speed)),
    agility: clampRating(parseOptionalInt(row.movement_agility)),
    reactions: clampRating(parseOptionalInt(row.movement_reactions)),
    balance: clampRating(parseOptionalInt(row.movement_balance)),
    shotPower: clampRating(parseOptionalInt(row.power_shot_power)),
    jumping: clampRating(parseOptionalInt(row.power_jumping)),
    stamina: clampRating(parseOptionalInt(row.power_stamina)),
    strength: clampRating(parseOptionalInt(row.power_strength)),
    longShots: clampRating(parseOptionalInt(row.power_long_shots)),
    aggression: clampRating(parseOptionalInt(row.mentality_aggression)),
    interceptions: clampRating(parseOptionalInt(row.mentality_interceptions)),
    attackPosition: clampRating(parseOptionalInt(row.mentality_positioning)),
    vision: clampRating(parseOptionalInt(row.mentality_vision)),
    penalties: clampRating(parseOptionalInt(row.mentality_penalties)),
    composure: clampRating(parseOptionalInt(row.mentality_composure)),
    defensiveAwareness: clampRating(parseOptionalInt(row.defending_marking_awareness)),
    standingTackle: clampRating(parseOptionalInt(row.defending_standing_tackle)),
    slidingTackle: clampRating(parseOptionalInt(row.defending_sliding_tackle)),
    gkDiving: clampRating(parseOptionalInt(row.goalkeeping_diving)),
    gkHandling: clampRating(parseOptionalInt(row.goalkeeping_handling)),
    gkKicking: clampRating(parseOptionalInt(row.goalkeeping_kicking)),
    gkPositioning: clampRating(parseOptionalInt(row.goalkeeping_positioning)),
    gkReflexes: clampRating(parseOptionalInt(row.goalkeeping_reflexes)),
  };

  const core = compactObject({
    pace: flat.pace,
    shooting: flat.shooting,
    passing: flat.passing,
    dribbling: flat.dribbling,
    defending: flat.defending,
    physical: flat.physical,
  });

  return {
    ...compactObject(flat),
    core,
    attacking: compactObject({
      crossing: flat.crossing,
      finishing: flat.finishing,
      headingAccuracy: flat.headingAccuracy,
      shortPassing: flat.shortPassing,
      volleys: flat.volleys,
    }),
    skill: compactObject({
      dribbling: flat.dribbling,
      curve: flat.curve,
      fkAccuracy: flat.fkAccuracy,
      longPassing: flat.longPassing,
      ballControl: flat.ballControl,
    }),
    movement: compactObject({
      acceleration: flat.acceleration,
      sprintSpeed: flat.sprintSpeed,
      agility: flat.agility,
      reactions: flat.reactions,
      balance: flat.balance,
    }),
    power: compactObject({
      shotPower: flat.shotPower,
      jumping: flat.jumping,
      stamina: flat.stamina,
      strength: flat.strength,
      longShots: flat.longShots,
    }),
    mentality: compactObject({
      aggression: flat.aggression,
      interceptions: flat.interceptions,
      attackPosition: flat.attackPosition,
      vision: flat.vision,
      penalties: flat.penalties,
      composure: flat.composure,
    }),
    defending: compactObject({
      defensiveAwareness: flat.defensiveAwareness,
      standingTackle: flat.standingTackle,
      slidingTackle: flat.slidingTackle,
    }),
    goalkeeping: compactObject({
      diving: flat.gkDiving,
      handling: flat.gkHandling,
      kicking: flat.gkKicking,
      positioning: flat.gkPositioning,
      reflexes: flat.gkReflexes,
    }),
    overall,
    potential,
    source: SOURCE,
  };
}

function resolveCsvPath() {
  const inputPath = process.argv[2];
  return path.resolve(process.cwd(), inputPath ?? DEFAULT_CSV_PATH);
}

async function upsertPlayer(row: Fc26CsvRow, stats: ImportStats) {
  const externalId = String(row.player_id ?? "").trim() || null;
  const name = String(row.long_name ?? "").trim() || String(row.short_name ?? "").trim();
  const positions = parsePositions(String(row.player_positions ?? ""));
  const primaryPosition = positions[0] ?? null;
  const age = parseOptionalInt(row.age);

  if (!externalId || !name || !primaryPosition || !age) {
    stats.skipped += 1;
    return;
  }

  const overall = clampRating(parseOptionalInt(row.overall));
  const potential = clampRating(parseOptionalInt(row.potential));
  const marketValue = parseOptionalFloat(row.value_eur);
  const imagePath = String(row.player_face_url ?? "").trim() || null;
  const payload: Prisma.PlayerUncheckedCreateInput = {
    slug: nameToSlug(name),
    name,
    nameNormalized: normalizeName(name),
    source: SOURCE,
    externalId,
    positions,
    age,
    nationality: String(row.nationality_name ?? "").trim() || "Unknown",
    team: String(row.club_name ?? "").trim() || null,
    league: String(row.league_name ?? "").trim() || null,
    imagePath,
    marketValue,
    overall,
    potential,
    contractEnd: null,
    attributes: buildAttributes(row, overall, potential),
    archetype: {
      role: `Imported ${primaryPosition}`,
      source: SOURCE,
    },
  };

  const existing = await prisma.player.findFirst({
    where: {
      OR: [
        { source: SOURCE, externalId },
        { slug: payload.slug },
      ],
    },
    select: { id: true },
  });

  if (existing) {
    await prisma.player.update({
      where: { id: existing.id },
      data: payload,
    });
    stats.updated += 1;
    return;
  }

  await prisma.player.create({ data: payload });
  stats.created += 1;
}

async function main() {
  const csvPath = resolveCsvPath();
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV FC26 não encontrado em: ${csvPath}`);
  }

  const stats: ImportStats = {
    processed: 0,
    created: 0,
    updated: 0,
    skipped: 0,
  };

  await new Promise<void>((resolve, reject) => {
    const stream = fs.createReadStream(csvPath).pipe(csv());

    stream
      .on("data", (row: Fc26CsvRow) => {
        stream.pause();
        stats.processed += 1;

        upsertPlayer(row, stats)
          .then(() => {
            if (stats.processed % 500 === 0) {
              console.log(
                `[fc26] processed=${stats.processed} created=${stats.created} updated=${stats.updated} skipped=${stats.skipped}`,
              );
            }
            stream.resume();
          })
          .catch(reject);
      })
      .on("end", resolve)
      .on("error", reject);
  });

  console.log(
    `[fc26] finished processed=${stats.processed} created=${stats.created} updated=${stats.updated} skipped=${stats.skipped}`,
  );
}

main()
  .catch((error) => {
    console.error("[fc26] import error", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
