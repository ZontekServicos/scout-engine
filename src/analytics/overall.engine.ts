/**
 * overall.engine.ts
 *
 * Position-aware overall rating calculator (1–99 scale).
 * Includes DNA scoring: Impact · Intelligence · DefensiveIQ · Consistency · Potential
 *
 * POSITION GROUPS (14 archetypes — matches full Sportmonks taxonomy)
 * ─────────────────────────────────────────────────────────────────────
 *   GK   Goalkeeper
 *   SW   Sweeper / Libero
 *   CB   Centre-Back
 *   FB   Full-Back (LB / RB)
 *   WB   Wing-Back (LWB / RWB) — more offensive than FB
 *   CDM  Defensive Midfielder / Deep-Lying Playmaker / Holding
 *   CM   Central Midfielder / Box-to-Box
 *   MEZ  Mezzala — interior runner bridging CDM and CAM
 *   WM   Wide Midfielder (LM / RM) — defensive wide player
 *   CAM  Attacking Midfielder / Advanced Playmaker / No. 10
 *   W    Winger (LW / RW) — wide attacker, primary dribbler
 *   SS   Second Striker / False 9 / Shadow Striker
 *   CF   Centre-Forward — target man / link-up forward
 *   ST   Striker — pure goal scorer
 *
 * METHODOLOGY
 * ─────────────────────────────────────────────────────────────────────
 *   1. All counting stats → per-90-minute rates (fair across playing time).
 *   2. Each metric scored 0–100 via two-anchor benchmarks (average / elite).
 *   3. Six attribute BLOCKS: Pace · Shooting · Passing · Dribbling ·
 *      Defending · Physical. GKs get five dedicated blocks.
 *   4. Each position profile weights the blocks differently.
 *   5. API rating (0–10 scale) adds a 12 % bonus/penalty.
 *   6. < 450 min → soft reliability penalty; no stats → null.
 *
 * LEAGUE CONTEXT (volume-stat scaling)
 * ─────────────────────────────────────────────────────────────────────
 *   Brazilian leagues have lower per-90 counting stats than European top-5.
 *   The leagueContext parameter scales the "avg" and "elite" anchors for
 *   volume (per-90) benchmarks so players are evaluated fairly for their league.
 *   Percentage-based benchmarks (pass accuracy, duel win rates, etc.) are
 *   NOT scaled — quality metrics are universal.
 *
 * DNA SCORES (SoccerMind Differentiator)
 * ─────────────────────────────────────────────────────────────────────
 *   Five dimension profile independent of position weight:
 *     impact       — scoring + creation threat (goals, xG, assists, xA, shots)
 *     intelligence — technical decision quality (passes, key passes, prog. passes)
 *     defensiveIQ  — defensive contribution (tackles, interceptions, recoveries)
 *     consistency  — reliability proxy (rating + minutes/appearances ratio)
 *     potential    — age-based ceiling projection (same scale as overall)
 *
 * HOW TO EXTEND
 *   - New Sportmonks position name → add to POSITION_ALIASES below.
 *   - Tune benchmarks → edit the B object.
 *   - New position group → add to PositionGroup union + BLOCK_WEIGHTS.
 */

// ---------------------------------------------------------------------------
// Input / Output types
// ---------------------------------------------------------------------------

export interface StatsInput {
  goals?:              number | null;
  assists?:            number | null;
  shots?:              number | null;
  shotsOnTarget?:      number | null;
  xG?:                 number | null;
  xA?:                 number | null;
  xGChain?:            number | null;
  xGBuildup?:          number | null;
  passes?:             number | null;
  passAccuracy?:       number | null;
  keyPasses?:          number | null;
  progressivePasses?:  number | null;
  longPasses?:         number | null;
  longPassAccuracy?:   number | null;
  crosses?:            number | null;
  crossAccuracy?:      number | null;
  dribblesAttempted?:  number | null;
  dribblesSuccess?:    number | null;
  carries?:            number | null;
  progressiveCarries?: number | null;
  tackles?:            number | null;
  tacklesWon?:         number | null;
  interceptions?:      number | null;
  clearances?:         number | null;
  blocks?:             number | null;
  pressures?:          number | null;
  pressuresSuccess?:   number | null;
  recoveries?:         number | null;
  duelsTotal?:         number | null;
  duelsWon?:           number | null;
  aerialDuelsTotal?:   number | null;
  aerialDuelsWon?:     number | null;
  groundDuelsWon?:     number | null;
  yellowCards?:        number | null;
  redCards?:           number | null;
  foulsCommitted?:     number | null;
  foulsDrawn?:         number | null;
  saves?:              number | null;
  savePct?:            number | null;
  cleanSheets?:        number | null;
  goalsConceded?:      number | null;
  distanceCovered?:    number | null;
  sprints?:            number | null;
  rating?:             number | null;
  minutes?:            number | null;
  appearances?:        number | null;
}

