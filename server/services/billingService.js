import { env } from "../config/env.js";
import { getPlan, publicPlan } from "../config/plans.js";
import { FirestoreRepository } from "../repositories/firestoreRepository.js";
import { EarnService } from "./earnService.js";
import { signAccessToken } from "../middleware/auth.js";
import { AppError } from "../utils/errors.js";
import { isAdminUser } from "../utils/entitlements.js";

const CHECKOUT_SESSION_TTL_MS = 24 * 60 * 60 * 1000;

function cents(usd) {
  return Math.round(usd * 100);
}

function paypalBaseUrl() {
  return env.paypal.env === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

function siteUrl(path, params = {}) {
  const url = new URL(path, env.appUrl);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value);
  });
  return url.href;
}

function approvalLinkFromOrder(order) {
  return order.links?.find((link) => link.rel === "approve")?.href || "";
}

function userPlanPayload(user, planKey, plan) {
  return {
    uid: user.uid,
    name: user.name || "",
    email: user.email || "",
    role: user.role || "user",
    subscription: planKey,
    planName: plan.name,
    billingStatus: "active",
    monthlyLeadLimit: plan.monthlyLeadLimit,
    entitlements: {
      activePlan: planKey,
      billingRequired: false,
      monthlyLeadLimit: plan.monthlyLeadLimit,
      features: plan.features || []
    }
  };
}

export class BillingService {
  constructor() {
    this.users = new FirestoreRepository("users");
    this.checkoutSessions = new FirestoreRepository("checkoutSessions");
    this.auditLogs = new FirestoreRepository("auditLogs");
  }

