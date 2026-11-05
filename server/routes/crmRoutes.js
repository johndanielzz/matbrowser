import { Router } from "express";
import { addNote, listLeads, updateStage } from "../controllers/crmController.js";
import { requireUser } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { asyncHandler } from "../utils/errors.js";
import { crmSchemas } from "../utils/schemas.js";

export const crmRouter = Router();

crmRouter.get("/leads", requireUser, asyncHandler(listLeads));
crmRouter.patch("/leads/:id/stage", requireUser, validateBody(crmSchemas.stage), asyncHandler(updateStage));
crmRouter.post("/leads/:id/notes", requireUser, validateBody(crmSchemas.note), asyncHandler(addNote));
