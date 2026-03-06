type OverallInput = {
  position: string;
  performanceScore: number;
  categoryIndex: Record<string, number>;
  macroOverall: number;
  fifaAttributes: {
    pace: number;
    shooting: number;
    passing: number;
    dribbling: number;
    defending: number;
    physical: number;
  };
  rawAttributes?: any;
};

type FifaDetailedStats = {
  attacking: {
    crossing: number;
    finishing: number;
    headingAccuracy: number;
    shortPassing: number;
    volleys: number;
  };
  skill: {
    dribbling: number;
    curve: number;
    fkAccuracy: number;
    longPassing: number;
    ballControl: number;
  };
  movement: {
    acceleration: number;
    sprintSpeed: number;
    agility: number;
    reactions: number;
    balance: number;
  };
  power: {
    shotPower: number;
    jumping: number;
    stamina: number;
    strength: number;
    longShots: number;
  };
  mentality: {
    aggression: number;
    interceptions: number;
    attackPosition: number;
    vision: number;
    penalties: number;
    composure: number;
  };
  defending: {
    defensiveAwareness: number;
    standingTackle: number;
    slidingTackle: number;
  };
  goalkeeping: {
    diving: number;
    handling: number;
    kicking: number;
    positioning: number;
    reflexes: number;
  };
};

export type OverallResult = {
  overall: number;
  tier: "ELITE" | "A" | "B" | "C" | "DEVELOPMENT";
  positionRank: string;
  fifaStyle: {
    overall: number;
    categories: {
      attacking: number;
      skill: number;
      movement: number;
      power: number;
      mentality: number;
      defending: number;
      goalkeeping: number;
    };
    core: {
      pace: number;
      shooting: number;
      passing: number;
      dribbling: number;
      defending: number;
      physical: number;
    };
    detailedStats: FifaDetailedStats;
  };
};

