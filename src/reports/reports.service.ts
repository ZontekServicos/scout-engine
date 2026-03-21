import { prisma } from "../lib/prisma";

function createHttpError(message: string, statusCode: number) {
  const error = new Error(message) as Error & { statusCode?: number };
  error.statusCode = statusCode;
  return error;
}

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
      include: {
        player: true,
      },
    }),
    prisma.scoutReport.count({ where }),
  ]);

  const data = reports.map((report) => ({
    ...report,
    playerKey: report.player?.id ?? report.playerId,
    nomeJogador: report.player?.name ?? null,
  }));

  return {
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
    data,
  };
}

export async function getReportById(id: string) {
  const report = await prisma.scoutReport.findUnique({
    where: { id },
    include: {
      player: true,
    },
  });

  if (!report) {
    throw createHttpError("Report not found", 404);
  }

  return {
    ...report,
    playerKey: report.player?.id ?? report.playerId,
    nomeJogador: report.player?.name ?? null,
  };
}

export async function deleteScoutReport(id: string) {
  const report = await prisma.scoutReport.findUnique({
    where: { id },
  });

  if (!report) {
    throw createHttpError("Report not found", 404);
  }

  await prisma.scoutReport.delete({
    where: { id },
  });

  return {
    message: "Report deleted successfully",
    id,
  };
}

export async function deleteReport(id: string) {
  return deleteScoutReport(id);
}
