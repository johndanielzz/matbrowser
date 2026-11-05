import { Router } from "express";
import { overview } from "../controllers/adminController.js";
import { requireRole, requireUser } from "../middleware/auth.js";
import { asyncHandler } from "../utils/errors.js";

export const adminRouter = Router();

adminRouter.get("/overview", requireUser, requireRole("admin"), asyncHandler(overview));
