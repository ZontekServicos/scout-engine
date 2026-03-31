import { z } from "zod";

export const analysisListQuerySchema = z.object({
  type: z.enum(["PLAYER_COMPARISON", "PLAYER_REPORT"]).optional(),
  status: z.enum(["COMPLETED", "IN_PROGRESS", "ARCHIVED"]).optional(),
  includeLegacy: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .optional()
    .transform((value) => {
      if (typeof value === "boolean") {
        return value;
      }

      if (value === "false") {
        return false;
      }

      return true;
    }),
});

export const analysisParamsSchema = z.object({
  id: z.string().min(1, "Invalid analysis id"),
});

export const createComparisonAnalysisSchema = z.object({
  title: z.string().trim().min(3).max(160).optional(),
  description: z.string().trim().max(1000).optional(),
  analyst: z.string().trim().min(2).max(120).optional(),
  status: z.enum(["COMPLETED", "IN_PROGRESS", "ARCHIVED"]).optional(),
  playerIds: z.array(z.string().uuid("Invalid player id")).min(2, "At least two players are required"),
});

export const createReportAnalysisSchema = z.object({
  title: z.string().trim().min(3).max(160).optional(),
  description: z.string().trim().max(2000).optional(),
  analyst: z.string().trim().min(2).max(120).optional(),
  status: z.enum(["COMPLETED", "IN_PROGRESS", "ARCHIVED"]).optional(),
  playerIds: z.array(z.string().uuid("Invalid player id")).min(1, "At least one player is required"),
});
