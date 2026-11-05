import { Router } from "express";
import { health } from "../controllers/healthController.js";
import { adminRouter } from "./adminRoutes.js";
import { aiRouter } from "./aiRoutes.js";
import { authRouter } from "./authRoutes.js";
import { billingRouter } from "./billingRoutes.js";
import { crmRouter } from "./crmRoutes.js";
import { dashboardRouter } from "./dashboardRoutes.js";
import { leadRouter } from "./leadRoutes.js";

export const apiRouter = Router();

apiRouter.get("/health", health);
apiRouter.use("/auth", authRouter);
apiRouter.use("/leads", leadRouter);
apiRouter.use("/ai", aiRouter);
apiRouter.use("/crm", crmRouter);
apiRouter.use("/dashboard", dashboardRouter);
apiRouter.use("/billing", billingRouter);
apiRouter.use("/admin", adminRouter);
