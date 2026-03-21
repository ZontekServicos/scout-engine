import { Request, Response } from "express";
import { successResponse } from "./lib/apiResponse";
import { deleteScoutReport } from "./reports/reports.service";

type ValidatedRequest = Request & {
  validated?: {
    params?: { id: string };
  };
};

export async function deleteScoutReportController(req: Request, res: Response) {
  const { id } = ((req as ValidatedRequest).validated?.params ?? req.params) as { id: string };
  const result = await deleteScoutReport(id);

  return res.json(successResponse(result));
}
