import { apiFetch, byId, requireAuth } from "./api.js";

let referralLink = "";
let offerCatalog = [];
let currentInvoices = [];

function moneyCents(cents) {
  return `$${(Number(cents || 0) / 100).toFixed(2)}`;
}

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
    const url = new URL(raw, window.location.origin);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function localDatePlusDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function setInvoiceMessage(message, kind = "") {
  const target = byId("invMsg");
  if (!target) return;
  target.textContent = message;
  target.className = `notice${kind ? ` ${kind}` : ""}`;
}

function renderReferral(referral) {
  const target = byId("refBox");
  if (!target) return;
  const credits = (referral.rows || []).reduce((sum, row) => sum + Number(row.searchCreditsAwarded || 0), 0);
  target.innerHTML = `<strong>${escapeHtml(referral.code)}</strong><br>${escapeHtml(referralLink)}<br><span>You get <strong>2 lead-search credits</strong> for every new user who signs up and verifies through your link.</span><br>Credits earned: <strong>${credits}</strong> &bull; Pending ${escapeHtml(moneyCents(referral.pendingCents))} &bull; Earned ${escapeHtml(moneyCents(referral.paidCents))} &bull; ${Number(referral.rows?.length || 0)} referral(s)`;
  return credits;
}

function renderMetrics(referral, invoices, creditAwards) {
  const target = byId("earnMetrics");
  if (!target) return;
  const open = invoices.filter((invoice) => invoice.status !== "paid");
  const paid = invoices.filter((invoice) => invoice.status === "paid");
  const openValue = open.reduce((sum, invoice) => sum + Number(invoice.amountCents || 0), 0);
  const paidValue = paid.reduce((sum, invoice) => sum + Number(invoice.amountCents || 0), 0);
  target.innerHTML = [
    ["Referral pending", moneyCents(referral.pendingCents)],
    ["Referral earned", moneyCents(referral.paidCents)],
    ["Search credits earned", String(creditAwards || 0)],
    ["Open requests", `${open.length} - ${moneyCents(openValue)}`],
    ["Recorded payments", moneyCents(paidValue)]
  ].map(([label, value]) => `<article class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`).join("");
}

function renderOffers() {
  const select = byId("invOffer");
  if (!select) return;
  const selected = select.value;
  select.innerHTML = offerCatalog.length
    ? offerCatalog.map((offer) => `<option value="${escapeHtml(offer.key)}">${escapeHtml(offer.name)} - ${escapeHtml(moneyCents(Number(offer.priceUsd || 0) * 100))}</option>`).join("")
    : `<option value="">No offers configured</option>`;
  const choice = offerCatalog.find((offer) => offer.key === selected) || offerCatalog[0];
  if (choice) {
    select.value = choice.key;
    if (!byId("invAmount").value) byId("invAmount").value = choice.priceUsd;
  }
}

function renderInvoiceList(invoices) {
  const target = byId("invoiceList");
  if (!target) return;
  if (!invoices.length) {
    target.innerHTML = `<div class="empty-state">No payment requests yet. Use Client Closer or create one above from a real lead.</div>`;
    return;
  }
  target.innerHTML = invoices.map((invoice) => {
    const payLink = safeHref(invoice.payLink, { allowRelative: true });
    const paymentUrl = safeHref(invoice.paymentUrl);
    const label = invoice.clientName || invoice.leadName || "Client work";
    return `<article class="closer-invoice-row">
      <div>
        <strong>${escapeHtml(label)}</strong>
        <span>${escapeHtml(invoice.offerName || "Custom client work")} - ${escapeHtml(moneyCents(invoice.amountCents))} - ${escapeHtml(invoice.status || "open")}${invoice.dueDate ? ` - due ${escapeHtml(invoice.dueDate)}` : ""}${paymentUrl ? " - provider link attached" : " - provider link not attached"}</span>
      </div>
      <div class="toolbar">
        <a class="btn btn-ghost" href="${escapeHtml(payLink || "#")}" target="_blank" rel="noreferrer">Open request</a>
        <button class="btn btn-secondary" type="button" data-copy-invoice="${escapeHtml(invoice.id)}">Copy link</button>
        ${paymentUrl ? `<a class="btn btn-secondary" href="${escapeHtml(paymentUrl)}" target="_blank" rel="noreferrer">Payment provider</a>` : ""}
        ${invoice.status !== "paid" ? `<button class="btn btn-secondary" type="button" data-mark-invoice="${escapeHtml(invoice.id)}">Confirm paid</button>` : ""}
      </div>
    </article>`;
  }).join("");
}

async function loadEarnData() {
  const [referral, offers, invoices, payouts] = await Promise.all([
    apiFetch("/api/earn/referral"),
    apiFetch("/api/earn/offers"),
    apiFetch("/api/earn/invoices"),
    apiFetch("/api/earn/payouts")
  ]);
  referralLink = new URL(referral.linkPath, window.location.origin).href;
  offerCatalog = Array.isArray(offers.offers) ? offers.offers : [];
  currentInvoices = Array.isArray(invoices.invoices) ? invoices.invoices : [];
  const credits = renderReferral(referral) || 0;
  renderMetrics(referral, currentInvoices, credits);
  renderOffers();
  renderInvoiceList(currentInvoices);
  const payoutMessage = payouts.payouts?.length
    ? `${payouts.payouts.length} payout request(s). Latest: ${payouts.payouts[0].status}`
    : "Payouts are reviewed by admin.";
  if (byId("payoutMsg")) byId("payoutMsg").textContent = payoutMessage;
}

