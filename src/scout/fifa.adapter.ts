import { NormalizedAttributes } from "./attribute.adapter";

export type RawFifaStats = {
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

export function adaptToFifaStats(attributes: NormalizedAttributes): RawFifaStats {
  return {
    speed: attributes.pace,
    acceleration: attributes.pace,

    finishing: attributes.shooting,
    shotPower: attributes.shooting,

    shortPass: attributes.passing,
    longPass: attributes.passing,

    dribble: attributes.dribbling,
    ballControl: attributes.dribbling,

    tackle: attributes.defending,

    strength: attributes.physical,
    stamina: attributes.physical,
  };
}
