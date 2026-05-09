export type RecencyGroup = "Hoje" | "Ontem" | "Esta semana" | "Este mês" | "Mais antigo";

export interface SearchHistoryEntry {
  id:             string;
  query:          string;
  filters:        Record<string, unknown> | null;
  searchCount:    number;
  resultCount:    number | null;
  lastSearchedAt: string;
  createdAt:      string;
  group:          RecencyGroup;
}

interface RawRow {
  id:             string;
  query:          string;
  filters:        unknown;
  searchCount:    number;
  resultCount:    number | null;
  lastSearchedAt: Date;
  createdAt:      Date;
}

function recencyGroup(date: Date): RecencyGroup {
  const now     = new Date();
  const diffMs  = now.getTime() - date.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (date.toDateString() === now.toDateString())       return "Hoje";
  if (date.toDateString() === yesterday.toDateString()) return "Ontem";
  if (diffDays <= 7)                                    return "Esta semana";
  if (diffDays <= 30)                                   return "Este mês";
  return "Mais antigo";
}

export function mapSearchHistoryEntry(row: RawRow): SearchHistoryEntry {
  return {
    id:             row.id,
    query:          row.query,
    filters:        (row.filters as Record<string, unknown>) ?? null,
    searchCount:    row.searchCount,
    resultCount:    row.resultCount,
    lastSearchedAt: row.lastSearchedAt.toISOString(),
    createdAt:      row.createdAt.toISOString(),
    group:          recencyGroup(row.lastSearchedAt),
  };
}