export interface OverallBreakdown {
  pace:       number;  // 0–100
  shooting:   number;
  passing:    number;
  dribbling:  number;
  defending:  number;
  physical:   number;
  // GK-exclusive blocks
  gkDiving?:       number;
  gkHandling?:     number;
  gkKicking?:      number;
  gkReflex?:       number;
  gkPositioning?:  number;
}

/**
 * Five-dimensional profile score — position-agnostic.
 * Reveals WHAT KIND of player they are, while overall reveals HOW GOOD.
 */
export interface DnaScore {
  /** Scoring + creation threat (goals, xG, assists, xA, shots on target) */
  impact:      number;  // 0–100
  /** Technical decision quality (passes, key passes, progressive passes, vision) */
  intelligence: number; // 0–100
  /** Defensive contribution (tackles, interceptions, recoveries, pressures) */
  defensiveIQ: number;  // 0–100
  /** Reliability proxy (Sportmonks rating + minutes/game ratio) */
  consistency: number;  // 0–100
  /** Age-based ceiling projection (1–99, same scale as overall) */
  potential:   number;  // 1–99
}

export interface OverallResult {
  overall:       number;   // 1–99
  breakdown:     OverallBreakdown;
  positionGroup: PositionGroup;
  /** true when player has ≥ MIN_MINUTES_RELIABLE minutes */
  reliable: boolean;
  /** Five-dimensional DNA profile */
  dna: DnaScore;
  /** Age-adjusted ceiling (mirrors dna.potential, convenience field) */
  potential: number;  // 1–99
}

// ---------------------------------------------------------------------------
// League context — scales volume benchmarks for the player's league
// ---------------------------------------------------------------------------

export type LeagueContext = "SERIE_A" | "SERIE_B" | "DEFAULT";

/**
 * Volume (per-90) benchmark scale factors per league.
 * These numbers reflect how Brazilian leagues compare to European top-5:
 *   - Série A averages ~13% lower volume stats than European reference
 *   - Série B averages ~20% lower (weaker squads, lower tempo)
 *
 * Percentage-based stats (accuracy, success rates) are NOT scaled —
 * they reflect quality independent of tempo/volume.
 */
const LEAGUE_VOLUME_SCALE: Record<LeagueContext, number> = {
  SERIE_A: 0.87,
  SERIE_B: 0.80,
  DEFAULT: 1.00,
};

/**
 * Per-90 bench keys that should NOT be scaled even though they're volume stats.
 * Discipline and GK concession are universal standards.
 */
const NO_SCALE_BENCH_KEYS = new Set([
  "foulsCommitted_p90",
  "yellowCards_p90",
  "goalsConceded_p90",
  "rating",
  // percentage benches (already non-volume, listed here for clarity)
  "shotAccuracy",
  "passAccuracy",
  "longPassAccuracy",
  "crossAccuracy",
  "dribbleSuccessRate",
  "tackleSuccessRate",
  "aerialDuelWinRate",
  "groundDuelWinRate",
  "pressureSuccessRate",
  "savePct",
  "cleanSheetRate",
]);

// ---------------------------------------------------------------------------
// Position groups — full Sportmonks taxonomy
// ---------------------------------------------------------------------------

export type PositionGroup =
  | "GK"   // Goalkeeper
  | "SW"   // Sweeper / Libero
  | "CB"   // Centre-Back
  | "FB"   // Full-Back (LB / RB)
  | "WB"   // Wing-Back (LWB / RWB)
  | "CDM"  // Defensive Midfielder / Holding / DLP
  | "CM"   // Central Midfielder / Box-to-Box
  | "MEZ"  // Mezzala
  | "WM"   // Wide Midfielder (LM / RM)
  | "CAM"  // Attacking Midfielder / Playmaker / No. 10
  | "W"    // Winger (LW / RW)
  | "SS"   // Second Striker / False 9 / Shadow Striker
  | "CF"   // Centre-Forward / Target Man
  | "ST"   // Striker (pure goal scorer)
  | "UNKNOWN";

/**
 * Exhaustive alias map — covers every Sportmonks position string we know of,
 * including `position.name`, `detailedPosition.name`, and common abbreviations.
 * Case-insensitive after normalisation.
 */
