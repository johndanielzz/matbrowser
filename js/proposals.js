import { apiFetch, byId, formatCurrency, requireAuth } from "./api.js";

let offers = [];
let crmLeads = [];
let currentLead = null;
let lastDraft = "";
let lastInvoice = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeHref(value, { allowRelative = false } = {}) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (allowRelative && raw.startsWith("/")) return raw;
  try {
    const parsed = new URL(raw, window.location.origin);
    if (!["http:", "https:"].includes(parsed.protocol)) return "";
    return parsed.href;
  } catch {
    return "";
  }
}

function localDatePlusDays(days = 7) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function setStatus(message, kind = "") {
  const target = byId("propStatus");
  if (!target) return;
  target.textContent = message;
  target.className = `notice${kind ? ` ${kind}` : ""}`;
}

function publicContact(lead = {}) {
  return lead.phone || lead.email || lead.details?.contact?.phone || lead.details?.contact?.email
    || Object.keys(lead.details?.social || {}).length;
}

function whatsappDraftLink(lead, message) {
  const phone = String(lead?.phone || lead?.details?.contact?.phone || lead?.details?.contact?.mobile || "").trim();
  const international = phone.startsWith("+")
    ? phone.slice(1).replace(/\D/g, "")
    : phone.startsWith("00")
      ? phone.slice(2).replace(/\D/g, "")
      : "";
  // Only open a direct conversation when the public record contains an
  // explicit international-format number. A local number is not guessed.
  if (/^\d{8,15}$/.test(international)) {
    return { href: `https://wa.me/${international}?text=${encodeURIComponent(message)}`, direct: true };
  }
  return { href: `https://wa.me/?text=${encodeURIComponent(message)}`, direct: false };
}

function renderLeadSummary(lead) {
  const target = byId("propLeadSummary");
  if (!target) return;
  if (!lead) {
    target.className = "notice closer-summary";
    target.textContent = "Select or load a lead to see its verified business details.";
    return;
  }
  const contact = publicContact(lead) ? "Public contact data available" : "No public contact method stored";
  const website = lead.websiteUrl ? "Website listed" : "No website URL listed";
  target.className = "notice closer-summary success";
  target.innerHTML = `
    <strong>${escapeHtml(lead.name || "Unnamed business")}</strong>
    <span>${escapeHtml(lead.businessType || lead.category || "Local business")} · ${escapeHtml(lead.address || "Location not listed")}</span>
    <span>${escapeHtml(contact)} · ${escapeHtml(website)} · Opportunity ${Number(lead.opportunityScore || lead.audit?.score || 0)}/100</span>
  `;
}

function setLeadFields(lead) {
  currentLead = lead || null;
  const id = String(lead?.id || "");
  if (byId("propLead")) byId("propLead").value = id;
  if (lead?.name && !byId("propClient").value.trim()) byId("propClient").value = lead.name;
  const email = lead?.email || lead?.details?.contact?.email || "";
  if (email && !byId("propEmail").value.trim()) byId("propEmail").value = email;
  renderLeadSummary(lead);
  byId("propAi").disabled = !lead;
}

async function loadLead(id, fallback = null) {
  const leadId = String(id || "").trim();
  if (!leadId) {
    setStatus("Enter or select a lead ID first.", "error");
    return null;
  }
  setStatus("Loading the authorized lead record...");
  try {
    const result = await apiFetch(`/api/leads/${encodeURIComponent(leadId)}`);
    setLeadFields(result.lead);
    setStatus("Lead loaded. Review the verified details, then shape the offer.", "success");
    return result.lead;
  } catch (error) {
    // Browser-local saved leads can be opened from the dashboard. They are
    // displayed as a local draft and are imported into the account CRM only
    // after the user explicitly creates a proposal.
    if (fallback && String(fallback.id || "") === leadId) {
      setLeadFields(fallback);
      setStatus("This lead is currently browser-local. It will be copied to your account CRM when you create the proposal.");
      return fallback;
    }
    setLeadFields(null);
    setStatus(error.message || "Lead could not be loaded.", "error");
    return null;
  }
}

async function loadOffers() {
  const select = byId("propOffer");
  try {
    const result = await apiFetch("/api/earn/offers");
    offers = Array.isArray(result.offers) ? result.offers : [];
    select.innerHTML = offers.length
      ? offers.map((offer) => `<option value="${escapeHtml(offer.key)}">${escapeHtml(offer.name)} — ${formatCurrency(offer.priceUsd)}</option>`).join("")
      : `<option value="">No offers configured</option>`;
    const preferred = offers.find((offer) => offer.key === "pro_site") || offers[0];
    if (preferred) {
      select.value = preferred.key;
      byId("propAmount").value = preferred.priceUsd;
    }
  } catch (error) {
    select.innerHTML = `<option value="">Offers unavailable</option>`;
    setStatus(`Could not load the configured offer catalog: ${error.message}`, "error");
  }
}

