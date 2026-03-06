import { z } from "zod";

export const decisionSchema = z.object({
  decisionStatus: z.enum(["APPROVED", "REJECTED"]),
  requestedBy: z.string().min(2),
  technicalReason: z.string().min(10),
  decisionBy: z.string().min(2).optional(),
  decisionReason: z.string().min(5).optional(),
  modelVersion: z.string().min(1).optional(),
  riskVersion: z.string().min(1).optional(),
  antiFlopVersion: z.string().min(1).optional(),
  engineVersion: z.string().min(1).optional(),
});
