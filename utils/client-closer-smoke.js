import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";

// Keep this integration test isolated from normal local development records.
const storePath = path.resolve(process.cwd(), "data", `client-closer-smoke-${process.pid}.json`);
process.env.LOCAL_DATA_FILE = storePath;

const { handleRequest } = await import("../server/nativeApp.js");

const server = http.createServer((req, res) => handleRequest(req, res));
server.listen(0);
const { port } = server.address();
const baseUrl = `http://127.0.0.1:${port}`;

async function request(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
  const payload = await response.json();
  return { response, payload };
}

async function createVerifiedUser(label) {
  const email = `closer-${label}-${Date.now()}@example.com`;
  const registered = await request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ name: `Closer ${label}`, email, password: "Password123" })
  });
  if (!registered.response.ok) throw new Error(`Register failed: ${JSON.stringify(registered.payload)}`);
  if (registered.payload.verificationRequired) {
    const token = registered.payload.verificationToken;
    if (!token) throw new Error("Local verification token was not available for the smoke test.");
    const verified = await request("/api/auth/verify-email", { method: "POST", body: JSON.stringify({ token }) });
    if (!verified.response.ok || !verified.payload.verified) throw new Error("Verification failed.");
  }
  const loggedIn = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password: "Password123" })
  });
  if (!loggedIn.response.ok || !loggedIn.payload.accessToken) throw new Error("Login failed.");
  return { headers: { Authorization: `Bearer ${loggedIn.payload.accessToken}` } };
}

try {
  const owner = await createVerifiedUser("owner");
  const outsider = await createVerifiedUser("outsider");
  const leadId = `local-closer-${Date.now()}`;
  const localLead = {
    id: leadId,
    name: "Example & Sons <script>alert(1)</script>",
    category: "Restaurant",
    address: "10 Main Street",
    city: "Exampletown",
    country: "United States",
    phone: "+1 555 0100",
    email: "hello@example.test",
    localStage: "Contacted",
    opportunityScore: 72,
    latitude: 40.7128,
    longitude: -74.006,
    raw: { shouldNotPersist: true },
    details: {
      contact: { phone: "+1 555 0100", website: "javascript:alert(1)" },
      social: { facebook: "https://www.facebook.com/example", malicious: "javascript:alert(1)" },
      business: { description: "A real local business record." }
    }
  };

  const imported = await request(`/api/leads/${encodeURIComponent(leadId)}/save`, {
    method: "POST",
    headers: owner.headers,
    body: JSON.stringify({ lead: localLead })
  });
  if (!imported.response.ok) throw new Error(`Local lead import failed: ${JSON.stringify(imported.payload)}`);
  if (imported.payload.lead.raw || imported.payload.lead.details?.social?.malicious || imported.payload.lead.websiteUrl) {
    throw new Error("Local lead import did not remove unsafe provider data.");
  }
  if (imported.payload.lead.stage !== "Contacted" || imported.payload.lead.ownerId === undefined) {
    throw new Error("Imported lead did not retain its valid CRM stage and owner.");
  }

  const crm = await request("/api/crm/leads", { headers: owner.headers });
  if (!crm.response.ok || !crm.payload.leads?.some((lead) => lead.id === leadId)) {
    throw new Error("Imported lead is not available in the owner CRM.");
  }

  const invoiceCreate = await request("/api/earn/invoices", {
    method: "POST",
    headers: owner.headers,
    body: JSON.stringify({
      leadId,
      leadName: "Example & Sons",
      offerKey: "pro_site",
      amountUsd: 500,
      clientName: "Example Owner",
      clientEmail: "client@example.test",
      dueDate: "2026-12-31",
      paymentUrl: "https://example.test/pay/secure-token",
      paymentInstructions: "Use the secure provider link after approving the scope.",
      notes: "Private proposal notes must not be exposed publicly."
    })
  });
  if (!invoiceCreate.response.ok || !invoiceCreate.payload.invoice?.id) {
    throw new Error(`Invoice creation failed: ${JSON.stringify(invoiceCreate.payload)}`);
  }
  const invoice = invoiceCreate.payload.invoice;

  const publicInvoice = await request(`/api/earn/invoices/${encodeURIComponent(invoice.id)}`);
  if (!publicInvoice.response.ok || publicInvoice.payload.invoice?.paymentUrl !== "https://example.test/pay/secure-token") {
    throw new Error("Public payment request did not return its verified provider URL.");
  }
  if ("ownerEmail" in publicInvoice.payload.invoice || "clientEmail" in publicInvoice.payload.invoice || "notes" in publicInvoice.payload.invoice) {
    throw new Error("Public payment request leaked private invoice data.");
  }

  const forbidden = await request(`/api/earn/invoices/${encodeURIComponent(invoice.id)}/paid`, {
    method: "POST",
    headers: outsider.headers,
    body: JSON.stringify({ transactionId: "not-allowed" })
  });
  if (forbidden.response.status !== 403 || forbidden.payload.error?.code !== "INVOICE_OWNER_REQUIRED") {
    throw new Error("A non-owner was able to confirm an invoice payment.");
  }

  const paid = await request(`/api/earn/invoices/${encodeURIComponent(invoice.id)}/paid`, {
    method: "POST",
    headers: owner.headers,
    body: JSON.stringify({ transactionId: "owner-confirmed" })
  });
  if (!paid.response.ok || paid.payload.invoice?.status !== "paid") {
    throw new Error("Invoice owner could not confirm payment.");
  }

  console.log("Client Closer smoke test passed.");
} finally {
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(storePath, { force: true }).catch(() => {});
}
