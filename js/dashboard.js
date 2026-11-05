import { apiFetch, byId, formatCurrency, getCurrentUser, requireAuth, setCurrentUser } from "./api.js";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function renderDailyActionsLegacy(actions = []) {
  const target = byId("dailyActionList");
  if (!target) return;
  if (!actions.length) {
    target.innerHTML = `<div class="empty-state">No urgent actions yet. Save leads, schedule follow-ups, or run a new search to build your next action list.</div>`;
    return;
  }
  target.innerHTML = actions.map((action) => `
    <article class="audit-item">
      <div><strong>${escapeHtml(action.title)}</strong><br><span>${escapeHtml(action.leadName || "Saved lead")} — ${escapeHtml(action.reason)}</span></div>
      <a class="btn btn-secondary" href="/lead-details.html?id=${encodeURIComponent(action.leadId)}">${escapeHtml(action.actionLabel || "Open lead")}</a>
    </article>
  `).join("");
}

let dailyActionState = [];
let dailyActionSummaryState = {};
let dailyActionFilter = "all";
let dailyActionQuery = "";

function formatActionDate(value) {
  if (!value) return "No date set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function renderActionSummary(summary = {}) {
  ["overdue", "dueToday", "highOpportunity", "websiteAudits"].forEach((key) => {
    const target = document.querySelector(`[data-action-count="${key}"]`);
    if (target) target.textContent = Number(summary[key] || 0).toLocaleString();
  });
  const fab = document.querySelector("[data-action-fab-count]");
  if (fab) fab.textContent = Number(summary.total || 0).toLocaleString();
}

function renderDailyActions(actions = dailyActionState) {
  const target = byId("dailyActionList");
  if (!target) return;
  const query = dailyActionQuery.trim().toLowerCase();
  const visible = actions.filter((action) => {
    const matchesType = dailyActionFilter === "all" || action.type === dailyActionFilter;
    const haystack = `${action.title || ""} ${action.leadName || ""} ${action.reason || ""}`.toLowerCase();
    return matchesType && (!query || haystack.includes(query));
  });
  const status = byId("dailyActionStatus");
  if (status) status.textContent = actions.length ? `${visible.length} of ${actions.length} prioritized actions` : "";
  if (!visible.length) {
    const message = actions.length ? "No actions match this view." : "No urgent actions yet. Save leads, schedule follow-ups, or run a new search to build your next action list.";
    target.innerHTML = `<div class="action-empty"><strong>${actions.length ? "You're all caught up" : "Your action list is clear"}</strong><span>${message}</span><a class="btn btn-secondary" href="/crm.html">Review pipeline</a></div>`;
    return;
  }
  target.innerHTML = visible.map((action) => `
    <article class="action-card action-card--priority-${Math.min(4, Math.max(1, Number(action.priority) || 4))}">
      <div class="action-card__icon" aria-hidden="true">${action.type === "website_audit" ? "◌" : action.type === "high_opportunity" ? "↗" : "!"}</div>
      <div class="action-card__body">
        <strong>${escapeHtml(action.title)}</strong>
        <span>${escapeHtml(action.leadName || "Saved lead")}</span>
        <small>${escapeHtml(action.reason)}</small>
        <div class="action-card__meta">${action.dueAt ? `Due ${escapeHtml(formatActionDate(action.dueAt))}` : "Priority opportunity"}</div>
      </div>
      <a class="action-card__cta" href="/lead-details.html?id=${encodeURIComponent(action.leadId)}">${escapeHtml(action.actionLabel || "Open lead")} <span aria-hidden="true">→</span></a>
    </article>
  `).join("");
}

function initActionCenterControls() {
  document.querySelectorAll("[data-action-filter]").forEach((button) => button.addEventListener("click", () => {
    dailyActionFilter = button.dataset.actionFilter || "all";
    document.querySelectorAll("[data-action-filter]").forEach((item) => item.classList.toggle("is-active", item === button));
    renderDailyActions();
  }));
  byId("dailyActionSearch")?.addEventListener("input", (event) => {
    dailyActionQuery = event.target.value || "";
    renderDailyActions();
  });
  document.querySelector("[data-action-refresh]")?.addEventListener("click", refreshDashboardMetrics);
}