const POSITION_ALIASES: Record<string, PositionGroup> = {
  // ── Goalkeeper ──────────────────────────────────────────────────────────
  "goalkeeper":                    "GK",
  "gk":                            "GK",
  "keeper":                        "GK",
  "goalie":                        "GK",
  "portero":                       "GK",  // Spanish
  "gardien":                       "GK",  // French

  // ── Sweeper ─────────────────────────────────────────────────────────────
  "sweeper":                       "SW",
  "libero":                        "SW",
  "sw":                            "SW",

  // ── Centre-Back ─────────────────────────────────────────────────────────
  "centre-back":                   "CB",
  "center-back":                   "CB",
  "centre back":                   "CB",
  "center back":                   "CB",
  "centreback":                    "CB",
  "central defender":              "CB",
  "central defence":               "CB",
  "central defense":               "CB",
  "cb":                            "CB",
  "defender":                      "CB",  // generic → fallback to CB

  // ── Full-Back ────────────────────────────────────────────────────────────
  "left back":                     "FB",
  "right back":                    "FB",
  "left-back":                     "FB",
  "right-back":                    "FB",
  "lb":                            "FB",
  "rb":                            "FB",
  "full back":                     "FB",
  "full-back":                     "FB",
  "fullback":                      "FB",
  "left defender":                 "FB",
  "right defender":                "FB",
  "terzino":                       "FB",  // Italian

  // ── Wing-Back ────────────────────────────────────────────────────────────
  "left wing back":                "WB",
  "right wing back":               "WB",
  "left wing-back":                "WB",
  "right wing-back":               "WB",
  "wing back":                     "WB",
  "wing-back":                     "WB",
  "wingback":                      "WB",
  "left wingback":                 "WB",
  "right wingback":                "WB",
  "lwb":                           "WB",
  "rwb":                           "WB",

  // ── Defensive Midfielder ─────────────────────────────────────────────────
  "defensive midfielder":          "CDM",
  "defensive midfield":            "CDM",
  "defensive mid":                 "CDM",
  "holding midfielder":            "CDM",
  "holding midfield":              "CDM",
  "holding mid":                   "CDM",
  "deep-lying playmaker":          "CDM",
  "deep lying playmaker":          "CDM",
  "dlp":                           "CDM",
  "anchor man":                    "CDM",
  "anchor":                        "CDM",
  "cdm":                           "CDM",
  "dm":                            "CDM",
  "pivot":                         "CDM",
  "volante":                       "CDM",  // Portuguese/Spanish
  "regista":                       "CDM",  // Italian playmaking CDM

  // ── Central Midfielder ────────────────────────────────────────────────────
  "central midfielder":            "CM",
  "central midfield":              "CM",
  "central mid":                   "CM",
  "midfielder":                    "CM",  // generic
  "midfield":                      "CM",
  "box-to-box midfielder":         "CM",
  "box to box midfielder":         "CM",
  "box-to-box":                    "CM",
  "centro campista":               "CM",
  "cm":                            "CM",

  // ── Mezzala ───────────────────────────────────────────────────────────────
  "mezzala":                       "MEZ",
  "interior":                      "MEZ",  // Spanish term
  "inside forward midfielder":     "MEZ",
  "half":                          "MEZ",

  // ── Wide Midfielder ───────────────────────────────────────────────────────
  "left midfielder":               "WM",
  "right midfielder":              "WM",
  "wide midfielder":               "WM",
  "wide mid":                      "WM",
  "lm":                            "WM",
  "rm":                            "WM",

  // ── Attacking Midfielder ──────────────────────────────────────────────────
  "attacking midfielder":          "CAM",
  "attacking midfield":            "CAM",
  "attacking mid":                 "CAM",
  "central attacking midfielder":  "CAM",
  "left attacking midfielder":     "CAM",
  "right attacking midfielder":    "CAM",
  "advanced playmaker":            "CAM",
  "playmaker":                     "CAM",
  "trequartista":                  "CAM",  // Italian no. 10
  "enganche":                      "CAM",  // Argentine no. 10
  "fantasista":                    "CAM",
  "no. 10":                        "CAM",
  "number 10":                     "CAM",
  "no.10":                         "CAM",
  "cam":                           "CAM",
  "am":                            "CAM",

  // ── Winger ────────────────────────────────────────────────────────────────
  "left winger":                   "W",
  "right winger":                  "W",
  "left wing":                     "W",
  "right wing":                    "W",
  "winger":                        "W",
  "wide forward":                  "W",
  "wide attacker":                 "W",
  "inverted winger":               "W",
  "inside forward":                "W",
  "inside forward winger":         "W",
  "lw":                            "W",
  "rw":                            "W",
  "ala":                           "W",  // Spanish/Italian

  // ── Second Striker ────────────────────────────────────────────────────────
  "second striker":                "SS",
  "shadow striker":                "SS",
  "false 9":                       "SS",
  "false nine":                    "SS",
  "false9":                        "SS",
  "trequartista forward":          "SS",
  "ss":                            "SS",
  "support striker":               "SS",
  "attacking support":             "SS",

  // ── Centre-Forward ────────────────────────────────────────────────────────
  "centre-forward":                "CF",
  "center-forward":                "CF",
  "centre forward":                "CF",
  "center forward":                "CF",
  "target man":                    "CF",
  "target forward":                "CF",
  "complete forward":              "CF",
  "cf":                            "CF",
  "pressing forward":              "CF",

  // ── Striker ───────────────────────────────────────────────────────────────
  "striker":                       "ST",
  "forward":                       "ST",
  "attacker":                      "ST",
  "poacher":                       "ST",
  "st":                            "ST",
  "centroavante":                  "ST",  // Portuguese
  "delantero":                     "ST",  // Spanish
  "buteur":                        "ST",  // French
};

