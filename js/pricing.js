import { apiFetch, hasUsableToken, requireAuth } from "./api.js";

const PENDING_PAYPAL_CHECKOUT_KEY = "mat_pending_paypal_checkout";

function rememberPaypalCheckout(result) {
  if (!result?.sessionId || !result?.plan?.key) return;
  localStorage.setItem(PENDING_PAYPAL_CHECKOUT_KEY, JSON.stringify({
    provider: "paypal",
    sessionId: result.sessionId,
    plan: result.plan.key,
    planName: result.plan.name,
    returnUrl: result.returnUrl,
    startedAt: new Date().toISOString()
  }));
}

async function initOwnerPricingState() {
  if (!hasUsableToken()) return;

  try {
    const result = await apiFetch("/api/auth/me");
    if (result.user?.role !== "admin" && !result.user?.entitlements?.unlimitedAccess) return;

    document.querySelectorAll("[data-stripe-plan], [data-paypal-plan]").forEach((button) => {
      button.disabled = true;
      button.textContent = "Included";
    });

    const header = document.querySelector(".section-header p");
    if (header) {
      header.textContent = "Admin unlimited access is active. All plans, lead volume, CRM, reports, admin, analytics, billing, and AI workflows are unlocked.";
    }
  } catch {
    // Keep pricing usable for anonymous visitors.
  }
}

function initBillingButtons() {
  document.addEventListener("click", async (event) => {
    const stripeButton = event.target.closest("[data-stripe-plan]");
    const paypalButton = event.target.closest("[data-paypal-plan]");
    if (!stripeButton && !paypalButton) return;

    const button = stripeButton || paypalButton;
    if (!requireAuth()) return;
    const provider = stripeButton ? "stripe/payment-intent" : "paypal/order";
    const original = button.textContent;
    button.disabled = true;
    button.textContent = "Preparing...";

    try {
      const result = await apiFetch(`/api/billing/${provider}`, {
        method: "POST",
        headers: { "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ plan: button.dataset.stripePlan || button.dataset.paypalPlan })
      });
      const checkoutUrl = result.approvalUrl || result.checkoutUrl;
      if (paypalButton && checkoutUrl) {
        rememberPaypalCheckout(result);
        button.textContent = "Opening PayPal...";
        window.location.href = checkoutUrl;
        return;
      }
      button.textContent = result.message || "Ready";
    } catch (error) {
      button.textContent = error.message;
      setTimeout(() => {
        button.textContent = original;
        button.disabled = false;
      }, 1800);
    }
  });
}

document.addEventListener("DOMContentLoaded", initBillingButtons);
document.addEventListener("DOMContentLoaded", () => {
  try {
    const q = new URLSearchParams(window.location.search);
    if (q.get("upgrade") === "pro") {
      const header = document.querySelector(".section-header");
      if (header && !document.querySelector("[data-upgrade-banner]")) {
        const banner = document.createElement("div");
        banner.setAttribute("data-upgrade-banner", "true");
        banner.className = "notice";
        banner.style.marginTop = "12px";
        banner.innerHTML = "<strong>Pro required:</strong> AI Website Studio + Business AI Tycoon unlock on <strong>Professional ($99)</strong> and higher. Choose a plan below.";
        header.append(banner);
      }
    }
  } catch {}
});
document.addEventListener("DOMContentLoaded", initOwnerPricingState);
