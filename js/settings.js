import { apiFetch, byId, requireAuth, setCurrentUser, setToken } from "./api.js";

function escapeHtml(value) {
  if (value == null) return "";
  return String(value).replace(/[&<>"']/g, function(c) {
    if (c === "&") return String.fromCharCode(38) + "amp;";
    if (c === "<") return String.fromCharCode(38) + "lt;";
    if (c === ">") return String.fromCharCode(38) + "gt;";
    if (c === "\"") return String.fromCharCode(38) + "quot;";
    if (c === "'") return String.fromCharCode(38) + "#39;";
    return c;
  });
}

function safeExternalUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function setSettingsStatus(message, state) {
  state = state || "info";
  const target = document.querySelector("[data-settings-status]");
  if (!target) return;
  target.textContent = message;
  target.classList.toggle("success", state === "success");
  target.classList.toggle("error", state === "error");
}

function setAiConnectionStatus(message, state) {
  const target = byId("aiConnectionStatus");
  if (!target) return;
  target.textContent = message;
  target.classList.toggle("success", state === "success");
  target.classList.toggle("error", state === "error");
}

async function loadAiConnectionStatus() {
  try {
    const status = await apiFetch("/api/ai/status");
    if (!status.configured) {
      setAiConnectionStatus(status.hint || "NVIDIA_API_KEY is missing.", "error");
      return;
    }
    if (status.verification === "verified") {
      setAiConnectionStatus(`Connected. Last verified: ${new Date(status.lastSuccessAt).toLocaleString()}.`, "success");
      return;
    }
    if (status.verification === "failed") {
      setAiConnectionStatus(status.hint || "NVIDIA AI connection failed.", "error");
      return;
    }
    setAiConnectionStatus("NVIDIA AI is configured but has not been tested in this server session.");
  } catch (error) {
    setAiConnectionStatus(error.message, "error");
  }
}