function averageCategoryIndex(categoryIndex: Record<string, number>) {
  const values = Object.values(categoryIndex);
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function clamp(value: number, min = 1, max = 99): number {
  return Math.max(min, Math.min(max, value));
}

function safeNumber(value: any, fallback = 50): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function pickStat(raw: any, keys: string[], fallback = 50): number {
  for (const key of keys) {
    const value = raw?.[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  return fallback;
}

function avg(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

function determineTier(overall: number): OverallResult["tier"] {
  if (overall >= 85) return "ELITE";
  if (overall >= 80) return "A";
  if (overall >= 75) return "B";
  if (overall >= 70) return "C";
  return "DEVELOPMENT";
}

function determinePositionRank(position: string, tier: OverallResult["tier"]) {
  return `${tier} Tier ${position}`;
}

function buildDetailedStats(rawAttributes: any, fifaAttributes: OverallInput["fifaAttributes"]): FifaDetailedStats {
  const raw = rawAttributes ?? {};

  const attacking = {
    crossing: pickStat(raw, ["crossing"], fifaAttributes.passing),
    finishing: pickStat(raw, ["finishing"], fifaAttributes.shooting),
    headingAccuracy: pickStat(raw, ["headingAccuracy", "heading"], fifaAttributes.physical),
    shortPassing: pickStat(raw, ["shortPassing", "shortPass"], fifaAttributes.passing),
    volleys: pickStat(raw, ["volleys"], fifaAttributes.shooting),
  };

  const skill = {
    dribbling: pickStat(raw, ["dribbling", "dribble"], fifaAttributes.dribbling),
    curve: pickStat(raw, ["curve"], fifaAttributes.passing),
    fkAccuracy: pickStat(raw, ["fkAccuracy", "freeKickAccuracy"], fifaAttributes.passing),
    longPassing: pickStat(raw, ["longPassing", "longPass"], fifaAttributes.passing),
    ballControl: pickStat(raw, ["ballControl"], fifaAttributes.dribbling),
  };

  const movement = {
    acceleration: pickStat(raw, ["acceleration"], fifaAttributes.pace),
    sprintSpeed: pickStat(raw, ["sprintSpeed", "speed"], fifaAttributes.pace),
    agility: pickStat(raw, ["agility"], fifaAttributes.dribbling),
    reactions: pickStat(raw, ["reactions"], fifaAttributes.pace),
    balance: pickStat(raw, ["balance"], fifaAttributes.dribbling),
  };

  const power = {
    shotPower: pickStat(raw, ["shotPower"], fifaAttributes.shooting),
    jumping: pickStat(raw, ["jumping"], fifaAttributes.physical),
    stamina: pickStat(raw, ["stamina"], fifaAttributes.physical),
    strength: pickStat(raw, ["strength"], fifaAttributes.physical),
    longShots: pickStat(raw, ["longShots"], fifaAttributes.shooting),
  };

  const mentality = {
    aggression: pickStat(raw, ["aggression"], fifaAttributes.physical),
    interceptions: pickStat(raw, ["interceptions"], fifaAttributes.defending),
    attackPosition: pickStat(raw, ["attackPosition", "positioning"], fifaAttributes.shooting),
    vision: pickStat(raw, ["vision"], fifaAttributes.passing),
    penalties: pickStat(raw, ["penalties"], fifaAttributes.shooting),
    composure: pickStat(raw, ["composure"], fifaAttributes.passing),
  };

  const defending = {
    defensiveAwareness: pickStat(raw, ["defensiveAwareness"], fifaAttributes.defending),
    standingTackle: pickStat(raw, ["standingTackle", "tackle"], fifaAttributes.defending),
    slidingTackle: pickStat(raw, ["slidingTackle"], fifaAttributes.defending),
  };

  const goalkeeping = {
    diving: pickStat(raw, ["gkDiving"], 10),
    handling: pickStat(raw, ["gkHandling"], 10),
    kicking: pickStat(raw, ["gkKicking"], 10),
    positioning: pickStat(raw, ["gkPositioning"], 10),
    reflexes: pickStat(raw, ["gkReflexes"], 10),
  };

  return {
    attacking,
    skill,
    movement,
    power,
    mentality,
    defending,
    goalkeeping,
  };
}

export function calculateOverallRating(input: OverallInput): OverallResult {
  const { position, performanceScore, categoryIndex, macroOverall, fifaAttributes, rawAttributes } = input;

  const categoryAverage = averageCategoryIndex(categoryIndex);
  const fifaCoreAverage =
    (safeNumber(fifaAttributes.pace) +
      safeNumber(fifaAttributes.shooting) +
      safeNumber(fifaAttributes.passing) +
      safeNumber(fifaAttributes.dribbling) +
      safeNumber(fifaAttributes.defending) +
      safeNumber(fifaAttributes.physical)) /
    6;

  const overallRaw =
    performanceScore * 0.5 + categoryAverage * 0.2 + macroOverall * 0.1 + fifaCoreAverage * 0.2;

  const overall = clamp(Math.round(overallRaw));

  const tier = determineTier(overall);

  const positionRank = determinePositionRank(position, tier);
  const detailedStats = buildDetailedStats(rawAttributes, fifaAttributes);

  const categories = {
    attacking: clamp(Math.round(avg(Object.values(detailedStats.attacking)))),
    skill: clamp(Math.round(avg(Object.values(detailedStats.skill)))),
    movement: clamp(Math.round(avg(Object.values(detailedStats.movement)))),
    power: clamp(Math.round(avg(Object.values(detailedStats.power)))),
    mentality: clamp(Math.round(avg(Object.values(detailedStats.mentality)))),
    defending: clamp(Math.round(avg(Object.values(detailedStats.defending)))),
    goalkeeping: clamp(Math.round(avg(Object.values(detailedStats.goalkeeping)))),
  };

  return {
    overall,
    tier,
    positionRank,
    fifaStyle: {
      overall,
      categories,
      core: {
        pace: clamp(Math.round(safeNumber(fifaAttributes.pace))),
        shooting: clamp(Math.round(safeNumber(fifaAttributes.shooting))),
        passing: clamp(Math.round(safeNumber(fifaAttributes.passing))),
        dribbling: clamp(Math.round(safeNumber(fifaAttributes.dribbling))),
        defending: clamp(Math.round(safeNumber(fifaAttributes.defending))),
        physical: clamp(Math.round(safeNumber(fifaAttributes.physical))),
      },
      detailedStats,
    },
  };
}
