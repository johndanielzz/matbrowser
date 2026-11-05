import { apiFetch, byId, hasUsableToken, redirectToLogin, setCurrentUser, setToken } from "./api.js";

const PENDING_PAYPAL_CHECKOUT_KEY = "mat_pending_paypal_checkout";

// What each plan unlocks — shown on the subscribed-successfully screen.
const PLAN_PERKS = {
  starter: [
    "Google Maps lead search pipeline",
    "Saved leads with IDs + CRM board",
    "Proposals, outreach and reports"
  ],
  professional: [
    "Everything in Starter",
    "Website Studio — AI sites + builder",
    "Business AI Tycoon closing assistant",
    "AI outreach, reports and automations"
  ],
  growth_plus: [
    "Everything in Professional",
    "Higher monthly lead limits",
    "Priority AI speed for busy hours",
    "Advanced exports and team hand-off"
  ],
  agency: [
    "Everything in Growth Plus",
    "Agency-scale lead limits",
    "Priority support",
    "All pro tools unlocked, no caps"
  ]
};

function readPendingCheckout() {
  try {
    return JSON.parse(localStorage.getItem(PENDING_PAYPAL_CHECKOUT_KEY) || "null");
  } catch {
    return null;
  }
}

function setText(selector, message) {
  const node = document.querySelector(selector);
  if (node) node.textContent = message;
}

function setStatus(message, state = "info") {
  const target = byId("data-billing-status") || document.querySelector("[data-billing-status]");
  if (!target) return;
  target.textContent = message;
  target.classList.toggle("error", state === "error");
  target.classList.toggle("success", state === "success");
}

function setTitle(title, icon) {
  const titleNode = document.querySelector("[data-billing-title]");
  const iconNode = document.querySelector("[data-billing-icon]");
  if (titleNode) titleNode.textContent = title;
  if (iconNode) iconNode.textContent = icon;
}

function showPerks(planKey) {
  const list = byId("planPerks");
  if (!list) return;
  const perks = PLAN_PERKS[planKey];
  if (!perks || !perks.length) return;
  list.innerHTML = perks.map((perk) => `<li>${perk}</li>`).join("");
  list.hidden = false;
  list.style.display = "block";
}

function paymentReturnPayload() {
  const params = new URLSearchParams(window.location.search);
  const pending = readPendingCheckout();

  return {
    plan: pending?.plan || params.get("plan") || "",
    sessionId: pending?.sessionId || params.get("session") || "",
    paypalToken: params.get("token") || "",
    payerId: params.get("PayerID") || params.get("payerId") || "",
    transactionId: params.get("tx") || params.get("transaction_id") || params.get("paymentId") || ""
  };
}

function showCancelled() {
  setTitle("Payment cancelled", "↩️");
  setStatus("No charge was made. Your current plan is unchanged — start checkout again whenever you're ready.", "info");
  const pill = document.querySelector("[data-billing-plan-pill]");
  if (pill) pill.textContent = "Cancelled";
  const dash = document.querySelector("[data-go-dashboard]");
  if (dash) dash.hidden = true;
  const pricing = document.querySelector("[data-back-pricing]");
  if (pricing) pricing.textContent = "Back to Pricing";
}

async function confirmPaymentReturn() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("checkout") === "cancelled") {
    showCancelled();
    return;
  }

  if (!hasUsableToken()) {
    redirectToLogin();
    return;
  }

  const payload = paymentReturnPayload();
  if (!payload.plan || !payload.sessionId) {
    setTitle("Payment not found", "⚠️");
    setStatus("We could not find the checkout session for this payment. Please return to pricing and start checkout again.", "error");
    return;
  }

  try {
    const result = await apiFetch("/api/billing/paypal/confirm", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    if (result.accessToken) setToken(result.accessToken);
    if (result.user) setCurrentUser(result.user);
    localStorage.removeItem(PENDING_PAYPAL_CHECKOUT_KEY);

    const planKey = result.plan?.key || result.user?.subscription || payload.plan;
    const planName = result.plan?.name || result.user?.planName || "Your plan";

    // 🎉 Subscribed successfully — show the plan, its unlocks, then continue.
    const pill = document.querySelector("[data-billing-plan-pill]");
    if (pill) pill.textContent = planName;
    setTitle("Subscribed successfully", "✅");
    setStatus(`${planName} is active. Every feature in your plan is unlocked — taking you to your dashboard…`, "success");
    showPerks(planKey);

    setTimeout(() => {
      window.location.href = `/dashboard.html?subscribed=${encodeURIComponent(planKey)}`;
    }, 2600);
  } catch (error) {
    setTitle("Payment confirmation needed", "⚠️");
    setStatus(error.message || "Payment confirmation failed. Please contact support with your PayPal receipt.", "error");
  }
}

document.addEventListener("DOMContentLoaded", confirmPaymentReturn);