async function copyText(text, button) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    const original = button?.textContent;
    if (button) {
      button.textContent = "Copied";
      setTimeout(() => { button.textContent = original; }, 1200);
    }
  } catch {
    setInvoiceMessage("Clipboard access was blocked. Open the request and copy its URL manually.", "error");
  }
}

async function confirmPayment(invoice) {
  if (!invoice?.id) return;
  const reference = window.prompt("Payment reference (optional):", "");
  if (reference === null) return;
  try {
    await apiFetch(`/api/earn/invoices/${encodeURIComponent(invoice.id)}/paid`, {
      method: "POST",
      body: JSON.stringify({ transactionId: reference })
    });
    setInvoiceMessage("Payment recorded. Update the associated CRM lead if you have one.", "success");
    await loadEarnData();
  } catch (error) {
    setInvoiceMessage(error.message || "Payment confirmation failed.", "error");
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  if (!requireAuth()) return;
  if (byId("invDueDate")) byId("invDueDate").value = localDatePlusDays(7);
  try {
    await loadEarnData();
  } catch (error) {
    if (byId("refBox")) byId("refBox").textContent = error.message || "Could not load your earning workspace.";
  }

  byId("copyRef")?.addEventListener("click", (event) => copyText(referralLink, event.currentTarget));
  byId("shareRefWa")?.addEventListener("click", () => {
    if (referralLink) window.open(`https://wa.me/?text=${encodeURIComponent(`Join me here: ${referralLink}`)}`, "_blank", "noopener,noreferrer");
  });
  byId("invOffer")?.addEventListener("change", (event) => {
    const offer = offerCatalog.find((item) => item.key === event.target.value);
    if (offer) byId("invAmount").value = offer.priceUsd;
  });
  byId("invRefresh")?.addEventListener("click", async () => {
    try {
      await loadEarnData();
      setInvoiceMessage("Payment requests refreshed.", "success");
    } catch (error) {
      setInvoiceMessage(error.message || "Could not refresh payment requests.", "error");
    }
  });
  byId("invoiceList")?.addEventListener("click", async (event) => {
    const copyButton = event.target.closest("[data-copy-invoice]");
    const paidButton = event.target.closest("[data-mark-invoice]");
    if (copyButton) {
      const invoice = currentInvoices.find((item) => String(item.id) === String(copyButton.dataset.copyInvoice));
      const href = safeHref(invoice?.payLink, { allowRelative: true });
      if (!href) return setInvoiceMessage("The payment request link is unavailable.", "error");
      return copyText(new URL(href, window.location.origin).href, copyButton);
    }
    if (paidButton) {
      const invoice = currentInvoices.find((item) => String(item.id) === String(paidButton.dataset.markInvoice));
      return confirmPayment(invoice);
    }
  });
  byId("invoiceForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const paymentUrl = String(byId("invPaymentUrl").value || "").trim();
    if (paymentUrl && !safeHref(paymentUrl)) {
      setInvoiceMessage("Payment link must be a valid http(s) URL.", "error");
      return;
    }
    const button = byId("invCreate");
    button.disabled = true;
    setInvoiceMessage("Creating a private payment request...");
    try {
      const invoice = await apiFetch("/api/earn/invoices", {
        method: "POST",
        body: JSON.stringify({
          offerKey: byId("invOffer").value,
          amountUsd: Number(byId("invAmount").value),
          leadName: byId("invLead").value,
          clientName: byId("invClient").value,
          clientEmail: byId("invEmail").value,
          dueDate: byId("invDueDate").value,
          paymentUrl,
          paymentInstructions: byId("invPaymentInstructions").value,
          notes: byId("invNotes").value
        })
      });
      const href = safeHref(invoice.invoice?.payLink, { allowRelative: true });
      setInvoiceMessage(href ? "Payment request created. Review it in the list below before sharing." : "Payment request created.", "success");
      byId("invPaymentInstructions").value = "";
      byId("invNotes").value = "";
      await loadEarnData();
    } catch (error) {
      setInvoiceMessage(error.message || "Could not create the payment request.", "error");
    } finally {
      button.disabled = false;
    }
  });
  byId("payoutForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await apiFetch("/api/earn/payouts", {
        method: "POST",
        body: JSON.stringify({ amountUsd: Number(byId("payoutAmount").value), destination: byId("payoutDest").value })
      });
      if (byId("payoutMsg")) byId("payoutMsg").textContent = "Payout requested.";
      await loadEarnData();
    } catch (error) {
      if (byId("payoutMsg")) byId("payoutMsg").textContent = error.message || "Payout request failed.";
    }
  });
});
