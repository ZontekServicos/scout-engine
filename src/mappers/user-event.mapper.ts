interface RawEvent {
  id: string;
  type: string;
  payload: unknown;
  createdAt: Date;
}

function toMessage(type: string, payload: Record<string, unknown>): string {
  switch (type) {
    case "PLAYER_VIEWED": {
      const name = payload.playerName ?? payload.playerId ?? "jogador";
      return `Você visualizou ${name}`;
    }
    case "PLAYER_COMPARED": {
      const nameA = payload.playerNameA ?? payload.playerIdA ?? "?";
      const nameB = payload.playerNameB ?? payload.playerIdB ?? "?";
      return `Comparou ${nameA} vs ${nameB}`;
    }
    case "SEARCH_PERFORMED": {
      const q = payload.query;
      return q ? `Buscou jogadores: "${q}"` : "Realizou uma busca de jogadores";
    }
    case "REPORT_GENERATED": {
      const title = payload.title ?? "relatório";
      return `Gerou relatório: ${title}`;
    }
    case "GEM_OPENED": {
      const count = payload.count;
      return count ? `Explorou joias ocultas (${count} jogadores)` : "Explorou joias ocultas";
    }
    default:
      return type;
  }
}

export function mapUserEvent(event: RawEvent) {
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  return {
    id: event.id,
    type: event.type,
    message: toMessage(event.type, payload),
    payload,
    createdAt: event.createdAt,
  };
}