/** Classify a raw Sportmonks position string to an internal group */
export function classifyPosition(raw: string | null | undefined): PositionGroup {
  if (!raw || raw.trim() === "") return "UNKNOWN";

  const key = raw.trim().toLowerCase();

  // Exact match
  if (key in POSITION_ALIASES) return POSITION_ALIASES[key];

  // Substring fallback (order matters — more specific first)
  if (/false.?9/.test(key))                                     return "SS";
  if (/sweeper|libero/.test(key))                               return "SW";
  if (/wing.?back|wingback/.test(key))                          return "WB";
  if (/goalkeeper|keeper|goalie/.test(key))                     return "GK";
  if (/mezzala|interior midfielder/.test(key))                  return "MEZ";
  if (/second.?striker|shadow.?striker/.test(key))              return "SS";
  if (/deep.?lying/.test(key))                                  return "CDM";
  if (/defensive.?mid|holding.?mid|anchor/.test(key))           return "CDM";
  if (/attacking.?mid|playmaker|trequartista|enganche/.test(key)) return "CAM";
  if (/box.?to.?box/.test(key))                                 return "CM";
  if (/centre.?forward|center.?forward|target.?man/.test(key))  return "CF";
  if (/centre.?back|center.?back|central.?def/.test(key))       return "CB";
  if (/(left|right).?back/.test(key) && !/wing/.test(key))     return "FB";
  if (/(left|right).?wing(?!.?back)/.test(key))                 return "W";
  if (/(left|right).?mid/.test(key))                            return "WM";
  if (/winger|wide.?attacker/.test(key))                        return "W";
  if (/midfielder|midfield/.test(key))                          return "CM";
  if (/striker|forward|attacker/.test(key))                     return "ST";
  if (/defender|back/.test(key))                                return "CB";

  return "UNKNOWN";
}

// ---------------------------------------------------------------------------
// Benchmarks — [avg per 90, elite per 90] (or absolute where noted)
// Calibrated against top-5 European league data (DEFAULT context).
// Brazilian leagues use LEAGUE_VOLUME_SCALE to adjust volume benchmarks.
// ---------------------------------------------------------------------------

interface Bench { avg: number; elite: number; lowerIsBetter?: boolean }

const B: Record<string, Bench> = {
  // Scoring (per 90)
  goals_p90:             { avg: 0.30,  elite: 0.85 },
  assists_p90:           { avg: 0.18,  elite: 0.55 },
  xG_p90:                { avg: 0.25,  elite: 0.75 },
  xA_p90:                { avg: 0.15,  elite: 0.50 },
  xGChain_p90:           { avg: 0.50,  elite: 1.20 },
  xGBuildup_p90:         { avg: 0.20,  elite: 0.70 },

  // Shooting (per 90)
  shots_p90:             { avg: 1.6,   elite: 4.5 },
  shotsOnTarget_p90:     { avg: 0.7,   elite: 2.2 },
  shotAccuracy:          { avg: 40,    elite: 62 },   // %

  // Passing (per 90)
  passes_p90:            { avg: 38,    elite: 85 },
  passAccuracy:          { avg: 77,    elite: 93 },   // %
  keyPasses_p90:         { avg: 0.8,   elite: 2.8 },
  progressivePasses_p90: { avg: 3.0,   elite: 9.5 },
  longPassAccuracy:      { avg: 52,    elite: 76 },   // %
  crosses_p90:           { avg: 1.2,   elite: 5.0 },
  crossAccuracy:         { avg: 22,    elite: 42 },   // %

  // Dribbling (per 90)
  dribblesSuccess_p90:   { avg: 1.0,   elite: 4.0 },
  dribbleSuccessRate:    { avg: 46,    elite: 72 },   // %
  progressiveCarries_p90:{ avg: 2.5,   elite: 9.0 },

  // Defensive (per 90)
  tackles_p90:           { avg: 1.6,   elite: 4.8 },
  tackleSuccessRate:     { avg: 52,    elite: 76 },   // %
  interceptions_p90:     { avg: 1.0,   elite: 3.2 },
  clearances_p90:        { avg: 2.0,   elite: 7.5 },
  blocks_p90:            { avg: 0.5,   elite: 1.8 },
  recoveries_p90:        { avg: 3.5,   elite: 9.5 },
  pressures_p90:         { avg: 6.5,   elite: 20.0 },
  pressureSuccessRate:   { avg: 26,    elite: 42 },   // %

  // Duels (per 90 / %)
  aerialDuelWinRate:     { avg: 38,    elite: 68 },   // %
  groundDuelWinRate:     { avg: 46,    elite: 70 },   // %
  duelsWon_p90:          { avg: 5.0,   elite: 12.0 },

  // Physical (per 90)
  distanceCovered_p90:   { avg: 10.2,  elite: 12.8 }, // km
  sprints_p90:           { avg: 25,    elite: 58 },

  // Discipline — lower is better
  foulsCommitted_p90:    { avg: 1.5,   elite: 0.2,   lowerIsBetter: true },
  yellowCards_p90:       { avg: 0.24,  elite: 0.02,  lowerIsBetter: true },

  // Rating (Sportmonks 0–10 scale)
  rating:                { avg: 6.5,   elite: 8.0 },

  // Goalkeeping (per 90 or %)
  saves_p90:             { avg: 2.4,   elite: 5.8 },
  savePct:               { avg: 64,    elite: 83 },   // %
  cleanSheetRate:        { avg: 20,    elite: 44 },   // % of appearances
  goalsConceded_p90:     { avg: 1.45,  elite: 0.5,   lowerIsBetter: true },
};

