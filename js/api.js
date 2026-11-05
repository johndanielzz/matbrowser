const TOKEN_KEY = "mat_access_token";
const REFRESH_KEY = "mat_refresh_token";
const USER_KEY = "mat_user";
const PUBLIC_API_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/firebase",
  "/api/auth/refresh",
  "/api/health"
]);
const PROTECTED_API_PREFIXES = [
  "/api/auth/me",
  "/api/auth/profile",
  "/api/auth/settings",
  "/api/dashboard/",
  "/api/leads/",
  "/api/crm/",
  "/api/admin/",
  "/api/ai/",
  "/api/billing/",
  "/api/earn/",
  "/api/social/"
];

const PUBLIC_API_EXACT = new Set([
  "/api/s/shared"
]);

function isPublicShareApi(path) {
  const pathname = String(path || "").split("?")[0];
  if (PUBLIC_API_EXACT.has(pathname)) return true;
  return /^\/api\/s\/[^/]+$/.test(pathname);
}

export function isProUser(user = {}) {
  if (!user) return false;
  if (String(user.role || "").toLowerCase() === "admin") return true;
  if (user?.entitlements?.unlimitedAccess) return true;
  const sub = String(user?.subscription || user?.planName || "").toLowerCase();
  if (["professional", "growth_plus", "growth plus", "agency", "enterprise", "pro"].some((k) => sub.includes(k))) return true;
  if (user?.entitlements?.activePlan && !["trial", "starter", ""].includes(String(user.entitlements.activePlan))) return true;
  return false;
}

export function requirePro(user = {}) {
  if (isProUser(user)) return true;
  window.location.href = "/pricing.html?upgrade=pro";
  return false;
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getRefreshToken() {
  return localStorage.getItem(REFRESH_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
}

export function setRefreshToken(token) {
  if (token) localStorage.setItem(REFRESH_KEY, token);
}

export function setCurrentUser(user) {
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function setSession(session = {}) {
  setToken(session.accessToken || session.idToken);
  setRefreshToken(session.refreshToken);
  setCurrentUser(session.user);
}

export function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || "null");
  } catch {
    return null;
  }
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(USER_KEY);
}

function decodeJwtPayload(token) {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}

export function hasUsableToken(bufferSeconds = 30) {
  const token = getToken();
  if (!token) return false;
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) {
    localStorage.removeItem(TOKEN_KEY);
    return false;
  }
  const expiresAt = Number(payload.exp) * 1000;
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() + bufferSeconds * 1000) {
    localStorage.removeItem(TOKEN_KEY);
    return false;
  }
  return true;
}

export function hasStoredSession() {
  return hasUsableToken() || Boolean(getRefreshToken());
}

function isProtectedApiPath(path) {
  const pathname = String(path || "").split("?")[0];
  if (PUBLIC_API_PATHS.has(pathname)) return false;
  if (typeof isPublicShareApi === "function" && isPublicShareApi(pathname)) return false;
  if (/^\/api\/s\/[^/]+$/.test(pathname)) return false;
  return PROTECTED_API_PREFIXES.some((prefix) => pathname === prefix.replace(/\/$/, "") || pathname.startsWith(prefix));
}

export function redirectToLogin() {
  const current = `${window.location.pathname}${window.location.search}`;
  if (window.location.pathname === "/login.html") return;
  window.location.replace(`/login.html?next=${encodeURIComponent(current || "/dashboard.html")}`);
}

export function redirectToVerification(email = "") {
  if (window.location.pathname === "/verify-email.html") return;
  const storedEmail = String(getCurrentUser()?.email || "").trim();
  const targetEmail = String(email || storedEmail).trim();
  clearToken();
  const query = targetEmail ? `?email=${encodeURIComponent(targetEmail)}` : "";
  window.location.replace(`/verify-email.html${query}`);
}

// Static previews and JSON Server commonly run on a different local port than
// the real Node API. Keep production same-origin, but route local /api calls
// to the authenticated Node server so search, CRM, and AI buttons still work.
function apiEndpoint(path) {
  const value = String(path || "");
  if (typeof window === "undefined" || !value.startsWith("/api/")) return value;
  const host = String(window.location.hostname || "").toLowerCase();
  const port = String(window.location.port || "");
  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(host);
  if (isLocal && port && port !== "3000") return `http://localhost:3000${value}`;
  return value;
}

