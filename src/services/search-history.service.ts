import { Prisma }                        from "@prisma/client";
import { SearchHistoryRepository }       from "../repositories/search-history.repository";
import { mapSearchHistoryEntry }         from "../mappers/search-history.mapper";
import { invalidateCacheByPrefix }       from "../lib/cache";

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface SearchHistoryFilters {
  position?:    string;
  leagueId?:    string;
  nationality?: string;
  ageMin?:      number;
  ageMax?:      number;
  overallMin?:  number;
}

export interface RecordSearchParams {
  userId:       string;
  query:        string;
  filters?:     SearchHistoryFilters;
  resultCount?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeQuery(raw: string): string {
  return raw.toLowerCase().trim().replace(/\s+/g, " ");
}

function hasActiveFilters(f: SearchHistoryFilters): boolean {
  return Object.values(f).some((v) => v !== undefined && v !== null && v !== "");
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const SearchHistoryService = {
  /**
   * Records a player search in the user's history.
   * Dedup: same normalised query → increment count + refresh lastSearchedAt.
   * Empty queries are silently dropped.
   */
  async record({ userId, query, filters, resultCount }: RecordSearchParams): Promise<void> {
    const trimmed = query.trim();
    if (!trimmed) return;

    const queryNormalized = normalizeQuery(trimmed);

    const filtersValue =
      filters && hasActiveFilters(filters)
        ? (filters as unknown as Prisma.InputJsonValue)
        : null;

    await SearchHistoryRepository.upsert({
      userId,
      query:           trimmed,
      queryNormalized,
      filters:         filtersValue,
      resultCount:     resultCount ?? null,
    });

    invalidateCacheByPrefix(`search-history:list:${userId}`);
  },

  async getHistory(userId: string, page: number, limit: number) {
    const cappedLimit = Math.min(Math.max(limit, 1), 100);
    const safePage    = Math.max(page, 1);
    const offset      = (safePage - 1) * cappedLimit;

    const { entries, total } = await SearchHistoryRepository.findManyByUser({
      userId,
      limit:  cappedLimit,
      offset,
    });

    return {
      entries: entries.map(mapSearchHistoryEntry),
      total,
      page:    safePage,
      limit:   cappedLimit,
      hasMore: offset + cappedLimit < total,
    };
  },

  async deleteEntry(id: string, userId: string): Promise<void> {
    await SearchHistoryRepository.deleteById(id, userId);
    invalidateCacheByPrefix(`search-history:list:${userId}`);
  },

  async clearHistory(userId: string): Promise<void> {
    await SearchHistoryRepository.deleteAllByUser(userId);
    invalidateCacheByPrefix(`search-history:list:${userId}`);
  },
};
