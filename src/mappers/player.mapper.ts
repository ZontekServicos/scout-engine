type PlayerRecordLike = {
  id: string;
  name: string;
  positions?: string[] | null;
  team?: string | null;
  league?: string | null;
  nationality?: string | null;
  age?: number | null;
  overall?: number | null;
  potential?: number | null;
  marketValue?: number | null;
  imagePath?: string | null;
  attributes?: unknown;
};

export type PlayerDto = {
  id: string;
  name: string;
  position: string | null;
  positions: string[];
  team: string | null;
  league: string | null;
  nationality: string;
  age: number;
  overall: number | null;
  potential: number | null;
  marketValue: number | null;
  image: string | null;
  attributes: Record<string, unknown>;
};

function normalizePositions(value: string[] | null | undefined): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function normalizeAttributes(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

export function mapPlayerRecord(player: PlayerRecordLike): PlayerDto {
  const positions = normalizePositions(player.positions);
  return {
    id: player.id,
    name: player.name,
    position: positions[0] ?? null,
    positions,
    team: player.team ?? null,
    league: player.league ?? null,
    nationality: player.nationality ?? "Unknown",
    age: typeof player.age === "number" ? player.age : 0,
    overall: player.overall ?? null,
    potential: player.potential ?? null,
    marketValue: player.marketValue ?? null,
    image: player.imagePath ?? null,
    attributes: normalizeAttributes(player.attributes),
  };
}

export function mapPlayerRecords(players: PlayerRecordLike[]): PlayerDto[] {
  return players.map(mapPlayerRecord);
}
