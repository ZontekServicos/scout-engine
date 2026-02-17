import { Request, Response, NextFunction } from "express";
import { ZodSchema } from "zod";

export const validate =
  (schema: ZodSchema<any>, property: "body" | "query" | "params") =>
  (req: Request, _res: Response, next: NextFunction) => {
    try {
      const validated = schema.parse(req[property]);

      (req as any).validated = {
        ...(req as any).validated,
        [property]: validated,
      };

      next();
    } catch (error) {
      next(error);
    }
  };
