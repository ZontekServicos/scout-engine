import { z } from "zod";

export const smartMatchParamsSchema = z.object({
  playerId: z.string().uuid("Invalid player id"),
});
