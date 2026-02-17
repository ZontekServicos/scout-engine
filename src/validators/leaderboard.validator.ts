import { z } from "zod";

export const leaderboardQuerySchema = z.object({
  position: z.string().optional(),
  limit: z
    .string()
    .transform((val) => Number(val))
    .refine((val) => !isNaN(val) && val > 0, {
      message: "Limit must be a positive number",
    })
    .optional(),
});
