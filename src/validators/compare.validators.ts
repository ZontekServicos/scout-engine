import { z } from "zod";

export const compareParamsSchema = z.object({
  idA: z.string().uuid("Invalid UUID for player A"),
  idB: z.string().uuid("Invalid UUID for player B"),
});
export const compareByNameParamsSchema = z.object({
  nameA: z.string().trim().min(2, "Player A name is too short"),
  nameB: z.string().trim().min(2, "Player B name is too short"),
});
