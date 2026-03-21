import { z } from "zod";

export const scoutReportParamsSchema = z.object({
  id: z.string().uuid("Invalid scout report id"),
});