// ---------------------------------------------------------------------------
// Primitive scoring helpers
// ---------------------------------------------------------------------------

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Score a value against a benchmark on a 10–99 scale.
 * Optional leagueScale adjusts the bench anchors for volume p90 stats.
 */
function score(value: number, benchKey: string, leagueScale = 1.0): number {
  const bench = B[benchKey];
  if (!bench) return 50;

  // Apply league scale only to per-90 volume stats (not percentages, not discipline)
  let { avg, elite, lowerIsBetter } = bench;
  if (leagueScale !== 1.0 && !NO_SCALE_BENCH_KEYS.has(benchKey)) {
    avg   = avg   * leagueScale;
    elite = elite * leagueScale;
  }

  if (lowerIsBetter) {
    if (value <= elite)      return 99;
    if (value >= avg * 2.5)  return 10;
    const r = (avg * 2.5 - value) / (avg * 2.5 - elite);
    return Math.round(clamp(r * 99, 10, 99));
  }

  if (value <= 0)              return 10;
  if (value >= elite)          return 99;
  const floor = avg * 0.25;
  if (value <= floor)          return 10;
  if (value < avg) {
    const r = (value - floor) / (avg - floor);
    return Math.round(clamp(10 + r * 40, 10, 50));
  }
  const r = (value - avg) / (elite - avg);
  return Math.round(clamp(50 + r * 49, 50, 99));
}

function p90(v: number | null | undefined, min: number): number {
  if (!v || min < 1) return 0;
  return (v / min) * 90;
}

function pct(num: number | null | undefined, den: number | null | undefined): number {
  if (!num || !den || den === 0) return 0;
  return (num / den) * 100;
}

function wavg(values: number[], weights: number[]): number {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total === 0) return 0;
  return values.reduce((acc, v, i) => acc + v * weights[i], 0) / total;
}

// ---------------------------------------------------------------------------
// Attribute BLOCKS (six outfield + five GK)
// ---------------------------------------------------------------------------

function calcPace(s: StatsInput, min: number, ls: number): number {
  const dist  = score(p90(s.distanceCovered, min), "distanceCovered_p90", ls);
  const sprnt = score(p90(s.sprints, min),          "sprints_p90", ls);
  return Math.round(dist * 0.40 + sprnt * 0.60);
}

function calcShooting(s: StatsInput, min: number, ls: number): number {
  const g   = score(p90(s.goals, min),           "goals_p90", ls);
  const xg  = score(p90(s.xG, min),              "xG_p90", ls);
  const sot = score(p90(s.shotsOnTarget, min),    "shotsOnTarget_p90", ls);
  const acc = score(pct(s.shotsOnTarget, s.shots), "shotAccuracy");
  return Math.round(g * 0.30 + xg * 0.30 + sot * 0.20 + acc * 0.20);
}

function calcPassing(s: StatsInput, min: number, ls: number): number {
  const acc  = score(s.passAccuracy ?? 0,              "passAccuracy");
  const key  = score(p90(s.keyPasses, min),            "keyPasses_p90", ls);
  const prog = score(p90(s.progressivePasses, min),    "progressivePasses_p90", ls);
  const vol  = score(p90(s.passes, min),               "passes_p90", ls);
  const xa   = score(p90(s.xA, min),                   "xA_p90", ls);
  const crs  = score(s.crossAccuracy ?? 0,             "crossAccuracy");
  return Math.round(acc * 0.25 + key * 0.20 + prog * 0.20 + vol * 0.15 + xa * 0.15 + crs * 0.05);
}

