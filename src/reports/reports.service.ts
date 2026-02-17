import { prisma } from "../lib/prisma";

interface GetReportsParams {
  page?: number;
  limit?: number;
  type?: "COMPARE" | "RANKING";
  playerId?: string;
}

export async function getReports({ page = 1, limit = 10, type, playerId }: GetReportsParams) {
  const skip = (page - 1) * limit;

  const where: any = {};

  if (type) where.type = type;
  if (playerId) where.playerId = playerId;

  const [reports, total] = await Promise.all([
    prisma.scoutReport.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.scoutReport.count({ where }),
  ]);

  return {
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
    data: reports,
  };
}

export async function getReportById(id: string) {
  const report = await prisma.scoutReport.findUnique({
    where: { id },
  });

  if (!report) {
    throw new Error("Report not found");
  }

  return report;
}
export async function deleteReport(id: string) {
  const report = await prisma.scoutReport.findUnique({
    where: { id },
  });

  if (!report) {
    throw new Error("Report not found");
  }

  await prisma.scoutReport.delete({
    where: { id },
  });

  return {
    message: "Report deleted successfully",
    id,
  };
}
