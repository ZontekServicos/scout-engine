import { Prisma } from "@prisma/client";
import { prisma }   from "../lib/prisma";

export interface UpsertSearchParams {
  userId:          string;
  query:           string;
  queryNormalized: string;
  filters:         Prisma.InputJsonValue | null;
  resultCount:     number | null;
}

export interface FindManyParams {
  userId: string;
  limit:  number;
  offset: number;
}

export const SearchHistoryRepository = {
  async upsert(params: UpsertSearchParams) {
    return prisma.searchHistory.upsert({
      where: {
        userId_queryNormalized: {
          userId:          params.userId,
          queryNormalized: params.queryNormalized,
        },
      },
      update: {
        searchCount:    { increment: 1 },
        lastSearchedAt: new Date(),
        ...(params.resultCount !== null ? { resultCount: params.resultCount } : {}),
      },
      create: {
        userId:          params.userId,
        query:           params.query,
        queryNormalized: params.queryNormalized,
        filters:         params.filters ?? Prisma.JsonNull,
        resultCount:     params.resultCount,
        searchCount:     1,
      },
    });
  },

  async findManyByUser({ userId, limit, offset }: FindManyParams) {
    const [entries, total] = await prisma.$transaction([
      prisma.searchHistory.findMany({
        where:   { userId },
        orderBy: { lastSearchedAt: "desc" },
        take:    limit,
        skip:    offset,
      }),
      prisma.searchHistory.count({ where: { userId } }),
    ]);
    return { entries, total };
  },

  async deleteById(id: string, userId: string) {
    return prisma.searchHistory.deleteMany({ where: { id, userId } });
  },

  async deleteAllByUser(userId: string) {
    return prisma.searchHistory.deleteMany({ where: { userId } });
  },
};
