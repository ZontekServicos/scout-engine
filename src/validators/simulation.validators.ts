import { z } from "zod";

export const transferSimulationSchema = z.object({
  playerId: z.string().uuid("Invalid playerId"),
  transferCost: z.number().positive("transferCost must be positive"),
  salary: z.number().nonnegative("salary cannot be negative"),
  contractYears: z.number().int().min(1).max(8),
});

export const teamAnalysisQuerySchema = z.object({
  playerIds: z
    .string()
    .min(1, "playerIds is required")
    .transform((value) =>
      value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
});

export const modelValidationSchema = z.object({
  records: z.array(
    z.object({
      predictedSuccess: z.boolean(),
      actualSuccess: z.boolean(),
    }),
  ),
});

