import { Router } from "express";
import { leadReport, saveLead, searchLeads } from "../controllers/leadController.js";
import { requireUser } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { asyncHandler } from "../utils/errors.js";
import { leadSearchSchema } from "../utils/schemas.js";

export const leadRouter = Router();

leadRouter.post("/search", requireUser, validateBody(leadSearchSchema), asyncHandler(searchLeads));
leadRouter.post("/:id/save", requireUser, asyncHandler(saveLead));
leadRouter.get("/:id/report", requireUser, asyncHandler(leadReport));
