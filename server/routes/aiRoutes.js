import { Router } from "express";
import { analyzeLead, writeOutreach } from "../controllers/aiController.js";
import { requireUser } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { asyncHandler } from "../utils/errors.js";
import { aiSchemas } from "../utils/schemas.js";

export const aiRouter = Router();

aiRouter.post("/analyze", requireUser, validateBody(aiSchemas.analyze), asyncHandler(analyzeLead));
aiRouter.post("/outreach", requireUser, validateBody(aiSchemas.outreach), asyncHandler(writeOutreach));
