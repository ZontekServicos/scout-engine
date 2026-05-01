import { z } from "zod";

export const compareParamsSchema = z.object({
  idA: z.string().trim().min(1, "Player A id is required").uuid("Invalid UUID for player A id. Select a player from the search results instead of sending a name."),
  idB: z.string().trim().min(1, "Player B id is required").uuid("Invalid UUID for player B id. Select a player from the search results instead of sending a name."),
});
export const compareByNameParamsSchema = z.object({
  nameA: z.string().trim().min(2, "Player A name is too short"),
  nameB: z.string().trim().min(2, "Player B name is too short"),
});