async function testAiConnection() {
  const button = byId("testAiConnection");
  if (!button) return;
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "Testing...";
  setAiConnectionStatus("Sending a safe provider test...");
  try {
    const result = await apiFetch("/api/ai/debug", {
      method: "POST",
      body: JSON.stringify({ prompt: "Reply with exactly: NVIDIA connection verified." })
    });
    if (result.ok && result.provider === "nvidia") {
      setAiConnectionStatus(`Connected to ${result.model} in ${result.ms}ms.`, "success");
    } else {
      setAiConnectionStatus(result.error || "NVIDIA AI test failed.", "error");
    }
  } catch (error) {
    setAiConnectionStatus(error.message, "error");
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

function val(id) {
  var el = byId(id);
  if (!el) return;
  if (el.type === "checkbox") return el.checked;
  return el.value || "";
}

function setVal(id, value, fallback) {
  var el = byId(id);
  if (!el) return;
  if (el.type === "checkbox") {
    el.checked = value != null ? Boolean(value) : Boolean(fallback);
  } else {
    el.value = value != null ? String(value) : String(fallback || "");
  }
}

function settingsPayload() {
  return {
    leadAlerts: val("leadAlerts"),
    weeklyDigest: val("weeklyDigest"),
    emailNotifications: val("emailNotifications"),
    smsNotifications: val("smsNotifications"),
    browserNotifications: val("browserNotifications"),
    defaultCountry: val("defaultCountry"),
    defaultResults: val("defaultResults") || 20,
    defaultRadius: val("defaultRadius") || 15000,
    defaultSearchDepth: val("defaultSearchDepth") || "deep",
    defaultSortBy: val("defaultSortBy") || "opportunity",
    defaultLeadQuality: val("defaultLeadQuality") || "all",
    brandName: val("brandName"),
    bookingUrl: val("bookingUrl"),
    primaryOffer: val("primaryOffer"),
    proposalPrice: val("proposalPrice") || 2500,
    followUpCadence: val("followUpCadence"),
    noWebsiteWeight: val("noWebsiteWeight") || 50,
    poorMobileWeight: val("poorMobileWeight") || 20,
    weakSeoWeight: val("weakSeoWeight") || 20,
    noSslWeight: val("noSslWeight") || 10,
    socialPresenceWeight: val("socialPresenceWeight") || 15,
    lowReviewWeight: val("lowReviewWeight") || 10,
    senderName: val("senderName"),
    replyToEmail: val("replyToEmail"),
    bccEmail: val("bccEmail"),
    emailSignature: val("emailSignature"),
    exportFormat: val("exportFormat") || "csv",
    dateFormat: val("dateFormat") || "MM/DD/YYYY",
    timezone: val("timezone") || "America/Los_Angeles",
    exportHeaders: val("exportHeaders"),
    autoExport: val("autoExport"),
    aiModel: val("aiModel") || "z-ai/glm-5.3-flash",
    outreachTone: val("outreachTone") || "professional",
    maxFollowUps: val("maxFollowUps") || 3,
    autoFollowUp: val("autoFollowUp"),
    aiSuggestions: val("aiSuggestions"),
    autoScore: val("autoScore")
  };
}

function populateSettings(settings) {
  settings = settings || {};
  setVal("leadAlerts", settings.leadAlerts, true);
  setVal("weeklyDigest", settings.weeklyDigest, true);
  setVal("emailNotifications", settings.emailNotifications, true);
  setVal("smsNotifications", settings.smsNotifications, false);
  setVal("browserNotifications", settings.browserNotifications, true);
  setVal("defaultCountry", settings.defaultCountry, "United States");
  setVal("defaultResults", settings.defaultResults, 20);
  setVal("defaultRadius", settings.defaultRadius, 15000);
  setVal("defaultSearchDepth", settings.defaultSearchDepth, "deep");
  setVal("defaultSortBy", settings.defaultSortBy, "opportunity");
  setVal("defaultLeadQuality", settings.defaultLeadQuality, "all");
  setVal("brandName", settings.brandName, "MAT Leads AI Pro X");
  setVal("bookingUrl", settings.bookingUrl, "");
  setVal("primaryOffer", settings.primaryOffer, "Website + local lead growth audit");
  setVal("proposalPrice", settings.proposalPrice, 2500);
  setVal("followUpCadence", settings.followUpCadence, "Day 1, Day 3, Day 7");
  setVal("noWebsiteWeight", settings.noWebsiteWeight, 50);
  setVal("poorMobileWeight", settings.poorMobileWeight, 20);
  setVal("weakSeoWeight", settings.weakSeoWeight, 20);
  setVal("noSslWeight", settings.noSslWeight, 10);
  setVal("socialPresenceWeight", settings.socialPresenceWeight, 15);
  setVal("lowReviewWeight", settings.lowReviewWeight, 10);
  setVal("senderName", settings.senderName, "");
  setVal("replyToEmail", settings.replyToEmail, "");
  setVal("bccEmail", settings.bccEmail, "");
  setVal("emailSignature", settings.emailSignature, "");
  setVal("exportFormat", settings.exportFormat, "csv");
  setVal("dateFormat", settings.dateFormat, "MM/DD/YYYY");
  setVal("timezone", settings.timezone, "America/Los_Angeles");
  setVal("exportHeaders", settings.exportHeaders, true);
  setVal("autoExport", settings.autoExport, false);
  setVal("aiModel", settings.aiModel, "z-ai/glm-5.3-flash");
  setVal("outreachTone", settings.outreachTone, "professional");
  setVal("maxFollowUps", settings.maxFollowUps, 3);
  setVal("autoFollowUp", settings.autoFollowUp, false);
  setVal("aiSuggestions", settings.aiSuggestions, true);
  setVal("autoScore", settings.autoScore, true);
}

function renderSettingsSummary(user, settings) {
  user = user || {};
  settings = settings || {};
  const target = document.querySelector("[data-settings-summary]");
  if (!target) return;
  const plan = user.role === "admin" || user.entitlements?.unlimitedAccess
    ? "Admin Unlimited"
    : user.planName || user.subscription || "Workspace";
  const bookingUrl = safeExternalUrl(settings.bookingUrl);
  target.innerHTML = [
    '<div class="audit-item"><span>Current plan</span><strong>' + escapeHtml(plan) + '</strong></div>',
    '<div class="audit-item"><span>Report brand</span><strong>' + escapeHtml(settings.brandName || "MAT Leads AI Pro X") + '</strong></div>',
    '<div class="audit-item"><span>Primary offer</span><strong>' + escapeHtml(settings.primaryOffer || "Website + local lead growth audit") + '</strong></div>',
    '<div class="audit-item"><span>Booking URL</span><strong>' + (bookingUrl ? '<a href="' + escapeHtml(bookingUrl) + '" target="_blank" rel="noreferrer">' + escapeHtml(bookingUrl) + '</a>' : "Not set") + '</strong></div>',
    '<div class="audit-item"><span>Default proposal</span><strong>$' + escapeHtml(settings.proposalPrice ?? 2500) + '</strong></div>',
    '<div class="audit-item"><span>Default scan</span><strong>' + escapeHtml(settings.defaultCountry || "United States") + '</strong></div>',
    '<div class="audit-item"><span>Default results</span><strong>' + escapeHtml(settings.defaultResults || 20) + '</strong></div>',
    '<div class="audit-item"><span>AI model</span><strong>' + escapeHtml(settings.aiModel || "z-ai/glm-5.3-flash") + '</strong></div>',
    '<div class="audit-item"><span>Outreach tone</span><strong>' + escapeHtml(settings.outreachTone || "professional") + '</strong></div>',
    '<div class="audit-item"><span>Follow-up cadence</span><strong>' + escapeHtml(settings.followUpCadence || "Day 1, Day 3, Day 7") + '</strong></div>',
    '<div class="audit-item"><span>Lead alerts</span><span class="status-pill ' + (settings.leadAlerts ? "success" : "warning") + '">' + (settings.leadAlerts ? "On" : "Off") + '</span></div>',
    '<div class="audit-item"><span>Timezone</span><strong>' + escapeHtml(settings.timezone || "America/Los_Angeles") + '</strong></div>'
  ].join("\n    ");
}

async function loadSettings() {
  if (!requireAuth()) return;
  try {
    const result = await apiFetch("/api/auth/settings");
    const settings = result.settings || {};
    populateSettings(settings);
    if (result.user) setCurrentUser(result.user);
    renderSettingsSummary(result.user || {}, settings);
    setSettingsStatus("Settings loaded.");
  } catch (error) {
    setSettingsStatus(error.message, "error");
  }
}

function initSettingsForm() {
  const form = document.querySelector("[data-settings-form]");
  if (!form) return;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!requireAuth()) return;

    const submit = document.querySelector("[form='workspaceSettingsForm']");
    const original = submit ? submit.textContent : "Save Settings";
    if (submit) {
      submit.disabled = true;
      submit.textContent = "Saving...";
    }
    setSettingsStatus("Saving settings...");

    try {
      const result = await apiFetch("/api/auth/settings", {
        method: "PATCH",
        body: JSON.stringify(settingsPayload())
      });
      if (result.accessToken) setToken(result.accessToken);
      if (result.user) setCurrentUser(result.user);
      populateSettings(result.settings || {});
      renderSettingsSummary(result.user || {}, result.settings || {});
      setSettingsStatus("Settings saved.", "success");
    } catch (error) {
      setSettingsStatus(error.message, "error");
    } finally {
      if (submit) {
        submit.disabled = false;
        submit.textContent = original;
      }
    }
  });
}

document.addEventListener("DOMContentLoaded", function () {
  initSettingsForm();
  loadSettings();
  loadAiConnectionStatus();
  byId("testAiConnection")?.addEventListener("click", testAiConnection);
});
