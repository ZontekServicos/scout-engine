import { z } from "zod";

export const compareParamsSchema = z.object({
  idA: z.string().uuid("Invalid UUID for player A"),
  idB: z.string().uuid("Invalid UUID for player B"),
});
