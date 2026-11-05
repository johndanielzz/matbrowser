import { Router } from "express";
import { login, me, profile, refresh, register, settings, updateProfile, updateSettings } from "../controllers/authController.js";
import { requireUser } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { asyncHandler } from "../utils/errors.js";
import { authSchemas, profileSchema, settingsSchema } from "../utils/schemas.js";

export const authRouter = Router();

authRouter.post("/register", validateBody(authSchemas.register), asyncHandler(register));
authRouter.post("/login", validateBody(authSchemas.login), asyncHandler(login));
authRouter.post("/refresh", validateBody(authSchemas.refresh), asyncHandler(refresh));
authRouter.get("/me", requireUser, asyncHandler(me));
authRouter.get("/profile", requireUser, asyncHandler(profile));
authRouter.patch("/profile", requireUser, validateBody(profileSchema), asyncHandler(updateProfile));
authRouter.get("/settings", requireUser, asyncHandler(settings));
authRouter.patch("/settings", requireUser, validateBody(settingsSchema), asyncHandler(updateSettings));
