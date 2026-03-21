import { Request, Response } from "express";
import { successResponse } from "./lib/apiResponse";
import { createReportAnalysis, type CreateReportAnalysisInput } from "./analysis/analysis.service";

type ValidatedRequest<T = unknown> = Request & {
  validated?: {
    body?: T;
  };
};

export async function createReportAnalysisController(req: Request, res: Response) {
  const payload = ((req as ValidatedRequest<CreateReportAnalysisInput>).validated?.body ?? req.body) as CreateReportAnalysisInput;
  const analysis = await createReportAnalysis(payload);

  return res.status(201).json(successResponse(analysis));
}