function initActionDrawer() {
  const drawer = byId("dailyActionCenter");
  const toggles = Array.from(document.querySelectorAll("[data-action-center-toggle]"));
  const close = document.querySelector("[data-action-center-close]");
  const backdrop = document.querySelector("[data-action-center-backdrop]");
  if (!drawer || !toggles.length) return;

  const setOpen = (open) => {
    drawer.classList.toggle("is-open", open);
    drawer.setAttribute("aria-hidden", String(!open));
    toggles.forEach((toggle) => toggle.setAttribute("aria-expanded", String(open)));
    if (backdrop) backdrop.hidden = !open;
    document.body.classList.toggle("action-drawer-open", open);
    if (open) close?.focus();
  };

  toggles.forEach((toggle) => toggle.addEventListener("click", () => setOpen(!drawer.classList.contains("is-open"))));
  close?.addEventListener("click", () => setOpen(false));
  backdrop?.addEventListener("click", () => setOpen(false));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && drawer.classList.contains("is-open")) setOpen(false);
  });
  drawer.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => setOpen(false)));
}

function renderMetrics(metrics) {
  const target = byId("dashboardMetrics");
  if (!target) return;

  const items = [
    ["Total Leads", metrics.totalLeads, "All discovered records", "◌"],
    ["Saved Leads", metrics.savedLeads, "CRM opportunities", "S"],
    ["Contacted", metrics.contactedLeads, "Pipeline activity", "↗"],
    ["Won Deals", metrics.wonDeals, "Closed opportunities", "W"],
    ["Estimated Revenue", formatCurrency(metrics.estimatedRevenue), "Tracked opportunity value", "$"],
    ["Conversion Rate", `${metrics.conversionRate}%`, "Won divided by saved", "%"]
  ];

  target.innerHTML = items.map(([label, value, detail, icon]) => `
    <article class="metric">
      <div class="metric-heading"><span>${escapeHtml(label)}</span><i aria-hidden="true">${escapeHtml(icon)}</i></div>
      <strong>${escapeHtml(value)}</strong>
      <small>${escapeHtml(detail)}</small>
    </article>
  `).join("");
}

function renderDashboardFocus(metrics = {}) {
  const target = byId("dashboardFocus");
  if (!target) return;
  const summary = metrics.dailyActionSummary || {};
  const overdue = Number(summary.overdue || 0);
  const dueToday = Number(summary.dueToday || 0);
  const highOpportunity = Number(summary.highOpportunity || 0);
  const audits = Number(summary.websiteAudits || 0);
  const total = overdue + dueToday + highOpportunity + audits;
  if (!total) {
    target.innerHTML = `<div class="focus-empty"><span class="focus-empty-icon">✓</span><div><strong>No priority actions are waiting</strong><p>Run a search or save a lead to create your next revenue opportunity.</p></div><a class="btn btn-primary" href="#leadSearchForm">Find leads</a></div>`;
    return;
  }
  const items = [
    [overdue, "overdue follow-up", "Open Daily Actions", "danger"],
    [dueToday, "follow-up due today", "Review your schedule", "warning"],
    [highOpportunity, "high-opportunity lead", "Contact top prospects", "accent"],
    [audits, "website audit to review", "Open Website Studio", "neutral"]
  ].filter(([count]) => count > 0);
  target.innerHTML = `<div class="focus-list">${items.map(([count, label, action, tone]) => `<div class="focus-row"><span class="focus-count focus-count--${tone}">${count}</span><span><strong>${count === 1 ? label : label.replace("lead", "leads").replace("audit", "audits")}</strong><small>${escapeHtml(action)}</small></span></div>`).join("")}<button class="btn btn-secondary focus-open-actions" type="button" data-action-center-toggle aria-controls="dailyActionCenter" aria-expanded="false">Review all actions <span aria-hidden="true">→</span></button></div>`;
  target.querySelector("[data-action-center-toggle]")?.addEventListener("click", () => {
    document.querySelector("[data-action-center-toggle]")?.click();
  });
}

