import { apiFetch, byId, requireAuth, setCurrentUser, setToken } from "./api.js";

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[character]);
}

function setStatus(message, state = "info") {
  const target = document.querySelector("[data-profile-status]");
  if (!target) return;
  target.textContent = message;
  target.classList.toggle("success", state === "success");
  target.classList.toggle("error", state === "error");
}

function accessLabel(user = {}) {
  if (user.role === "admin" || user.entitlements?.unlimitedAccess) return "Admin Unlimited";
  if (user.subscription === "trial" || user.billingStatus === "trial" || user.entitlements?.trial) return "Free Trial";
  return user.planName || user.subscription || "Active";
}

function accessClass(user = {}) {
  if (user.role === "admin" || user.entitlements?.unlimitedAccess) return "success";
  if (user.subscription === "trial" || user.billingStatus === "trial" || user.entitlements?.trial) return "warning";
  return "success";
}

function renderAccountStatus(user = {}) {
  const target = document.querySelector("[data-account-status]");
  if (!target) return;

  const trialUsed = Number(user.trialSearchesUsed || user.entitlements?.trialSearchesUsed || 0);
  const trialLimit = Number(user.trialSearchLimit || user.entitlements?.trialSearchLimit || 2);
  const trialLeads = Number(user.trialLeadLimit || user.entitlements?.trialLeadLimit || 5);
  const trialText = `${Math.max(0, trialLimit - trialUsed)} of ${trialLimit} searches left`;

  target.innerHTML = `
    <div class="audit-item"><span>Current plan</span><span class="status-pill ${accessClass(user)}">${escapeHtml(accessLabel(user))}</span></div>
    <div class="audit-item"><span>Email</span><strong>${escapeHtml(user.email || "Not available")}</strong></div>
    <div class="audit-item"><span>Billing status</span><span class="status-pill ${accessClass(user)}">${escapeHtml(user.billingStatus || "active")}</span></div>
    <div class="audit-item"><span>Lead access</span><strong>${user.monthlyLeadLimit === null ? "Unlimited" : `${user.monthlyLeadLimit || trialLeads} leads`}</strong></div>
    ${user.subscription === "trial" || user.billingStatus === "trial" || user.entitlements?.trial
      ? `<div class="audit-item"><span>Trial searches</span><strong>${trialText}</strong></div>`
      : ""}
    <div class="audit-item"><span>MFA readiness</span><span class="status-pill warning">Ready</span></div>
    <div class="audit-item"><span>Password reset</span><span class="status-pill success">Enabled</span></div>
  `;
}

function populateProfile(user = {}) {
  byId("name").value = user.name || "";
  byId("email").value = user.email || "";
  byId("company").value = user.company || "";
  byId("signature").value = user.signature || "Best regards, MAT Leads AI Pro X";
  renderAccountStatus(user);
}

async function loadProfile() {
  if (!requireAuth()) return;
  try {
    const result = await apiFetch("/api/auth/profile");
    if (result.user) {
      setCurrentUser(result.user);
      populateProfile(result.user);
      setStatus("Profile loaded.");
    }
  } catch (error) {
    setStatus(error.message, "error");
  }
}

function initProfileForm() {
  const form = document.querySelector("[data-profile-form]");
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!requireAuth()) return;

    const submit = form.querySelector("button[type='submit']");
    const original = submit?.textContent || "Save Profile";
    if (submit) {
      submit.disabled = true;
      submit.textContent = "Saving...";
    }
    setStatus("Saving profile...");

    try {
      const result = await apiFetch("/api/auth/profile", {
        method: "PATCH",
        body: JSON.stringify({
          name: byId("name").value,
          company: byId("company").value,
          signature: byId("signature").value
        })
      });
      if (result.accessToken) setToken(result.accessToken);
      if (result.user) {
        setCurrentUser(result.user);
        populateProfile(result.user);
      }
      setStatus("Profile saved.", "success");
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      if (submit) {
        submit.disabled = false;
        submit.textContent = original;
      }
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initProfileForm();
  loadProfile();
});