async function loadCrmLeads() {
  const select = byId("propLeadSelect");
  try {
    const result = await apiFetch("/api/crm/leads");
    crmLeads = Array.isArray(result.leads) ? result.leads : [];
    select.innerHTML = crmLeads.length
      ? `<option value="">Choose a saved lead...</option>${crmLeads.map((lead) => `<option value="${escapeHtml(lead.id)}">${escapeHtml(lead.name || "Unnamed business")} — ${escapeHtml(lead.stage || "New")}</option>`).join("")}`
      : `<option value="">No saved CRM leads yet — paste an ID</option>`;
  } catch (error) {
    select.innerHTML = `<option value="">CRM leads unavailable</option>`;
    setStatus(`Could not load CRM leads: ${error.message}`, "error");
  }
}

function proposalDraft(lead, offer, amount, dueDate, clientName) {
  const business = clientName || lead?.name || "the business";
  const location = lead?.address ? ` in ${lead.address}` : "";
  const observation = lead?.websiteUrl
    ? "The public listing includes a website, so the scope should focus on conversion, clarity, local visibility, and measurable contact paths."
    : "The public listing does not include a website URL, so the scope prioritizes a trustworthy web presence and direct contact paths.";
  const contact = [lead?.phone, lead?.email || lead?.details?.contact?.email].filter(Boolean).join(" · ") || "No direct contact was listed in the public record.";
  const scope = offer?.blurb || "A focused digital service package based on the selected offer.";
  return [
    `PROPOSAL — ${business}`,
    "",
    `Prepared for: ${business}${location}`,
    `Recommended service: ${offer?.name || "Custom client work"}`,
    `Investment: ${formatCurrency(amount)} USD`,
    `Target due date: ${dueDate || "To be agreed"}`,
    "",
    "WHY THIS IS RECOMMENDED",
    observation,
    `Public contact record used for preparation: ${contact}`,
    "",
    "SCOPE",
    scope,
    "The final scope, timeline, assets, approvals, and revision limits should be confirmed in writing before work begins.",
    "",
    "NEXT STEP",
    "Review this draft with the client, confirm the scope and amount, then share the payment request. Work should begin only after written approval and the agreed payment milestone.",
    "",
    "Prepared with MAT LEADS AI PRO X from the authorized lead record. This is a draft, not a guarantee of results."
  ].join("\n");
}

function invoiceLink(invoice) {
  return safeHref(invoice?.payLink, { allowRelative: true });
}

function renderInvoiceActions(invoice) {
  const box = byId("propInvoiceActions");
  const meta = byId("propInvoiceMeta");
  const link = byId("propInvoiceLink");
  if (!box || !meta || !link) return;
  if (!invoice) {
    box.hidden = true;
    return;
  }
  const href = invoiceLink(invoice);
  link.href = href || "#";
  link.hidden = !href;
  const external = safeHref(invoice.paymentUrl);
  meta.innerHTML = `Payment request <strong>${escapeHtml(invoice.id)}</strong> · ${escapeHtml(formatCurrency(Number(invoice.amountCents || 0) / 100))} · ${escapeHtml(invoice.status || "open")}${invoice.dueDate ? ` · due ${escapeHtml(invoice.dueDate)}` : ""}${external ? " · provider link attached" : " · add your provider link before sharing"}`;
  box.hidden = false;
  byId("propMarkPaid").disabled = invoice.status === "paid";
}

function renderRecentInvoices(invoices) {
  const target = byId("propRecent");
  if (!target) return;
  if (!invoices.length) {
    target.innerHTML = `<div class="empty-state">No payment requests yet. Create one from a verified CRM lead above.</div>`;
    return;
  }
  target.innerHTML = invoices.map((invoice) => {
    const href = invoiceLink(invoice);
    return `<div class="closer-invoice-row">
      <div><strong>${escapeHtml(invoice.leadName || invoice.clientName || "Client work")}</strong><span>${escapeHtml(invoice.offerName || "Custom work")} · ${escapeHtml(formatCurrency(Number(invoice.amountCents || 0) / 100))} · ${escapeHtml(invoice.status || "open")}${invoice.dueDate ? ` · due ${escapeHtml(invoice.dueDate)}` : ""}</span></div>
      <div class="toolbar"><a class="btn btn-ghost" href="${escapeHtml(href || "#")}" target="_blank" rel="noreferrer">Open</a><button class="btn btn-secondary" type="button" data-copy-invoice="${escapeHtml(invoice.id)}">Copy link</button>${invoice.status !== "paid" ? `<button class="btn btn-secondary" type="button" data-mark-invoice="${escapeHtml(invoice.id)}">Mark paid</button>` : ""}</div>
    </div>`;
  }).join("");
}

