/**
 * synthetic-events.service.ts
 *
 * Gera eventos espaciais sintéticos baseados nos stats reais do jogador.
 * Usado como fallback quando o banco não possui MatchEvents para um jogador
 * (ex.: plano Sportmonks sem feed de eventos por partida).
 *
 * Princípios:
 *   • Determinístico — mesmo playerId sempre gera o mesmo mapa (seeded RNG).
 *   • Proporcional — mais chutes → mais eventos ofensivos, etc.
 *   • Posicional — zona do campo baseada no grupo posicional (GK/DEF/MID/ATT).
 *   • Output shape idêntica ao player-maps.service (HeatmapData + MapEventFE[]).
 */

// ---------------------------------------------------------------------------
// Types (espelha o que o controller retorna)
// ---------------------------------------------------------------------------

export interface MapEventFE {
  x:       number;
  y:       number;
  endX:    number | null;
  endY:    number | null;
  outcome: string | null;
}

export interface SyntheticPlayerEvents {
  heatmap: {
    playerId:        string;
    totalEvents:     number;
    grid:            { col: number; row: number; intensity: number }[];
    dominantZones:   string[];
    actionBreakdown: {
      goals: number; shots: number; tackles: number; passes: number;
      dribbles: number; interceptions: number; fouls: number; saves: number;
    };
    seasons:         string[];
  };
  passes: MapEventFE[];
  shots:  MapEventFE[];
}

// ---------------------------------------------------------------------------
// Stats input — subset of PlayerStats needed for generation
// ---------------------------------------------------------------------------

export interface SyntheticStatsInput {
  goals?:           number | null;
  shots?:           number | null;
  shotsOnTarget?:   number | null;
  passes?:          number | null;
  keyPasses?:       number | null;
  crosses?:         number | null;
  tackles?:         number | null;
  interceptions?:   number | null;
  dribbles?:        number | null;  // dribblesSuccess
  saves?:           number | null;
  foulsCommitted?:  number | null;
}

export type PositionGroup = "GK" | "DEF" | "MID" | "ATT";

// ---------------------------------------------------------------------------
// Seeded RNG — LCG, fully deterministic for a given seed string
// ---------------------------------------------------------------------------

function makeRng(seed: string): () => number {
  let state = [...seed].reduce((acc, c) => Math.imul(acc * 31, c.charCodeAt(0) + 1) | 0, 1);
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) | 0;
    return (state >>> 0) / 0xffffffff;
  };
}

function rngBetween(rng: () => number, lo: number, hi: number): number {
  return Math.round(lo + rng() * (hi - lo));
}

// ---------------------------------------------------------------------------
// Field zone definitions per position group (0–100 coordinate system)
// ---------------------------------------------------------------------------

const ZONES: Record<PositionGroup, { x: [number, number]; y: [number, number] }> = {
  GK:  { x: [2,  18], y: [20, 80] },
  DEF: { x: [12, 42], y: [8,  92] },
  MID: { x: [30, 68], y: [8,  92] },
  ATT: { x: [55, 90], y: [15, 85] },
};

// Shots are always in the attacking half regardless of position
const SHOT_ZONE = { x: [62, 92] as [number, number], y: [22, 78] as [number, number] };
// Defensive actions happen deeper
const DEF_ZONE  = { x: [10, 55] as [number, number], y: [8,  92] as [number, number] };
// Pass target zone is slightly ahead of origin
const PASS_AHEAD = 20; // endX is origin.x + 0–PASS_AHEAD

// ---------------------------------------------------------------------------
// Grid helpers (mirrors player-maps.service logic)
// ---------------------------------------------------------------------------

const COLS = 10;
const ROWS = 7;

function toCell(x: number, y: number): { col: number; row: number } {
  return {
    col: Math.min(COLS - 1, Math.floor(x / 10)),
    row: Math.min(ROWS - 1, Math.floor(y / (100 / ROWS))),
  };
}

function zoneName(col: number, row: number): string {
  if (col >= 7 && row >= 2 && row <= 4) return "Área adversária";
  if (col >= 7 && row <= 1)             return "Corredor direito no ataque";
  if (col >= 7 && row >= 5)             return "Corredor esquerdo no ataque";
  if (col <= 2 && row >= 2 && row <= 4) return "Área própria";
  if (col <= 2 && row <= 1)             return "Corredor direito defensivo";
  if (col <= 2 && row >= 5)             return "Corredor esquerdo defensivo";
  if (col >= 3 && col <= 6 && row >= 2 && row <= 4) return "Meio-campo central";
  if (row <= 1) return "Corredor direito";
  if (row >= 5) return "Corredor esquerdo";
  return "Meio-campo";
}

function buildHeatmapGrid(
  allPoints: { x: number; y: number }[],
): { grid: { col: number; row: number; intensity: number }[]; dominantZones: string[] } {
  const counts: number[][] = Array.from({ length: COLS }, () => new Array<number>(ROWS).fill(0));

  for (const pt of allPoints) {
    const { col, row } = toCell(pt.x, pt.y);
    counts[col][row]++;
  }

  let maxCount = 0;
  for (let c = 0; c < COLS; c++)
    for (let r = 0; r < ROWS; r++)
      if (counts[c][r] > maxCount) maxCount = counts[c][r];

  const grid: { col: number; row: number; intensity: number }[] = [];
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      if (counts[c][r] === 0) continue;
      grid.push({ col: c, row: r, intensity: maxCount > 0 ? Math.round((counts[c][r] / maxCount) * 100) : 0 });
    }
  }

  const sorted = grid.slice().sort((a, b) => b.intensity - a.intensity);
  const dominantZones: string[] = [];
  for (const cell of sorted) {
    const name = zoneName(cell.col, cell.row);
    if (!dominantZones.includes(name)) dominantZones.push(name);
    if (dominantZones.length === 3) break;
  }

  return { grid, dominantZones };
}