  async createStripePaymentIntent(planKey, user, idempotencyKey) {
    const plan = getPlan(planKey);
    if (!plan) throw new AppError("Unknown plan.", 422, "UNKNOWN_PLAN");
    if (isAdminUser(user)) {
      return {
        configured: true,
        included: true,
        provider: "stripe",
        plan: "enterprise",
        message: "Admin unlimited access is active. Billing is not required."
      };
    }
    if (!env.stripe.secretKey) {
      throw new AppError("Real Stripe billing requires STRIPE_SECRET_KEY in .env.", 503, "STRIPE_NOT_CONFIGURED");
    }

    const body = new URLSearchParams({
      amount: String(cents(plan.priceUsd)),
      currency: "usd",
      "automatic_payment_methods[enabled]": "true",
      "metadata[plan]": planKey,
      "metadata[userId]": user?.uid || "anonymous"
    });

    const response = await fetch("https://api.stripe.com/v1/payment_intents", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.stripe.secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {})
      },
      body
    });

    if (!response.ok) {
      const payload = await response.text();
      throw new AppError("Stripe payment intent failed.", response.status, "STRIPE_PAYMENT_ERROR", payload.slice(0, 400));
    }

    const paymentIntent = await response.json();
    return {
      configured: true,
      clientSecret: paymentIntent.client_secret,
      id: paymentIntent.id
    };
  }

  async createPaypalOrder(planKey, user) {
    const plan = getPlan(planKey);
    if (!plan) throw new AppError("Unknown plan.", 422, "UNKNOWN_PLAN");
    if (isAdminUser(user)) {
      return {
        configured: true,
        included: true,
        provider: "paypal",
        plan: "enterprise",
        message: "Admin unlimited access is active. Billing is not required."
      };
    }
    if (plan.paypalPaymentLink) {
      const cancelUrl = siteUrl("/pricing.html", { checkout: "cancelled", plan: planKey });
      const session = await this.checkoutSessions.create({
        userId: user?.uid,
        email: user?.email || "",
        provider: "paypal",
        plan: planKey,
        status: "pending",
        paymentLink: plan.paypalPaymentLink,
        cancelUrl
      });
      const returnUrl = siteUrl("/billing-success.html", {
        provider: "paypal",
        plan: planKey,
        session: session.id
      });
      await this.checkoutSessions.update(session.id, { returnUrl });

      return {
        configured: true,
        provider: "paypal",
        hosted: true,
        plan: publicPlan(planKey),
        sessionId: session.id,
        approvalUrl: plan.paypalPaymentLink,
        returnUrl,
        cancelUrl,
        message: "Redirecting to PayPal..."
      };
    }
    if (!env.paypal.clientId || !env.paypal.clientSecret) {
      throw new AppError("Real PayPal billing requires PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in .env.", 503, "PAYPAL_NOT_CONFIGURED");
    }

    const tokenResponse = await fetch(`${paypalBaseUrl()}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${Buffer.from(`${env.paypal.clientId}:${env.paypal.clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: "grant_type=client_credentials"
    });

    if (!tokenResponse.ok) {
      throw new AppError("PayPal OAuth failed.", tokenResponse.status, "PAYPAL_OAUTH_ERROR");
    }

    const token = await tokenResponse.json();
    const orderResponse = await fetch(`${paypalBaseUrl()}/v2/checkout/orders`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token.access_token}`,
        "Content-Type": "application/json",
        "PayPal-Request-Id": `${user?.uid || "anonymous"}-${planKey}-${Date.now()}`
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        application_context: {
          brand_name: "MAT LEADS AI PRO X",
          landing_page: "LOGIN",
          user_action: "PAY_NOW",
          return_url: siteUrl("/billing-success.html", { provider: "paypal", plan: planKey }),
          cancel_url: siteUrl("/pricing.html", { checkout: "cancelled", plan: planKey })
        },
        purchase_units: [{
          reference_id: `${planKey}-${user?.uid || "anonymous"}`,
          amount: {
            currency_code: "USD",
            value: String(plan.priceUsd)
          }
        }]
      })
    });

    if (!orderResponse.ok) {
      throw new AppError("PayPal order creation failed.", orderResponse.status, "PAYPAL_ORDER_ERROR");
    }

    const order = await orderResponse.json();
    return {
      configured: true,
      provider: "paypal",
      orderId: order.id,
      plan: publicPlan(planKey),
      approvalUrl: approvalLinkFromOrder(order),
      links: order.links
    };
  }

  async confirmPaypalPayment(payload, user) {
    const plan = getPlan(payload.plan);
    if (!plan) throw new AppError("Unknown plan.", 422, "UNKNOWN_PLAN");
    if (isAdminUser(user)) {
      return {
        configured: true,
        included: true,
        provider: "paypal",
        plan: "enterprise",
        message: "Admin unlimited access is active. Billing is not required."
      };
    }

    const session = await this.checkoutSessions.findById(payload.sessionId);
    if (!session || session.provider !== "paypal" || session.plan !== payload.plan || session.userId !== user?.uid) {
      throw new AppError("Payment session could not be verified. Please start checkout again.", 409, "PAYMENT_SESSION_MISMATCH");
    }

    const createdAt = Date.parse(session.createdAt || "");
    if (!Number.isFinite(createdAt) || createdAt + CHECKOUT_SESSION_TTL_MS < Date.now()) {
      await this.checkoutSessions.update(session.id, { status: "expired" });
      throw new AppError("Payment session expired. Please start checkout again.", 409, "PAYMENT_SESSION_EXPIRED");
    }

    const activatedAt = new Date().toISOString();
    await this.checkoutSessions.update(session.id, {
      status: "confirmed",
      returnedAt: activatedAt,
      paypalToken: payload.paypalToken || "",
      payerId: payload.payerId || "",
      transactionId: payload.transactionId || ""
    });

    const existingUser = await this.users.findById(user.uid);
    const activatedUser = userPlanPayload({
      ...user,
      name: existingUser?.name || user.name
    }, payload.plan, plan);

    await this.users.upsert(user.uid, {
      ...(existingUser || {}),
      ...activatedUser,
      planActivatedAt: activatedAt,
      paypalCheckoutSessionId: session.id,
      paypalPaymentLink: plan.paypalPaymentLink || "",
      paypalTransactionId: payload.transactionId || ""
    });

    await this.auditLogs.create({
      actor: user.email || user.uid,
      action: "billing_plan_activated",
      provider: "paypal",
      plan: payload.plan,
      sessionId: session.id
    });

    try {
      await new EarnService().rewardForPaidUser({ ...activatedUser, uid: user.uid });
    } catch {}

    return {
      configured: true,
      provider: "paypal",
      status: "active",
      plan: publicPlan(payload.plan),
      user: activatedUser,
      accessToken: signAccessToken(activatedUser),
      message: `${plan.name} is active.`
    };
  }
}
