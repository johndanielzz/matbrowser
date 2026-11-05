import http from "node:http";
import { handleRequest } from "../server/nativeApp.js";

const server = http.createServer((req, res) => {
  handleRequest(req, res);
});

server.listen(0);
const { port } = server.address();
const baseUrl = `http://localhost:${port}`;

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) {
    throw new Error(`${options.method || "GET"} ${path} failed with ${response.status}: ${JSON.stringify(body)}`);
  }
  return body;
}

try {
  const health = await request("/api/health");
  if (health.status !== "ok") throw new Error("Unexpected health payload");

  const indexHtml = await request("/");
  if (!indexHtml.includes("Turn local demand into your next")) throw new Error("Landing page did not render");

  const email = `smoke-${Date.now()}@example.com`;
  const auth = await request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ name: "Smoke Tester", email, password: "Password123" })
  });
  if (auth.verificationRequired) {
    // Login must be blocked until the address is verified.
    let blockedMessage = "";
    try {
      await request("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password: "Password123" })
      });
    } catch (error) {
      blockedMessage = String(error.message || "");
    }
    if (!blockedMessage.includes("ACCOUNT_NOT_VERIFIED")) {
      throw new Error("Login was not blocked for an unverified email address");
    }
    // Regression check: an account waiting for verification must remain locked
    // even if it somehow has an older access or refresh token in the browser.
    const { signAccessToken, signRefreshToken } = await import("../server/middleware/auth.js");
    const unverifiedSession = {
      uid: auth.user?.uid || auth.user?.id,
      email,
      role: "user",
      tokenVersion: 1
    };
    const staleAccessToken = signAccessToken(unverifiedSession);
    const staleRefreshToken = signRefreshToken(unverifiedSession);
    let protectedApiMessage = "";
    try {
      await request("/api/dashboard/metrics", {
        headers: { Authorization: `Bearer ${staleAccessToken}` }
      });
    } catch (error) {
      protectedApiMessage = String(error.message || "");
    }
    if (!protectedApiMessage.includes("ACCOUNT_NOT_VERIFIED")) {
      throw new Error("Unverified account reached a protected dashboard route");
    }
    let refreshMessage = "";
    try {
      await request("/api/auth/refresh", {
        method: "POST",
        body: JSON.stringify({ refreshToken: staleRefreshToken })
      });
    } catch (error) {
      refreshMessage = String(error.message || "");
    }
    if (!refreshMessage.includes("ACCOUNT_NOT_VERIFIED")) {
      throw new Error("Unverified account received a refreshed session");
    }
    // The token must never be returned to a browser when mail delivery is
    // unavailable. The smoke test reads the persisted server-side token only
    // to complete its isolated fixture and verify the endpoint itself.
    let token = auth.verificationToken;
    if (!token) {
      const { FirestoreRepository } = await import("../server/repositories/firestoreRepository.js");
      const smokeUsers = new FirestoreRepository("users");
      token = (await smokeUsers.list({ where: [{ field: "email", op: "==", value: email }], limit: 1 }))[0]?.verificationToken || "";
    }
    if (!token) {
      throw new Error("Register did not persist a server-side verification token");
    }
    const verified = await request("/api/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token })
    });
    if (!verified.verified) throw new Error("Email verification did not confirm the account");
  } else if (!auth.accessToken) {
    throw new Error("Register did not return an access token");
  }

  const login = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password: "Password123" })
  });
  if (!login.accessToken) throw new Error("Login did not return an access token");

  const ownerLogin = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "owner@matleads.local", password: "admin2026" })
  });
  if (ownerLogin.user?.billingStatus !== "owner_free" || ownerLogin.user?.role !== "admin") {
    throw new Error("Owner free enterprise access failed");
  }

  const headers = { Authorization: `Bearer ${login.accessToken}` };
  const ownerHeaders = { Authorization: `Bearer ${ownerLogin.accessToken}` };
  const dashboard = await request("/api/dashboard/metrics", { headers });
  if (!dashboard.metrics || typeof dashboard.metrics.totalLeads !== "number") throw new Error("Dashboard metrics missing");

  const mapLink = "https://www.google.com/maps/@13.4053888,-16.6887424,11z?entry=ttu&g_ep=EgoyMDI2MDYwMS4wIKXMDSoASAFQAw%3D%3D";

  const leads = await request("/api/leads/search", {
    method: "POST",
    headers,
    body: JSON.stringify({ mapLink, keyword: "businesses", radiusMeters: 15000, limit: 10 })
  });
  if (!Array.isArray(leads.leads)) throw new Error("Lead search response is invalid");
  if (!leads.location || Math.abs(leads.location.latitude - 13.4053888) > 0.0001) {
    throw new Error("Google Maps link coordinates were not parsed correctly");
  }

  const firstLead = leads.leads[0];
  if (firstLead) {
    await request(`/api/leads/${encodeURIComponent(firstLead.id)}/save`, { method: "POST", headers, body: "{}" });
    await request(`/api/crm/leads/${encodeURIComponent(firstLead.id)}/stage`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ stage: "Contacted" })
    });
  }

  if (health.integrations.stripe) {
    const billing = await request("/api/billing/stripe/payment-intent", {
      method: "POST",
      headers: { ...headers, "Idempotency-Key": "smoke-test" },
      body: JSON.stringify({ plan: "starter" })
    });
    if (!billing.clientSecret) throw new Error("Stripe endpoint did not return a client secret");
  } else {
    try {
      await request("/api/billing/stripe/payment-intent", {
        method: "POST",
        headers: { ...headers, "Idempotency-Key": "smoke-test" },
        body: JSON.stringify({ plan: "starter" })
      });
      throw new Error("Stripe billing should require credentials in real mode");
    } catch (error) {
      if (!String(error.message).includes("STRIPE_NOT_CONFIGURED")) throw error;
    }
  }

  const admin = await request("/api/admin/overview", { headers: ownerHeaders });
  if (!admin.users) throw new Error("Admin overview missing");

  console.log("Smoke test passed:", health.service);
} finally {
  server.close();
}
