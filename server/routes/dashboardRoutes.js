import { Router } from "express";
import { metrics } from "../controllers/dashboardController.js";
import { requireUser } from "../middleware/auth.js";
import { asyncHandler } from "../utils/errors.js";

export const dashboardRouter = Router();

dashboardRouter.get("/metrics", requireUser, asyncHandler(metrics));
