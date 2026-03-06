import { prisma } from "../lib/prisma";

export async function applyDecision(
  reportId: string,
  data: {
    decisionStatus: "APPROVED" | "REJECTED";
    requestedBy: string;
    technicalReason: string;
  },
) {
  const report = await prisma.scoutReport.findUnique({
    where: { id: reportId },
  });

  if (!report) {
    throw new Error("Report not found");
  }

  return prisma.scoutReport.update({
    where: { id: reportId },
    data: {
      decisionStatus: data.decisionStatus,
      requestedBy: data.requestedBy,
      technicalReason: data.technicalReason,
      decisionAt: new Date(),
    },
  });
}
