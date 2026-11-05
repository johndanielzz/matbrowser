import { env } from "../config/env.js";

export const ADMIN_PERMISSIONS = [
  "owner",
  "admin",
  "billing",
  "crm",
  "ai",
  "reports",
  "analytics",
  "settings",
  "lead_search",
  "lead_export",
  "website_audit",
  "website_builder",
  "business_tycoon",
  "outreach",
  "team",
  "unlimited"
];

export function isAdminUser(user = {}) {
  const accountEmail = String(user.email || "").trim().toLowerCase();
  const ownerEmail = String(env.owner?.email || "").trim().toLowerCase();
  return String(user.role || "").toLowerCase() === "admin"
    || Boolean(accountEmail && ownerEmail && accountEmail === ownerEmail);
}

export function applyAdminEntitlements(user = {}) {
  const normalized = {
    ...user,
    role: user.role || "user",
    subscription: user.subscription || "trial",
    billingStatus: user.billingStatus || "trial",
    permissions: Array.isArray(user.permissions) ? user.permissions : []
  };

  if (!isAdminUser(normalized)) return normalized;

  return {
    ...normalized,
    role: "admin",
    subscription: "enterprise",
    billingStatus: normalized.billingStatus === "owner_free" ? "owner_free" : "admin_unlimited",
    monthlyLeadLimit: null,
    leadLimit: null,
    permissions: [...new Set([...normalized.permissions, ...ADMIN_PERMISSIONS])],
    entitlements: {
      unlimitedAccess: true,
      unlimitedLeads: true,
      billingRequired: false,
      allFeatures: true
    }
  };
}
