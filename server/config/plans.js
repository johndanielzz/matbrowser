import { env } from "./env.js";

export const plans = {
  trial: {
    key: "trial",
    name: "Free Trial",
    monthlyLeadLimit: 5,
    priceUsd: null,
    stripePriceEnv: null,
    paypalPaymentLink: null,
    trialSearchLimit: 2,
    trialLeadLimit: 5,
    referralCommissionPct: 20,
    features: ["2 lead searches", "5 leads per search", "20% referral earnings"]
  },
  starter: {
    key: "starter",
    name: "Starter",
    monthlyLeadLimit: 100,
    priceUsd: 29,
    stripePriceEnv: "STRIPE_STARTER_PRICE_ID",
    paypalPaymentLink: env.paypal.paymentLinks.starter,
    referralCommissionPct: 20,
    features: ["100 leads/mo", "CRM + reports", "Sell audits + outreach packs", "20% referral earnings"]
  },
  professional: {
    key: "professional",
    name: "Professional",
    monthlyLeadLimit: 1000,
    priceUsd: 99,
    stripePriceEnv: "STRIPE_PRO_PRICE_ID",
    paypalPaymentLink: env.paypal.paymentLinks.professional,
    referralCommissionPct: 30,
    features: ["1,000 leads/mo", "AI outreach", "AI Website Studio", "Business AI Tycoon + WhatsApp scripts", "Shareable website links + downloads", "Sell client websites + care plans", "30% referral earnings"]
  },
  growth_plus: {
    key: "growth_plus",
    name: "Growth Plus",
    monthlyLeadLimit: 3500,
    priceUsd: 149,
    stripePriceEnv: "STRIPE_GROWTH_PLUS_PRICE_ID",
    paypalPaymentLink: env.paypal.paymentLinks.growthPlus,
    referralCommissionPct: 30,
    features: ["3,500 leads/mo", "AI outreach", "CRM integrations", "AI Website Studio + priority builds", "Business AI Tycoon + WhatsApp scripts", "Invoice clients + paid audits", "30% referral earnings"]
  },
  agency: {
    key: "agency",
    name: "Agency",
    monthlyLeadLimit: null,
    priceUsd: 249,
    stripePriceEnv: "STRIPE_AGENCY_PRICE_ID",
    paypalPaymentLink: env.paypal.paymentLinks.agency,
    referralCommissionPct: 30,
    features: ["Unlimited leads", "Team workflows", "AI Website Studio + white-label links", "Business AI Tycoon for closers", "White-label client portal", "30% referral earnings"]
  },
  enterprise: {
    key: "enterprise",
    name: "Enterprise",
    monthlyLeadLimit: null,
    priceUsd: null,
    stripePriceEnv: null,
    paypalPaymentLink: null,
    features: ["Custom security review", "SSO", "Dedicated support"]
  }
};

export const paidPlanKeys = Object.entries(plans)
  .filter(([, plan]) => Number.isFinite(plan.priceUsd))
  .map(([key]) => key);

export function getPlan(planKey) {
  return plans[planKey];
}

export function publicPlan(planKey) {
  const plan = getPlan(planKey);
  if (!plan) return null;
  return {
    key: plan.key,
    name: plan.name,
    monthlyLeadLimit: plan.monthlyLeadLimit,
    priceUsd: plan.priceUsd,
    trialSearchLimit: plan.trialSearchLimit,
    trialLeadLimit: plan.trialLeadLimit,
    referralCommissionPct: plan.referralCommissionPct || 20,
    features: plan.features
  };
}

export function referralCommissionForPlan(planKey) {
  return getPlan(planKey)?.referralCommissionPct ?? 20;
}

export const clientOfferCatalog = [
  { key: "paid_audit", name: "Paid Website + SEO Audit", priceUsd: 149, blurb: "Charge clients for a branded audit before the build." },
  { key: "starter_site", name: "Starter Business Website", priceUsd: 799, blurb: "1-5 page AI website + contact + maps + launch." },
  { key: "pro_site", name: "Pro Website + Copy + SEO", priceUsd: 1499, blurb: "Premium build, copy, SEO, analytics, handover." },
  { key: "care_plan", name: "Monthly Care Plan", priceUsd: 99, blurb: "Hosting help, edits, backups, monthly report." },
  { key: "outreach_pack", name: "Outreach + Follow-up Pack", priceUsd: 299, blurb: "Scripts, email sequence, WhatsApp follow-up." }
];
