import { prisma } from "../../lib/prisma";

export type ScoutReportCreateInput = {
  type: "REPORT" | "COMPARISON";
  title: string;
  description?: string | null;
  content: Record<string, unknown>;
  players: Array<Record<string, unknown>>;
  analyst?: string | null;
  status?: "COMPLETED" | "IN_PROGRESS";
  playerId?: string | null;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  risk?: Record<string, unknown> | null;
  aiNarrative?: string | null;
};

export class ScoutReportRepository {
  async list() {
    return prisma.scoutReport.findMany({
      orderBy: { createdAt: "desc" },
    });
  }

  async findById(id: string) {
    return prisma.scoutReport.findUnique({
      where: { id },
    });
  }

  async create(input: ScoutReportCreateInput) {
    return prisma.scoutReport.create({
      data: {
        playerId: input.playerId ?? undefined,
        type: input.type === "COMPARISON" ? "COMPARE" : "SINGLE",
        title: input.title,
        description: input.description ?? null,
        content: input.content as any,
        players: input.players as any,
        analyst: input.analyst ?? null,
        status: input.status ?? "COMPLETED",
        input: {
          title: input.title,
          description: input.description ?? null,
          players: input.players,
          analyst: input.analyst ?? null,
          status: input.status ?? "COMPLETED",
          ...(input.input ?? {}),
        } as any,
        output: (input.output ?? input.content) as any,
        risk: (input.risk ?? undefined) as any,
        aiNarrative: input.aiNarrative ?? null,
        requestedBy: input.analyst ?? null,
        decisionStatus: input.status === "IN_PROGRESS" ? "PENDING" : "APPROVED",
      } as any,
    });
  }

  async delete(id: string) {
    return prisma.scoutReport.delete({
      where: { id },
    });
  }
}