function renderDashboardDate() {
  const target = document.querySelector("[data-dashboard-date]");
  if (target) target.textContent = new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
}

function renderChart(metrics) {
  const target = byId("growthChart");
  if (!target) return;

  const series = metrics.monthlyGrowth || [];
  const max = Math.max(...series.map((item) => item.value), 1);
  target.innerHTML = series.map((item) => `
    <div class="bar-row">
      <span>${item.label}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${(item.value / max) * 100}%"></div></div>
      <strong>${item.value}</strong>
    </div>
  `).join("");
}

function renderAccessState() {
  const user = getCurrentUser();
  const plan = document.querySelector("[data-plan-pill]");
  const usage = document.querySelector("[data-usage-pill]");
  if (!plan || !usage || !user) return;

  const isAdmin = String(user.role || "").toLowerCase() === "admin";
  if (isAdmin || user.entitlements?.unlimitedAccess) {
    plan.textContent = "Admin Unlimited";
    usage.textContent = "All features unlocked";
    applySearchResultEntitlement(null);
    return;
  }

  if (user.subscription === "trial" || user.billingStatus === "trial" || user.entitlements?.trial) {
    const used = Number(user.trialSearchesUsed || user.entitlements?.trialSearchesUsed || 0);
    const limit = Number(user.trialSearchLimit || user.entitlements?.trialSearchLimit || 2);
    const leadLimit = Number(user.trialLeadLimit || user.entitlements?.trialLeadLimit || 5);
    plan.textContent = "Free Trial";
    usage.textContent = `${Math.max(0, limit - used)} of ${limit} searches left, ${leadLimit} leads each`;
    applySearchResultEntitlement(leadLimit);
    return;
  }

  plan.textContent = user.planName || user.subscription || "Starter";
  usage.textContent = "Paid plan active";
  applySearchResultEntitlement(null);
}

function applySearchResultEntitlement(leadLimit) {
  const select = document.querySelector("#limit");
  if (!select) return;
  const cap = Number(leadLimit || 0);
  for (const option of select.options) {
    option.disabled = Boolean(cap && Number(option.value) > cap);
  }
  if (cap && Number(select.value) > cap) select.value = String(cap);
}

function readVaultLeads() {
  try {
    const parsed = JSON.parse(localStorage.getItem("mat_local_saved_leads_v1") || "[]");
    return Array.isArray(parsed) ? parsed.filter((lead) => lead?.id || lead?.name) : [];
  } catch {
    return [];
  }
}

function vaultStageValue(lead) {
  return String(lead?.stage || "New");
}

function mergeVaultIntoMetrics(metrics) {
  const base = { ...metrics };
  const vault = readVaultLeads();
  if (!vault.length) return base;
  const seen = new Set();
  // Server ids unseen here — vault entries carry their own ids; count vault-only extras.
  const extra = vault.filter((lead) => {
    const key = String(lead?.id || `${lead?.name || ""}|${lead?.address || ""}`).toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (!extra.length) return base;
  const contactedStages = new Set(["Contacted", "Follow Up", "Proposal Sent", "Meeting Scheduled", "Negotiation", "Won"]);
  const extraContacted = extra.filter((lead) => contactedStages.has(vaultStageValue(lead))).length;
  const extraWon = extra.filter((lead) => vaultStageValue(lead) === "Won").length;
  const extraRevenue = extra.reduce((sum, lead) => sum + Number(lead?.estimatedValue || 0), 0);
  const savedLeads = Number(base.savedLeads || 0) + extra.length;
  const wonDeals = Number(base.wonDeals || 0) + extraWon;
  return {
    ...base,
    totalLeads: Number(base.totalLeads || 0) + extra.length,
    savedLeads,
    contactedLeads: Number(base.contactedLeads || 0) + extraContacted,
    wonDeals,
    estimatedRevenue: Number(base.estimatedRevenue || 0) + extraRevenue,
    conversionRate: savedLeads ? Math.round((wonDeals / savedLeads) * 100) : 0,
  };
}

function showSubscribedBanner() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has("subscribed")) return;
  const user = getCurrentUser();
  const planName = String(user?.planName || user?.subscription || "your plan").replace(/[<>&]/g, "");
  const banner = document.createElement("section");
  banner.className = "notice";
  banner.style.cssText = "margin-bottom:14px;border-color:#16a34a;background:#f0fdf4;color:#166534;";
  banner.innerHTML = `🎉 <strong>Subscribed successfully</strong> — ${planName} is active. Every feature in your plan is unlocked.`;
  const workspace = document.querySelector(".workspace");
  if (workspace) workspace.prepend(banner);
  try { history.replaceState(null, "", "/dashboard.html"); } catch {}
}

