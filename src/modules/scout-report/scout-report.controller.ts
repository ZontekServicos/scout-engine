import { Request, Response } from "express";
import { successResponse } from "../../lib/apiResponse";
import { ScoutReportService } from "./scout-report.service";

const scoutReportService = new ScoutReportService();

type ValidatedRequest<TBody = unknown, TParams = Record<string, string>> = Request & {
  validated?: {
    body?: TBody;
    params?: TParams;
  };
};

export async function createScoutReportController(req: Request, res: Response) {
  const payload = ((req as ValidatedRequest).validated?.body ?? req.body) as Parameters<ScoutReportService["createReport"]>[0];
  const report = await scoutReportService.createReport(payload);

  return res.status(201).json(successResponse(report));
}

export async function listScoutReportsController(_req: Request, res: Response) {
  const reports = await scoutReportService.listReports();

  return res.json(successResponse(reports));
}

export async function getScoutReportByIdController(req: Request, res: Response) {
  const { id } = ((req as ValidatedRequest<unknown, { id: string }>).validated?.params ?? req.params) as { id: string };
  const report = await scoutReportService.getReportById(id);

  return res.json(successResponse(report));
}

export async function deleteScoutReportController(req: Request, res: Response) {
  const { id } = ((req as ValidatedRequest<unknown, { id: string }>).validated?.params ?? req.params) as { id: string };
  const result = await scoutReportService.deleteReport(id);

  return res.json(successResponse(result));
}

export async function generateScoutReportController(req: Request, res: Response) {
  const payload = ((req as ValidatedRequest).validated?.body ?? req.body) as Parameters<ScoutReportService["generateReport"]>[0];
  const report = await scoutReportService.generateReport(payload);

  return res.status(201).json(successResponse(report));
}

export async function getSmartMatchController(req: Request, res: Response) {
  const { playerId } = ((req as ValidatedRequest<unknown, { playerId: string }>).validated?.params ?? req.params) as { playerId: string };
  const result = await scoutReportService.getSmartMatch(playerId);

  return res.json(successResponse(result));
}