// ---------------------------------------------------------------------------
// Scale helpers
// ---------------------------------------------------------------------------

function cap(value: number | null | undefined, min: number, max: number): number {
  return Math.min(max, Math.max(min, value ?? 0));
}

// ---------------------------------------------------------------------------
// Main generator
// ---------------------------------------------------------------------------

/**
 * Gera eventos sintéticos para um jogador a partir dos seus stats reais.
 *
 * @param playerId     ID do jogador — usado para seed determinístico
 * @param stats        Stats do jogador (PlayerStats parcial)
 * @param posGroup     Grupo posicional (GK | DEF | MID | ATT)
 */
export function generatePlayerEvents(
  playerId:   string,
  stats:      SyntheticStatsInput,
  posGroup:   PositionGroup,
): SyntheticPlayerEvents {
  const rng  = makeRng(`${playerId}:${posGroup}`);
  const zone = ZONES[posGroup];

  // ── Quantidade de eventos por categoria (proporcional, com cap) ──────────
  const nShots   = cap(stats.shots,                       0, 24);
  const nPasses  = cap(Math.round((stats.passes   ?? 0) / 25), 0, 50);
  const nDef     = cap((stats.tackles ?? 0) + (stats.interceptions ?? 0), 0, 20);
  const nDribles = cap(stats.dribbles,                    0, 12);
  // Eventos de posicionamento geral para dar corpo ao heatmap
  const nGeneral = Math.max(20, nShots + nPasses + nDef);

  const shotEvents:   MapEventFE[] = [];
  const passEvents:   MapEventFE[] = [];
  const allPoints:    { x: number; y: number }[] = [];

  // ── Shots ─────────────────────────────────────────────────────────────────
  const goals = cap(stats.goals, 0, nShots);
  const saved  = cap(stats.shotsOnTarget ?? 0, goals, nShots);

  for (let i = 0; i < nShots; i++) {
    const x  = rngBetween(rng, SHOT_ZONE.x[0], SHOT_ZONE.x[1]);
    const y  = rngBetween(rng, SHOT_ZONE.y[0], SHOT_ZONE.y[1]);
    const outcome =
      i < goals  ? "goal" :
      i < saved  ? "saved" : "blocked";

    shotEvents.push({ x, y, endX: null, endY: null, outcome });
    allPoints.push({ x, y });
  }

  // ── Passes ────────────────────────────────────────────────────────────────
  const passSuccessRate = Math.min(0.95, Math.max(0.50,
    (stats.passes ?? 0) > 0
      ? ((stats.passes ?? 0) - (stats.keyPasses ?? 0)) / (stats.passes ?? 1)
      : 0.78,
  ));

  for (let i = 0; i < nPasses; i++) {
    const x    = rngBetween(rng, zone.x[0], zone.x[1]);
    const y    = rngBetween(rng, zone.y[0], zone.y[1]);
    const endX = Math.min(99, x + rngBetween(rng, 0, PASS_AHEAD));
    const endY = rngBetween(rng, Math.max(0, y - 18), Math.min(100, y + 18));
    const outcome = rng() < passSuccessRate ? "success" : "fail";

    passEvents.push({ x, y, endX, endY, outcome });
    allPoints.push({ x, y });
  }

  // ── Defensive events (only for heatmap positioning) ───────────────────────
  for (let i = 0; i < nDef; i++) {
    const x = rngBetween(rng, DEF_ZONE.x[0], DEF_ZONE.x[1]);
    const y = rngBetween(rng, DEF_ZONE.y[0], DEF_ZONE.y[1]);
    allPoints.push({ x, y });
  }

  // ── General positioning events ────────────────────────────────────────────
  // Weighted toward the player's natural zone with some spread
  for (let i = 0; i < nGeneral; i++) {
    const spread = 0.3; // 30% chance of being outside main zone
    const inZone = rng() > spread;
    const x = inZone
      ? rngBetween(rng, zone.x[0], zone.x[1])
      : rngBetween(rng, 5, 95);
    const y = inZone
      ? rngBetween(rng, zone.y[0], zone.y[1])
      : rngBetween(rng, 5, 95);
    allPoints.push({ x, y });
  }

  // ── Dribble events (for heatmap, not shown as separate map) ──────────────
  for (let i = 0; i < nDribles; i++) {
    const x = rngBetween(rng, zone.x[0], zone.x[1]);
    const y = rngBetween(rng, zone.y[0], zone.y[1]);
    allPoints.push({ x, y });
  }

  // ── Build heatmap grid ───────────────────────────────────────────────────
  const { grid, dominantZones } = buildHeatmapGrid(allPoints);

  return {
    heatmap: {
      playerId,
      totalEvents:     allPoints.length,
      grid,
      dominantZones,
      actionBreakdown: {
        goals:         cap(stats.goals,           0, 999),
        shots:         cap(stats.shots,           0, 999),
        tackles:       cap(stats.tackles,         0, 999),
        passes:        cap(stats.passes,          0, 9999),
        dribbles:      cap(stats.dribbles,        0, 999),
        interceptions: cap(stats.interceptions,   0, 999),
        fouls:         cap(stats.foulsCommitted,  0, 999),
        saves:         cap(stats.saves,           0, 999),
      },
      seasons: [],
    },
    passes: passEvents,
    shots:  shotEvents,
  };
}
