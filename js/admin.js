import { apiFetch, byId, formatCurrency, requireAuth } from "./api.js";

function statusPill(enabled) {
  return '<span class="status-pill ' + (enabled ? "success" : "danger") + '">' + (enabled ? "Connected" : "Required") + "</span>";
}

function renderAdmin(data) {
  const metrics = byId("adminMetrics");
  const logs = byId("auditLogs");
  if (metrics) {
    metrics.innerHTML = [
      '<article class="metric"><span>Users</span><strong>' + data.users + '</strong></article>',
      '<article class="metric"><span>MRR</span><strong>' + formatCurrency(data.mrr) + '</strong></article>',
      '<article class="metric"><span>API Calls</span><strong>' + data.apiCalls + '</strong></article>',
      '<article class="metric"><span>Errors</span><strong>' + data.errors + '</strong></article>',
      '<article class="metric"><span>Admin Access</span><strong>' + (data.access?.unlimitedAccess ? "Unlimited" : "Limited") + '</strong></article>',
      '<article class="metric"><span>Lead Limit</span><strong>' + (data.access?.monthlyLeadLimit === null ? "Unlimited" : data.access?.monthlyLeadLimit || "Plan") + '</strong></article>'
    ].join("");
  }
  if (logs) {
    logs.innerHTML = data.auditLogs.map(function(log) {
      return '<tr><td>' + log.time + '</td><td>' + log.actor + '</td><td>' + log.action + '</td><td>' + log.ip + '</td></tr>';
    }).join("");
  }
}

async function initIntegrationStatus() {
  const target = byId("integrationStatus");
  const missing = byId("missingConfig");
  if (!target) return;

  try {
    const health = await apiFetch("/api/health");
    const integrations = health.integrations || {};
    target.innerHTML = [
      '<div class="audit-item"><span>Google Places API</span>' + statusPill(integrations.googlePlaces) + '</div>',
      '<div class="audit-item"><span>OpenStreetMap Overpass</span>' + statusPill(integrations.openStreetMap) + '</div>',
      '<div class="audit-item"><span>Firebase Firestore</span>' + statusPill(integrations.firebase) + '</div>',
      '<div class="audit-item"><span>NVIDIA API</span>' + statusPill(integrations.nvidia) + '</div>',
      '<div class="audit-item"><span>Stripe Billing</span>' + statusPill(integrations.stripe) + '</div>',
      '<div class="audit-item"><span>PayPal Billing</span>' + statusPill(integrations.paypal) + '</div>'
    ].join("");

    if (missing) {
      var items = health.missingRequiredForLiveOperation || [];
      missing.textContent = items.length
        ? "live operation: " + items.join(", ") + "."
        : "All live provider credentials are configured.";
    }
  } catch (error) {
    target.innerHTML = '<div class="error-state">' + error.message + '</div>';
  }
}

async function initAdmin() {
  const metrics = byId("adminMetrics");
  if (!metrics) return;
  if (!requireAuth()) return;

  // Admin UI is visible only to admin accounts — everyone else is sent back
  // to the dashboard before any admin data is requested.
  let me = null;
  try {
    me = await apiFetch("/api/auth/me");
  } catch {
    return; // api.js already handles auth redirects
  }
  const user = me.user;
  try { localStorage.setItem("mat_user", JSON.stringify(user)); } catch {}
  if (String(user?.role || "").toLowerCase() !== "admin") {
    window.location.href = "/dashboard.html";
    return;
  }

  metrics.innerHTML = '<div class="skeleton">Loading system controls...</div>';
  try {
    const result = await apiFetch("/api/admin/overview");
    renderAdmin(result);
    initIntegrationStatus();
  } catch (error) {
    metrics.innerHTML = '<div class="error-state">' + error.message + '</div>';
  }
}

document.addEventListener("DOMContentLoaded", function() {
  initAdmin();
});