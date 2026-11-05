import { BillingService } from "../services/billingService.js";

const billing = new BillingService();

export async function stripePaymentIntent(req, res) {
  const result = await billing.createStripePaymentIntent(req.body.plan, req.user, req.get("Idempotency-Key"));
  res.json(result);
}

export async function paypalOrder(req, res) {
  const result = await billing.createPaypalOrder(req.body.plan, req.user);
  res.json(result);
}

export async function paypalConfirm(req, res) {
  const result = await billing.confirmPaypalPayment(req.body, req.user);
  res.json(result);
}