async function refreshDashboardMetrics() {
  const button = document.querySelector("[data-action-refresh]");
  const status = byId("dailyActionStatus");
  if (button) button.disabled = true;
  if (status) status.textContent = "Refreshing from your CRM...";
  try {
    const result = await apiFetch("/api/dashboard/metrics");
    const serverMetrics = result.metrics || {};
    const metrics = mergeVaultIntoMetrics(serverMetrics);
    renderMetrics(metrics);
    renderChart(metrics);
    renderDashboardFocus(serverMetrics);
    dailyActionState = Array.isArray(serverMetrics.dailyActions) ? serverMetrics.dailyActions : [];
    dailyActionSummaryState = serverMetrics.dailyActionSummary || {};
    renderActionSummary(dailyActionSummaryState);
    renderDailyActions();
  } catch (error) {
    if (status) status.textContent = String(error?.message || "Unable to refresh actions");
  } finally {
    if (button) button.disabled = false;
  }
}

async function initDashboard() {
  const target = byId("dashboardMetrics");
  if (!target) return;
  if (!requireAuth()) return;
  initActionDrawer();
  initActionCenterControls();
  // Refresh the displayed role/plan from the signed server session before
  // enabling result-count options. This prevents a stale browser profile
  // from leaving an admin account on the five-lead trial cap.
  try {
    const session = await apiFetch("/api/auth/me");
    if (session?.user) setCurrentUser(session.user);
  } catch {
    // The metrics request below still reports the real server-side state.
  }
  renderAccessState();
  showSubscribedBanner();
  renderDashboardDate();
  target.innerHTML = `<div class="skeleton">Loading revenue metrics...</div>`;

  try {
    const result = await apiFetch("/api/dashboard/metrics");
    const serverMetrics = result.metrics || { totalLeads: 0, savedLeads: 0, contactedLeads: 0, wonDeals: 0, estimatedRevenue: 0, conversionRate: 0, monthlyGrowth: [] };
    const metrics = mergeVaultIntoMetrics(serverMetrics);
    renderMetrics(metrics);
    renderChart(metrics || { monthlyGrowth: [] });
    renderDashboardFocus(serverMetrics);
    dailyActionState = Array.isArray(serverMetrics.dailyActions) ? serverMetrics.dailyActions : [];
    dailyActionSummaryState = serverMetrics.dailyActionSummary || {};
    renderActionSummary(dailyActionSummaryState);
    renderDailyActions();
    if (metrics.savedLeads > serverMetrics.savedLeads) {
      const note = document.createElement("p");
      note.className = "notice";
      note.textContent = `${metrics.savedLeads - serverMetrics.savedLeads} saved lead(s) counted from this browser's vault (server CRM unreachable or empty). They stay after logout until you delete them.`;
      target.after(note);
    }
  } catch (error) {
    const msg = String(error?.message || "Metrics unavailable");
    target.innerHTML = `<div class="error-state">${msg}. If this keeps happening, reload the page or contact support.</div>`;
    dailyActionState = [];
    renderActionSummary({});
    renderDashboardFocus({});
    renderDailyActions([]);
  }
}

document.addEventListener("DOMContentLoaded", initDashboard);
