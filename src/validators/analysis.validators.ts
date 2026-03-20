import { z } from "zod";

export const analysisParamsSchema = z.object({
  id: z.string().uuid("Invalid analysis id"),
});

export const createComparisonAnalysisSchema = z.object({
  title: z.string().trim().min(3).max(160).optional(),
  description: z.string().trim().max(1000).optional(),
  analyst: z.string().trim().min(2).max(120).optional(),
  status: z.enum(["COMPLETED", "IN_PROGRESS", "ARCHIVED"]).optional(),
  playerIds: z.array(z.string().uuid("Invalid player id")).min(2, "At least two players are required"),
});
