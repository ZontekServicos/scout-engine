export const SUPPORTED_POSITIONS = [
  "GK",
  "CB",
  "LB",
  "RB",
  "LWB",
  "RWB",
  "CDM",
  "CM",
  "CAM",
  "LM",
  "RM",
  "LW",
  "RW",
  "CF",
  "ST",
] as const;

export type SupportedPosition = (typeof SUPPORTED_POSITIONS)[number];

export function normalizePosition(position: string): SupportedPosition | null {
  const raw = position.toUpperCase().trim();
  const map: Record<string, SupportedPosition> = {
    GOALKEEPER: "GK",
    GK: "GK",
    CB: "CB",
    LCB: "CB",
    RCB: "CB",
    LB: "LB",
    RB: "RB",
    LWB: "LWB",
    RWB: "RWB",
    CDM: "CDM",
    CM: "CM",
    CAM: "CAM",
    LM: "LM",
    RM: "RM",
    LW: "LW",
    RW: "RW",
    CF: "CF",
    ST: "ST",
    STRIKER: "ST",
    FORWARD: "CF",
  };

  return map[raw] ?? null;
}

export function parsePositions(value: string): SupportedPosition[] {
  const parts = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const normalized = parts
    .map((item) => normalizePosition(item))
    .filter((item): item is SupportedPosition => Boolean(item));

  return Array.from(new Set(normalized));
}

export function getPrimaryPosition(player: { positions?: string[] | null }): string {
  return player.positions?.[0] ?? "CM";
}