async function loadRecentInvoices() {
  try {
    const result = await apiFetch("/api/earn/invoices");
    renderRecentInvoices(Array.isArray(result.invoices) ? result.invoices : []);
  } catch (error) {
    byId("propRecent").innerHTML = `<div class="error-state">${escapeHtml(error.message)}</div>`;
  }
}

async function ensureLeadSaved() {
  if (!currentLead?.id) throw new Error("Load an authorized lead before creating a payment request.");
  const result = await apiFetch(`/api/leads/${encodeURIComponent(currentLead.id)}/save`, {
    method: "POST",
    // A lead loaded from browser-local storage has no server record yet. The
    // API imports only its vetted display fields and removes raw provider data.
    body: JSON.stringify({ lead: currentLead })
  });
  currentLead = result.lead || currentLead;
  return currentLead;
}

async function createCloserPackage(event) {
  event.preventDefault();
  const leadId = String(byId("propLead").value || "").trim();
  if (!currentLead || String(currentLead.id) !== leadId) {
    const loaded = await loadLead(leadId);
    if (!loaded) return;
  }
  const offer = offers.find((item) => item.key === byId("propOffer").value);
  const amount = Number(byId("propAmount").value);
  if (!offer) return setStatus("Choose an available offer first.", "error");
  if (!Number.isFinite(amount) || amount < 1 || amount > 100000) return setStatus("Enter an amount between $1 and $100,000.", "error");
  const clientName = String(byId("propClient").value || currentLead.name || "").trim();
  const clientEmail = String(byId("propEmail").value || "").trim();
  const paymentUrl = String(byId("propPaymentUrl").value || "").trim();
  if (paymentUrl && !safeHref(paymentUrl)) return setStatus("Payment link must be a valid http(s) URL.", "error");
  const dueDate = String(byId("propDueDate").value || "").trim();
  const draft = proposalDraft(currentLead, offer, amount, dueDate, clientName);
  const button = byId("propCreate");
  button.disabled = true;
  lastDraft = draft;
  byId("propOut").textContent = draft;
  setStatus("Saving the lead to your CRM and creating the payment request... ");
  try {
    const savedLead = await ensureLeadSaved();
    const invoiceResult = await apiFetch("/api/earn/invoices", {
      method: "POST",
      body: JSON.stringify({
        leadId: savedLead.id,
        leadName: savedLead.name || clientName,
        offerKey: offer.key,
        amountUsd: amount,
        clientName,
        clientEmail,
        dueDate,
        paymentUrl,
        paymentInstructions: byId("propPaymentInstructions").value,
        notes: draft.slice(0, 1000)
      })
    });
    lastInvoice = invoiceResult.invoice;
    let crmWarning = "";
    try {
      await apiFetch(`/api/crm/leads/${encodeURIComponent(savedLead.id)}/stage`, { method: "PATCH", body: JSON.stringify({ stage: "Proposal Sent" }) });
      await apiFetch(`/api/crm/leads/${encodeURIComponent(savedLead.id)}/notes`, {
        method: "POST",
        body: JSON.stringify({ note: `Proposal created for ${offer.name} at ${formatCurrency(amount)}. Payment request ${lastInvoice.id}.`, tags: ["proposal", offer.key] })
      });
    } catch (error) {
      crmWarning = ` Payment request was created, but the CRM stage could not be updated: ${error.message}`;
    }
    const requestUrl = invoiceLink(lastInvoice);
    lastDraft = `${draft}\n\nPAYMENT REQUEST\n${requestUrl || "Payment request link unavailable"}${paymentUrl ? `\nPayment-provider link: ${paymentUrl}` : "\nNo provider payment link was attached; add one before sharing."}`;
    byId("propOut").textContent = lastDraft;
    renderInvoiceActions(lastInvoice);
    setStatus(`Proposal and payment request created. Review it before sharing.${crmWarning}`, crmWarning ? "" : "success");
    await loadRecentInvoices();
  } catch (error) {
    setStatus(error.message || "Could not create the payment request.", "error");
  } finally {
    button.disabled = false;
  }
}

async function improveWithAi() {
  if (!currentLead?.id) return setStatus("Load a lead before asking AI to improve the draft.", "error");
  const button = byId("propAi");
  button.disabled = true;
  setStatus("Asking the configured AI provider for an improved draft...");
  try {
    const result = await apiFetch("/api/ai/proposal", { method: "POST", body: JSON.stringify({ leadId: currentLead.id, offerKey: byId("propOffer").value || "pro_site" }) });
    const content = String(result.content || "").trim();
    if (!content) throw new Error("The AI provider returned an empty proposal.");
    lastDraft = content + (lastInvoice ? `\n\nPayment request: ${invoiceLink(lastInvoice)}` : "");
    byId("propOut").textContent = lastDraft;
    setStatus("AI draft received. Review every claim and price before sharing.", "success");
  } catch (error) {
    setStatus(error.message || "AI proposal generation failed. The structured draft is still available.", "error");
  } finally {
    button.disabled = !currentLead;
  }
}

