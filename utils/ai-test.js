// Live AI endpoint test — run: node utils/ai-test.js
const base = process.env.BASE_URL || "http://localhost:3111";

async function req(path, { method = "GET", body, token } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const started = Date.now();
  try {
    const res = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const text = await res.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = text; }
    return { status: res.status, ms: Date.now() - started, body: parsed };
  } catch (e) {
    return { status: 0, ms: Date.now() - started, error: e.message };
  }
}

function brief(label, r) {
  const s = typeof r.body === "string" ? r.body : JSON.stringify(r.body);
  console.log(`\n=== ${label} === status=${r.status} ${r.ms}ms`);
  if (r.error) console.log(`FETCH ERROR: ${r.error}`);
  console.log((s || "(empty)").slice(0, 600));
}

async function main() {
  const login = await req("/api/auth/login", { method: "POST", body: { email: "owner@matleads.local", password: "admin2026" } });
  const token = login.body?.accessToken;
  if (!token) { console.log("LOGIN FAILED"); brief("login", login); return; }
  console.log("logged in, token len", token.length);

  brief("status", await req("/api/ai/status", { token }));
  brief("chat", await req("/api/ai/chat", { method: "POST", token, body: { prompt: "Reply with exactly: AI console works." } }));
  brief("tycoon", await req("/api/ai/tycoon", { method: "POST", token, body: { prompt: "Write a 3-line WhatsApp opener for a roof repair business.", lead: {} } }));
  brief("debug", await req("/api/ai/debug", { method: "POST", token, body: { prompt: "Say OK in 3 words." } }));

  // find a lead
  const leads = await req("/api/crm/leads?limit=5", { token });
  const arr = leads.body?.leads || leads.body?.results || (Array.isArray(leads.body) ? leads.body : null);
  const lead = Array.isArray(arr) && arr.length ? arr[0] : leads.body?.lead;
  const leadId = lead?.id || lead?.leadId || "";
  console.log("\nleadId:", leadId || "(none)", "leads.status:", leads.status);
  if (leadId) {
    brief("analyze", await req("/api/ai/analyze", { method: "POST", token, body: { leadId } }));
    brief("outreach", await req("/api/ai/outreach", { method: "POST", token, body: { leadId, type: "cold_email" } }));
    brief("proposal", await req("/api/ai/proposal", { method: "POST", token, body: { leadId, offerKey: "pro_site" } }));
  }

  // website build (slow)
  brief("website", await req("/api/ai/websites", { method: "POST", token, timeout: 150000, body: { businessName: "Test Bakery", style: "modern", pages: 1, lead: { name: "Test Bakery", businessType: "bakery" } } }));
}

main().catch((e) => console.error("FATAL", e));