function calcDribbling(s: StatsInput, min: number, ls: number): number {
  const dribSucc = score(p90(s.dribblesSuccess, min),              "dribblesSuccess_p90", ls);
  const dribRate = score(pct(s.dribblesSuccess, s.dribblesAttempted), "dribbleSuccessRate");
  const carries  = score(p90(s.progressiveCarries, min),           "progressiveCarries_p90", ls);
  return Math.round(dribSucc * 0.35 + dribRate * 0.35 + carries * 0.30);
}

function calcDefending(s: StatsInput, min: number, ls: number): number {
  const tkl     = score(p90(s.tackles, min),                      "tackles_p90", ls);
  const tklRate = score(pct(s.tacklesWon, s.tackles),             "tackleSuccessRate");
  const int_    = score(p90(s.interceptions, min),                "interceptions_p90", ls);
  const clr     = score(p90(s.clearances, min),                   "clearances_p90", ls);
  const blk     = score(p90(s.blocks, min),                       "blocks_p90", ls);
  const recov   = score(p90(s.recoveries, min),                   "recoveries_p90", ls);
  const aerial  = score(pct(s.aerialDuelsWon, s.aerialDuelsTotal), "aerialDuelWinRate");
  return Math.round(
    tkl * 0.20 + tklRate * 0.15 + int_ * 0.20 + clr * 0.15 +
    blk * 0.10 + recov  * 0.10  + aerial * 0.10,
  );
}

function calcPhysical(s: StatsInput, min: number, ls: number): number {
  const dist   = score(p90(s.distanceCovered, min),               "distanceCovered_p90", ls);
  const aerial = score(pct(s.aerialDuelsWon, s.aerialDuelsTotal), "aerialDuelWinRate");
  const ground = score(pct(s.groundDuelsWon, s.duelsTotal),       "groundDuelWinRate");
  const foul   = score(p90(s.foulsCommitted, min),                "foulsCommitted_p90");
  return Math.round(dist * 0.30 + aerial * 0.30 + ground * 0.25 + foul * 0.15);
}

// GK blocks
function calcGkDiving(s: StatsInput, min: number, ls: number): number {
  return score(p90(s.saves, min), "saves_p90", ls);
}
function calcGkHandling(s: StatsInput): number {
  return score(s.savePct ?? 0, "savePct");
}
function calcGkKicking(s: StatsInput, min: number, ls: number): number {
  return Math.round(
    score(p90(s.passes, min), "passes_p90", ls) * 0.35 +
    score(s.passAccuracy ?? 0, "passAccuracy") * 0.65,
  );
}
function calcGkReflex(s: StatsInput, min: number, ls: number): number {
  return Math.round(
    score(p90(s.saves, min), "saves_p90", ls) * 0.50 +
    score(s.savePct ?? 0, "savePct")          * 0.50,
  );
}
function calcGkPositioning(s: StatsInput, min: number): number {
  const cs = score(pct(s.cleanSheets, s.appearances), "cleanSheetRate");
  const ga = score(p90(s.goalsConceded, min),          "goalsConceded_p90");
  return Math.round(cs * 0.55 + ga * 0.45);
}

// ---------------------------------------------------------------------------
// Block weights per position — must sum to 1.0
// ---------------------------------------------------------------------------

interface BlockWeights {
  pace:      number;
  shooting:  number;
  passing:   number;
  dribbling: number;
  defending: number;
  physical:  number;
}

