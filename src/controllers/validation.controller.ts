import { Request, Response } from "express";
import { successResponse } from "../lib/apiResponse";
import { validateModel } from "../scout/model-validation.service";

let latestValidation = {
  modelAccuracy: 0,
  falsePositiveRate: 0,
  falseNegativeRate: 0,
  sampleSize: 0,
};

export async function runModelValidationController(req: Request, res: Response) {
  const payload = (req as any).validated?.body ?? req.body;
  const result = validateModel(payload.records);
  latestValidation = result;
  return res.json(successResponse(result));
}

export async function getModelValidationController(_req: Request, res: Response) {
  return res.json(successResponse(latestValidation));
}
