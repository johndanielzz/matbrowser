import { Router } from "express";
import { paypalConfirm, paypalOrder, stripePaymentIntent } from "../controllers/billingController.js";
import { requireUser } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { asyncHandler } from "../utils/errors.js";
import { billingSchema, paypalConfirmationSchema } from "../utils/schemas.js";

export const billingRouter = Router();

billingRouter.post("/stripe/payment-intent", requireUser, validateBody(billingSchema), asyncHandler(stripePaymentIntent));
billingRouter.post("/paypal/order", requireUser, validateBody(billingSchema), asyncHandler(paypalOrder));
billingRouter.post("/paypal/confirm", requireUser, validateBody(paypalConfirmationSchema), asyncHandler(paypalConfirm));