const BLOCK_WEIGHTS: Record<PositionGroup, BlockWeights> = {
  //          pace  shoot  pass  drib  def   phys
  GK:    { pace:0.04, shooting:0.02, passing:0.14, dribbling:0.02, defending:0.22, physical:0.06 },
  SW:    { pace:0.08, shooting:0.02, passing:0.18, dribbling:0.04, defending:0.45, physical:0.23 },
  CB:    { pace:0.10, shooting:0.02, passing:0.15, dribbling:0.04, defending:0.48, physical:0.21 },
  FB:    { pace:0.20, shooting:0.05, passing:0.22, dribbling:0.15, defending:0.28, physical:0.10 },
  WB:    { pace:0.22, shooting:0.08, passing:0.22, dribbling:0.18, defending:0.22, physical:0.08 },
  CDM:   { pace:0.08, shooting:0.04, passing:0.26, dribbling:0.08, defending:0.40, physical:0.14 },
  CM:    { pace:0.10, shooting:0.10, passing:0.35, dribbling:0.14, defending:0.20, physical:0.11 },
  MEZ:   { pace:0.14, shooting:0.14, passing:0.28, dribbling:0.20, defending:0.14, physical:0.10 },
  WM:    { pace:0.16, shooting:0.10, passing:0.24, dribbling:0.16, defending:0.24, physical:0.10 },
  CAM:   { pace:0.10, shooting:0.20, passing:0.30, dribbling:0.25, defending:0.05, physical:0.10 },
  W:     { pace:0.22, shooting:0.20, passing:0.16, dribbling:0.26, defending:0.06, physical:0.10 },
  SS:    { pace:0.14, shooting:0.24, passing:0.22, dribbling:0.22, defending:0.06, physical:0.12 },
  CF:    { pace:0.12, shooting:0.28, passing:0.15, dribbling:0.15, defending:0.08, physical:0.22 },
  ST:    { pace:0.15, shooting:0.35, passing:0.10, dribbling:0.16, defending:0.04, physical:0.20 },
  UNKNOWN: { pace:0.10, shooting:0.15, passing:0.25, dribbling:0.15, defending:0.20, physical:0.15 },
};

const GK_BLOCK_WEIGHTS = {
  gkDiving:      0.22,
  gkHandling:    0.22,
  gkKicking:     0.16,
  gkReflex:      0.22,
  gkPositioning: 0.18,
} as const;

// ---------------------------------------------------------------------------
// DNA scoring — position-agnostic, shows WHAT TYPE of player
// ---------------------------------------------------------------------------

/**
 * Impact — scoring and creation threat.
 * Naturally high for forwards/wingers; low for defenders.
 */
function calcDnaImpact(s: StatsInput, min: number, ls: number): number {
  return Math.round(
    wavg(
      [
        score(p90(s.goals, min),          "goals_p90", ls),
        score(p90(s.xG, min),             "xG_p90", ls),
        score(p90(s.assists, min),        "assists_p90", ls),
        score(p90(s.xA, min),             "xA_p90", ls),
        score(p90(s.shotsOnTarget, min),  "shotsOnTarget_p90", ls),
      ],
      [0.28, 0.22, 0.22, 0.16, 0.12],
    ),
  );
}

/**
 * Intelligence — technical decision quality.
 * High for midfielders and CAMs; reflects vision + progressive play.
 */
function calcDnaIntelligence(s: StatsInput, min: number, ls: number): number {
  return Math.round(
    wavg(
      [
        score(s.passAccuracy ?? 0,              "passAccuracy"),
        score(p90(s.keyPasses, min),            "keyPasses_p90", ls),
        score(p90(s.progressivePasses, min),    "progressivePasses_p90", ls),
        score(p90(s.passes, min),               "passes_p90", ls),
        score(p90(s.xGBuildup, min),            "xGBuildup_p90", ls),
      ],
      [0.28, 0.25, 0.22, 0.14, 0.11],
    ),
  );
}

/**
 * DefensiveIQ — defensive contribution and pressing intensity.
 * High for CDMs, CBs, FBs. Low for pure forwards.
 */
function calcDnaDefensiveIQ(s: StatsInput, min: number, ls: number): number {
  return Math.round(
    wavg(
      [
        score(p90(s.interceptions, min),  "interceptions_p90", ls),
        score(p90(s.tackles, min),        "tackles_p90", ls),
        score(p90(s.recoveries, min),     "recoveries_p90", ls),
        score(p90(s.pressures, min),      "pressures_p90", ls),
        score(pct(s.tacklesWon, s.tackles), "tackleSuccessRate"),
      ],
      [0.28, 0.25, 0.22, 0.15, 0.10],
    ),
  );
}

/**
 * Consistency — reliability and availability proxy.
 * Uses Sportmonks match rating (primary) + minutes-per-game ratio.
 * Without match-by-match data, this is the best proxy available.
 */
function calcDnaConsistency(s: StatsInput): number {
  const ratingScore = s.rating && s.rating > 0
    ? score(s.rating, "rating")
    : 50; // neutral if no rating

  // Minutes per appearance as a reliability signal (higher = less substituted)
  const mpa = s.appearances && s.appearances > 0
    ? (s.minutes ?? 0) / s.appearances
    : 0;
  // Bench: avg player plays ~72 min/game, elite plays ~85+ min/game
  const mpaScore = mpa <= 0 ? 40
    : mpa >= 85 ? 95
    : mpa >= 72 ? 50 + ((mpa - 72) / (85 - 72)) * 45
    : 10 + (mpa / 72) * 40;

  // Low discipline improves consistency (fewer suspensions/warnings)
  const disciplineScore = score(
    s.yellowCards && s.appearances
      ? (s.yellowCards / s.appearances) * 10
      : 0,
    "yellowCards_p90",
  );

  return Math.round(
    clamp(ratingScore * 0.55 + mpaScore * 0.30 + disciplineScore * 0.15, 10, 99),
  );
}

