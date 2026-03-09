import { Request, Response } from "express";
import { successResponse } from "../lib/apiResponse";
import { simulateTransfer } from "../scout/transfer-simulation.service";

export async function simulateTransferController(req: Request, res: Response) {
  const payload = (req as any).validated?.body ?? req.body;
  const result = await simulateTransfer(payload);
  return res.json(successResponse(result));
}
