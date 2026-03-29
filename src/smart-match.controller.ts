import { Request, Response } from "express";
import { successResponse } from "./lib/apiResponse";
import { getSmartMatch } from "./services/smartMatch.service";

type ValidatedRequest<TParams = Record<string, string>> = Request & {
  validated?: {
    params?: TParams;
  };
};

export async function getSmartMatchController(req: Request, res: Response) {
  const { playerId } = ((req as ValidatedRequest<{ playerId: string }>).validated?.params ?? req.params) as {
    playerId: string;
  };
  const result = await getSmartMatch(playerId);

  return res.json(successResponse(result));
}