/**
 * Potential — age-adjusted ceiling projection.
 * Returns a 1–99 number representing how high this player can peak.
 * Uses a parabolic growth model centered on age 27 (typical football prime).
 */
function calcDnaPotential(currentOverall: number, age: number): number {
  let boost: number;

  if      (age <= 18) boost = 22;
  else if (age <= 20) boost = 17;
  else if (age <= 22) boost = 11;
  else if (age <= 24) boost = 7;
  else if (age <= 26) boost = 3;
  else if (age <= 28) boost = 1;
  else if (age <= 30) boost = 0;
  else                boost = -(age - 30) * 4; // decline

  return clamp(currentOverall + boost, 1, 99);
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export const MIN_MINUTES_RELIABLE = 450; // ~5 full matches

export function calculateOverall(
  stats:         StatsInput,
  positionRaw:   string | null | undefined,
  age?:          number | null,
  leagueCtx:     LeagueContext = "DEFAULT",
): OverallResult {
  const positionGroup = classifyPosition(positionRaw);
  const min     = stats.minutes ?? 0;
  const reliable = min >= MIN_MINUTES_RELIABLE;
  const ls      = LEAGUE_VOLUME_SCALE[leagueCtx];

  // ── Attribute blocks ──────────────────────────────────────────────────────
  const pace      = calcPace(stats, min, ls);
  const shooting  = calcShooting(stats, min, ls);
  const passing   = calcPassing(stats, min, ls);
  const dribbling = calcDribbling(stats, min, ls);
  const defending = calcDefending(stats, min, ls);
  const physical  = calcPhysical(stats, min, ls);

  const breakdown: OverallBreakdown = { pace, shooting, passing, dribbling, defending, physical };

  let overall: number;

  if (positionGroup === "GK") {
    const gkDiving      = calcGkDiving(stats, min, ls);
    const gkHandling    = calcGkHandling(stats);
    const gkKicking     = calcGkKicking(stats, min, ls);
    const gkReflex      = calcGkReflex(stats, min, ls);
    const gkPositioning = calcGkPositioning(stats, min);

    breakdown.gkDiving      = gkDiving;
    breakdown.gkHandling    = gkHandling;
    breakdown.gkKicking     = gkKicking;
    breakdown.gkReflex      = gkReflex;
    breakdown.gkPositioning = gkPositioning;

    const gkScore =
      gkDiving      * GK_BLOCK_WEIGHTS.gkDiving      +
      gkHandling    * GK_BLOCK_WEIGHTS.gkHandling     +
      gkKicking     * GK_BLOCK_WEIGHTS.gkKicking      +
      gkReflex      * GK_BLOCK_WEIGHTS.gkReflex       +
      gkPositioning * GK_BLOCK_WEIGHTS.gkPositioning;

    overall = Math.round(gkScore * 0.90 + passing * 0.10);
  } else {
    const w = BLOCK_WEIGHTS[positionGroup];
    overall = Math.round(
      pace      * w.pace      +
      shooting  * w.shooting  +
      passing   * w.passing   +
      dribbling * w.dribbling +
      defending * w.defending +
      physical  * w.physical,
    );
  }

  // Soft penalty for low playing time (max –8 pts)
  if (!reliable && min > 0) {
    const penaltyFactor = 1 - 0.08 * (1 - min / MIN_MINUTES_RELIABLE);
    overall = Math.round(overall * penaltyFactor);
  }

  // API-provided rating blend (12 % weight — most reliable single signal)
  if (stats.rating && stats.rating > 0) {
    const ratingScore = score(stats.rating, "rating");
    overall = Math.round(overall * 0.88 + ratingScore * 0.12);
  }

  overall = clamp(overall, 1, 99);

  // ── DNA scores ─────────────────────────────────────────────────────────────
  const impact       = calcDnaImpact(stats, min, ls);
  const intelligence = calcDnaIntelligence(stats, min, ls);
  const defensiveIQ  = calcDnaDefensiveIQ(stats, min, ls);
  const consistency  = calcDnaConsistency(stats);
  const playerAge    = typeof age === "number" && age > 0 ? age : 25; // safe default
  const potential    = calcDnaPotential(overall, playerAge);

  const dna: DnaScore = {
    impact:       clamp(impact,       10, 99),
    intelligence: clamp(intelligence, 10, 99),
    defensiveIQ:  clamp(defensiveIQ,  10, 99),
    consistency:  clamp(consistency,  10, 99),
    potential,
  };

  return {
    overall,
    breakdown,
    positionGroup,
    reliable,
    dna,
    potential,
  };
}
