import { Weights } from "./ranking.engine";

export const POSITION_WEIGHTS: Record<string, Weights> = {
  ST: {
    shooting: 0.4,
    pace: 0.3,
    dribbling: 0.2,
    physical: 0.1,
  },

  LW: {
    pace: 0.35,
    dribbling: 0.3,
    shooting: 0.2,
    passing: 0.15,
  },

  RW: {
    pace: 0.35,
    dribbling: 0.3,
    shooting: 0.2,
    passing: 0.15,
  },

  CM: {
    passing: 0.3,
    dribbling: 0.25,
    pace: 0.2,
    defending: 0.15,
    physical: 0.1,
  },

  CDM: {
    defending: 0.35,
    passing: 0.25,
    physical: 0.2,
    pace: 0.2,
  },

  CB: {
    defending: 0.4,
    physical: 0.3,
    pace: 0.2,
    passing: 0.1,
  },

  LB: {
    pace: 0.3,
    defending: 0.3,
    passing: 0.2,
    dribbling: 0.2,
  },

  RB: {
    pace: 0.3,
    defending: 0.3,
    passing: 0.2,
    dribbling: 0.2,
  },

  GK: {
    defending: 0.45,
    passing: 0.2,
    physical: 0.2,
    pace: 0.1,
    dribbling: 0.05,
  },

  LWB: {
    pace: 0.3,
    passing: 0.25,
    dribbling: 0.2,
    defending: 0.15,
    physical: 0.1,
  },

  RWB: {
    pace: 0.3,
    passing: 0.25,
    dribbling: 0.2,
    defending: 0.15,
    physical: 0.1,
  },

  CAM: {
    passing: 0.3,
    dribbling: 0.25,
    shooting: 0.2,
    pace: 0.15,
    physical: 0.1,
  },

  LM: {
    pace: 0.3,
    passing: 0.25,
    dribbling: 0.2,
    shooting: 0.15,
    defending: 0.1,
  },

  RM: {
    pace: 0.3,
    passing: 0.25,
    dribbling: 0.2,
    shooting: 0.15,
    defending: 0.1,
  },

  CF: {
    shooting: 0.3,
    dribbling: 0.25,
    passing: 0.2,
    pace: 0.15,
    physical: 0.1,
  },
};
export const GLOBAL_WEIGHTS = {
  pace: 0.2,
  shooting: 0.2,
  passing: 0.2,
  dribbling: 0.15,
  defending: 0.15,
  physical: 0.1,
};
