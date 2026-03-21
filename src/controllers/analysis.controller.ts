import { Request, Response } from "express";
import { successResponse } from "../lib/apiResponse";
import {
  createComparisonAnalysis,
  deleteAnalysis,
  getAnalysisById,
  listAnalyses,
  type CreateComparisonAnalysisInput,
  type ListAnalysesFilters,
} from "../analysis/analysis.service";

type ValidatedRequest<T = unknown> = Request & {
  validated?: {
    body?: T;
    params?: { id: string };
    query?: ListAnalysesFilters;
  };
};

export async function listAnalysesController(req: Request, res: Response) {
  const filters = (req as ValidatedRequest).validated?.query ?? {};
  const analyses = await listAnalyses(filters);

  return res.json(successResponse(analyses));
}

export async function getAnalysisByIdController(req: Request, res: Response) {
  const { id } = ((req as ValidatedRequest).validated?.params ?? req.params) as { id: string };
  const analysis = await getAnalysisById(id);

  return res.json(successResponse(analysis));
}

export async function createComparisonAnalysisController(req: Request, res: Response) {
  const payload = ((req as ValidatedRequest<CreateComparisonAnalysisInput>).validated?.body ?? req.body) as CreateComparisonAnalysisInput;
  const analysis = await createComparisonAnalysis(payload);

  return res.status(201).json(successResponse(analysis));
}

export async function deleteAnalysisController(req: Request, res: Response) {
  const { id } = ((req as ValidatedRequest).validated?.params ?? req.params) as { id: string };
  const result = await deleteAnalysis(id);

  return res.json(successResponse(result));
}
