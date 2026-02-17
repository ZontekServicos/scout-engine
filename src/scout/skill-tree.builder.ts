import { normalizeStat } from "./stats-normalizer";

type RawStats = {
  speed: number;
  acceleration: number;
  finishing: number;
  shotPower: number;
  shortPass: number;
  longPass: number;
  dribble: number;
  ballControl: number;
  tackle: number;
  strength: number;
  stamina: number;
};

export function buildFifaAttributes(stats: RawStats) {
  return {
    pace: normalizeStat((stats.speed + stats.acceleration) / 2),
    shooting: normalizeStat((stats.finishing + stats.shotPower) / 2),
    passing: normalizeStat((stats.shortPass + stats.longPass) / 2),
    dribbling: normalizeStat((stats.dribble + stats.ballControl) / 2),
    defending: normalizeStat(stats.tackle),
    physical: normalizeStat((stats.strength + stats.stamina) / 2)
  };
}