async function markPaid(invoice = lastInvoice) {
  if (!invoice?.id) return;
  const transactionId = window.prompt("Payment reference (optional):", "");
  if (transactionId === null) return;
  try {
    const result = await apiFetch(`/api/earn/invoices/${encodeURIComponent(invoice.id)}/paid`, {
      method: "POST",
      body: JSON.stringify({ transactionId })
    });
    lastInvoice = result.invoice;
    renderInvoiceActions(lastInvoice);
    if (currentLead?.id) {
      try {
        await apiFetch(`/api/crm/leads/${encodeURIComponent(currentLead.id)}/stage`, { method: "PATCH", body: JSON.stringify({ stage: "Won" }) });
        await apiFetch(`/api/crm/leads/${encodeURIComponent(currentLead.id)}/notes`, { method: "POST", body: JSON.stringify({ note: `Payment confirmed for invoice ${lastInvoice.id}.`, tags: ["paid", "won"] }) });
      } catch {}
    }
    setStatus("Payment recorded by the account owner and the lead moved to Won.", "success");
    await loadRecentInvoices();
  } catch (error) {
    setStatus(error.message || "Payment confirmation failed.", "error");
  }
}

async function copyText(text, button) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    const original = button?.textContent;
    if (button) { button.textContent = "Copied"; setTimeout(() => { button.textContent = original; }, 1200); }
  } catch {
    setStatus("Clipboard access was blocked. Select and copy the draft manually.", "error");
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  if (!requireAuth()) return;
  byId("propDueDate").value = localDatePlusDays(7);
  await Promise.all([loadOffers(), loadCrmLeads(), loadRecentInvoices()]);

  const query = new URLSearchParams(window.location.search);
  let fallback = null;
  try { fallback = JSON.parse(sessionStorage.getItem("mat_deal_closer_lead") || "null"); } catch {}
  const requestedId = query.get("leadId") || fallback?.id || "";
  if (requestedId) {
    byId("propLead").value = requestedId;
    await loadLead(requestedId, fallback);
    const option = [...byId("propLeadSelect").options].find((item) => item.value === requestedId);
    if (option) byId("propLeadSelect").value = requestedId;
  }

  byId("propLeadSelect").addEventListener("change", async (event) => {
    const id = event.target.value;
    byId("propLead").value = id;
    await loadLead(id);
  });
  byId("propLoadLead").addEventListener("click", () => loadLead(byId("propLead").value));
  byId("propOffer").addEventListener("change", (event) => {
    const offer = offers.find((item) => item.key === event.target.value);
    if (offer) byId("propAmount").value = offer.priceUsd;
  });
  byId("propForm").addEventListener("submit", createCloserPackage);
  byId("propAi").addEventListener("click", improveWithAi);
  byId("propCopy").addEventListener("click", (event) => copyText(lastDraft || byId("propOut").textContent, event.currentTarget));
  byId("propWa").addEventListener("click", () => {
    if (!lastDraft) return setStatus("Build or improve the proposal before opening a WhatsApp draft.", "error");
    const draft = whatsappDraftLink(currentLead, lastDraft.slice(0, 1800));
    if (!draft.direct) setStatus("No verified international WhatsApp number is stored, so choose the recipient manually in WhatsApp.");
    window.open(draft.href, "_blank", "noopener,noreferrer");
  });
  byId("propEmailShare").addEventListener("click", () => {
    const email = String(byId("propEmail").value || "").trim();
    if (!email) return setStatus("Add a client email before opening an email draft.", "error");
    window.location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(`Proposal for ${currentLead?.name || "your business"}`)}&body=${encodeURIComponent(lastDraft || byId("propOut").textContent)}`;
  });
  byId("propMarkPaid").addEventListener("click", () => markPaid());
  byId("propRefreshInvoices").addEventListener("click", loadRecentInvoices);
  byId("propRecent").addEventListener("click", async (event) => {
    const copy = event.target.closest("[data-copy-invoice]");
    const paid = event.target.closest("[data-mark-invoice]");
    if (copy) {
      const invoice = (await apiFetch("/api/earn/invoices")).invoices?.find((item) => item.id === copy.dataset.copyInvoice);
      if (invoice) await copyText(new URL(invoiceLink(invoice), window.location.origin).href, copy);
    }
    if (paid) {
      const invoice = (await apiFetch("/api/earn/invoices")).invoices?.find((item) => item.id === paid.dataset.markInvoice);
      if (invoice) await markPaid(invoice);
    }
  });
});