export function requireAuth() {
  const user = getCurrentUser();
  if (user?.verificationRequired && user?.emailVerified === false) {
    redirectToVerification(user.email);
    return false;
  }
  if (hasStoredSession()) return true;
  redirectToLogin();
  return false;
}

async function refreshSession() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) throw new Error("Login required.");

  const response = await fetch(apiEndpoint("/api/auth/refresh"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken })
  });
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();

  if (!response.ok) {
    clearToken();
    const message = typeof payload === "object" && payload?.error ? payload.error.message : "Login required.";
    throw new Error(message);
  }

  setSession(payload);
  return payload.accessToken || payload.idToken;
}

async function fetchWithTimeout(path, options = {}) {
  const timeoutMs = Number(options.timeoutMs || (
    String(path).startsWith("/api/leads/search") ? 70000
      : String(path).startsWith("/api/ai/") ? 65000
        : 30000
  ));
  const controller = new AbortController();
  const externalSignal = options.signal;
  let relayAbort;
  if (externalSignal) {
    relayAbort = () => controller.abort(externalSignal.reason);
    if (externalSignal.aborted) relayAbort();
    else externalSignal.addEventListener("abort", relayAbort, { once: true });
  }
  const timeout = setTimeout(() => controller.abort("request-timeout"), Math.max(1000, timeoutMs));
  const { timeoutMs: _timeoutMs, signal: _signal, ...fetchOptions } = options;
  try {
    return await fetch(apiEndpoint(path), { ...fetchOptions, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError" || controller.signal.aborted) {
      const timedOut = controller.signal.reason === "request-timeout";
      throw new Error(timedOut
        ? "The server took too long to respond. The search/provider may be busy; use Refresh Leads to retry without losing your current filters."
        : "Request cancelled.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    if (externalSignal && relayAbort) externalSignal.removeEventListener("abort", relayAbort);
  }
}

export async function apiFetch(path, options = {}) {
  const requiresAuth = isProtectedApiPath(path);
  if (requiresAuth && !hasUsableToken()) {
    try {
      await refreshSession();
    } catch (error) {
      redirectToLogin();
      throw error;
    }
  }

  const headers = {
    "Content-Type": "application/json",
    ...options.headers
  };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetchWithTimeout(path, {
    ...options,
    headers
  }).catch((error) => {
    if (error?.message) throw error;
    throw new Error("Cannot reach the server. Check your internet connection, then reload the page. If this is the live site, the API may still be deploying — wait a minute and retry.");
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();

  if (!response.ok) {
    const errorCode = typeof payload === "object" && payload?.error?.code ? payload.error.code : "";
    if (errorCode === "ACCOUNT_NOT_VERIFIED") {
      redirectToVerification(payload?.error?.details?.email || getCurrentUser()?.email || "");
    }
    if (response.status === 401) {
      if (requiresAuth && getRefreshToken() && !options.__retriedAfterRefresh) {
        try {
          await refreshSession();
          return apiFetch(path, { ...options, __retriedAfterRefresh: true });
        } catch {
          clearToken();
          redirectToLogin();
        }
      } else {
        clearToken();
        if (requiresAuth) redirectToLogin();
      }
    }
    var errors = payload?.error?.details;
    var fieldMessage = "";
    if (errors && typeof errors === "object") {
      if (errors.fieldErrors && typeof errors.fieldErrors === "object") {
        fieldMessage = Object.entries(errors.fieldErrors)
          .map(function(entry) {
            var field = entry[0];
            var msgs = entry[1];
            return field + ": " + (Array.isArray(msgs) ? msgs.join(", ") : msgs);
          })
          .join(" | ");
      }
    }
    var baseMessage = typeof payload === "object" && payload && payload.error ? payload.error.message : "Request failed";
    if (response.status === 504) {
      baseMessage = "The production function timed out while waiting for a provider. Use Refresh Leads, reduce the search area, or configure Google Places/NVIDIA in Vercel.";
    }
    var message = fieldMessage ? baseMessage + " (" + fieldMessage + ")" : baseMessage;
    var error = new Error(message);
    error.code = typeof payload === "object" && payload && payload.error && payload.error.code ? payload.error.code : undefined;
    error.status = response.status;
    throw error;
  }

  return payload;
}

export function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value || 0);
}

export function scoreClass(score) {
  if (score >= 80) return "hot";
  if (score >= 55) return "high";
  if (score >= 30) return "warning";
  return "low";
}

export function byId(id) {
  return document.getElementById(id);
}
