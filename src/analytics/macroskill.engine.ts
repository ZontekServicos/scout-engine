/**
 * macroskill.engine.ts
 *
 * MacroSkill Score — Pilar 1 do Overall SoccerMind v2 (peso 50%).
 *
 * Usa os 6 blocos de atributo já calculados pelo v1 e armazenados no Player:
 *   overallPace · overallShooting · overallPassing
 *   overallDribbling · overallDefending · overallPhysical
 *
 * Quando esses campos existem no banco (jogadores enriquecidos), o score é
 * preciso. Quando não existem (jogadores sem stats), cai no default 50.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MacroSkills {
  pace:      number;  // 0–100
  shooting:  number;  // 0–100
  passing:   number;  // 0–100
  dribbling: number;  // 0–100
  defending: number;  // 0–100
  physical:  number;  // 0–100
}

/** Subset of the Player model fields used to derive MacroSkills. */
export interface MacroSkillInput {
  // Pre-calculated blocks (preferred — already in DB)
  overallPace?:       number | null;
  overallShooting?:   number | null;
  overallPassing?:    number | null;
  overallDribbling?:  number | null;
  overallDefending?:  number | null;
  overallPhysical?:   number | null;
}

/** Position-specific weights that blend the 6 macro blocks into a single score. */
interface BlockWeights {
  pace:      number;
  shooting:  number;
  passing:   number;
  dribbling: number;
  defending: number;
  physical:  number;
}

// ---------------------------------------------------------------------------
// Position weight table (mirrors overall.engine.ts BLOCK_WEIGHTS for consistency)
// ---------------------------------------------------------------------------

const POSITION_WEIGHTS: Record<string, BlockWeights> = {
  GK:  { pace: 0.05, shooting: 0.02, passing: 0.18, dribbling: 0.05, defending: 0.45, physical: 0.25 },
  SW:  { pace: 0.10, shooting: 0.05, passing: 0.18, dribbling: 0.08, defending: 0.38, physical: 0.21 },
  CB:  { pace: 0.12, shooting: 0.05, passing: 0.15, dribbling: 0.08, defending: 0.38, physical: 0.22 },
  FB:  { pace: 0.22, shooting: 0.08, passing: 0.20, dribbling: 0.15, defending: 0.22, physical: 0.13 },
  WB:  { pace: 0.24, shooting: 0.10, passing: 0.18, dribbling: 0.18, defending: 0.18, physical: 0.12 },
  CDM: { pace: 0.10, shooting: 0.08, passing: 0.22, dribbling: 0.12, defending: 0.28, physical: 0.20 },
  CM:  { pace: 0.12, shooting: 0.12, passing: 0.28, dribbling: 0.18, defending: 0.15, physical: 0.15 },
  MEZ: { pace: 0.15, shooting: 0.14, passing: 0.24, dribbling: 0.20, defending: 0.12, physical: 0.15 },
  WM:  { pace: 0.20, shooting: 0.12, passing: 0.20, dribbling: 0.22, defending: 0.14, physical: 0.12 },
  CAM: { pace: 0.15, shooting: 0.20, passing: 0.25, dribbling: 0.22, defending: 0.08, physical: 0.10 },
  W:   { pace: 0.25, shooting: 0.20, passing: 0.15, dribbling: 0.25, defending: 0.05, physical: 0.10 },
  SS:  { pace: 0.18, shooting: 0.26, passing: 0.16, dribbling: 0.22, defending: 0.06, physical: 0.12 },
  CF:  { pace: 0.16, shooting: 0.28, passing: 0.14, dribbling: 0.18, defending: 0.06, physical: 0.18 },
  ST:  { pace: 0.20, shooting: 0.30, passing: 0.10, dribbling: 0.20, defending: 0.05, physical: 0.15 },
};

const DEFAULT_WEIGHTS = POSITION_WEIGHTS["CM"];

// Lazy import to avoid circular dependency — overall.engine imports nothing from here
let _classifyPosition: ((raw: string | null | undefined) => string) | null = null;
function getWeights(position: string): BlockWeights {
  if (!_classifyPosition) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    _classifyPosition = require("./overall.engine").classifyPosition;
  }
  const group = _classifyPosition!(position);
  return POSITION_WEIGHTS[group] ?? DEFAULT_WEIGHTS;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Reads the 6 pre-calculated block fields from the Player model.
 * Any missing field defaults to 50 (league average).
 */
export function extractMacroSkills(input: MacroSkillInput): MacroSkills {
  return {
    pace:      clamp(input.overallPace      ?? 50, 0, 100),
    shooting:  clamp(input.overallShooting  ?? 50, 0, 100),
    passing:   clamp(input.overallPassing   ?? 50, 0, 100),
    dribbling: clamp(input.overallDribbling ?? 50, 0, 100),
    defending: clamp(input.overallDefending ?? 50, 0, 100),
    physical:  clamp(input.overallPhysical  ?? 50, 0, 100),
  };
}

/**
 * Weighted composite of the 6 macro blocks for the given position.
 * Returns 0–100.
 */
export function calculateMacroSkillScore(
  macros: MacroSkills,
  position: string,
): number {
  const w = getWeights(position);
  return clamp(
    macros.pace      * w.pace      +
    macros.shooting  * w.shooting  +
    macros.passing   * w.passing   +
    macros.dribbling * w.dribbling +
    macros.defending * w.defending +
    macros.physical  * w.physical,
    0, 100,
  );
}
