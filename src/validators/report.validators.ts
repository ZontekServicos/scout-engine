import { z } from "zod";

export const scoutReportParamsSchema = z.object({
  id: z.string().uuid("Invalid scout report id"),
});

export const smartMatchParamsSchema = z.object({
  playerId: z.string().uuid("Invalid player id"),
});

export const createScoutReportSchema = z.object({
  type: z.enum(["REPORT", "COMPARISON"]),
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  analyst: z.string().optional(),
  status: z.enum(["COMPLETED", "IN_PROGRESS"]).optional(),
  content: z.record(z.string(), z.unknown()),
  players: z.array(z.record(z.string(), z.unknown())).min(1, "At least one player is required"),
});

export const generateScoutReportSchema = z.object({
  playerIds: z.array(z.string().uuid("Invalid player id")).min(1, "At least one playerId is required"),
  players: z.array(z.string()).optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  analyst: z.string().optional(),
});
