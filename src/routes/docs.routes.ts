import { Router } from "express";
import { successResponse } from "../lib/apiResponse";
import { openApiDocument } from "../docs/openapi";

const router = Router();

router.get("/openapi.json", (_req, res) => {
  res.json(openApiDocument);
});

router.get("/", (_req, res) => {
  res.json(
    successResponse({
      message: "OpenAPI available at /api/docs/openapi.json",
    }),
  );
});

export default router;

