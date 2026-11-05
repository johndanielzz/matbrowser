import { apiFetch, byId, requireAuth } from "./api.js";

let lastText = "";
let lastLead = "";
let busy = false;

function setStatus(message, kind = "") {
  const status = byId("outStatus");
  if (!status) return;
  status.textContent = message;
  status.className = kind ? `muted-value ${kind}` : "muted-value";
}

function setResult(message, kind = "") {
  const result = byId("outResult");
  if (!result) return;
  result.textContent = message;
  result.dataset.state = kind || "idle";
}

function setBusy(isBusy) {
  busy = isBusy;
  const generate = byId("outGenerate");
  const hasDraft = Boolean(lastText && lastLead);
  if (generate) {
    generate.disabled = isBusy;
    generate.textContent = isBusy ? "Generating a real draft..." : "Generate an editable draft";
  }
  ["outCopy", "outWa", "outRecord", "outInvoice"].forEach((id) => {
    const button = byId(id);
    if (button) button.disabled = isBusy || !hasDraft;
  });
}

function addOption(select, value, label) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  select.append(option);
  return option;
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Copy is unavailable in this browser. Select the draft and copy it manually.");
}

async function assertAiConfigured() {
  const status = await apiFetch("/api/ai/status").catch(() => null);
  if (status && !status.configured) {
    throw new Error(status.hint || "AI is not configured on the server. Add NVIDIA_API_KEY in Vercel, then redeploy.");
  }
  return status;
}

async function loadOffers() {
  const select = byId("outOffer");
  if (!select) return;
  select.replaceChildren();
  addOption(select, "", "No paid offer attached");
  const result = await apiFetch("/api/earn/offers");
  for (const offer of Array.isArray(result.offers) ? result.offers : []) {
    const label = `${offer.name || "Offer"} — $${Number(offer.priceUsd || 0).toLocaleString("en-US")}`;
    const option = addOption(select, String(offer.key || ""), label);
    option.dataset.offerName = String(offer.name || "paid service");
  }
}

async function loadSavedLeads(initialLeadId = "") {
  const select = byId("outLeadPicker");
  if (!select) return;
  select.replaceChildren();
  addOption(select, "", "Choose a saved lead (optional)");
  try {
    const result = await apiFetch("/api/crm/leads");
    const leads = Array.isArray(result.leads) ? result.leads.slice(0, 250) : [];
    for (const lead of leads) {
      const id = String(lead.id || "");
      if (!id) continue;
      const detail = [lead.category, lead.city || lead.location].filter(Boolean).join(" · ");
      const option = addOption(select, id, detail ? `${lead.name || "Unnamed lead"} — ${detail}` : (lead.name || id));
      if (id === initialLeadId) option.selected = true;
    }
    if (!leads.length) addOption(select, "", "No saved leads yet — paste a lead ID from Find Leads");
  } catch {
    addOption(select, "", "Saved leads could not be loaded — paste a lead ID instead");
  }
}

function selectedOfferName() {
  const select = byId("outOffer");
  const option = select?.selectedOptions?.[0];
  return option?.dataset.offerName || "";
}

document.addEventListener("DOMContentLoaded", async () => {
  if (!requireAuth()) return;
  const query = new URLSearchParams(window.location.search);
  const initialLeadId = query.get("leadId") || "";
  if (initialLeadId) byId("outLead").value = initialLeadId;
  setBusy(false);

  await Promise.allSettled([loadOffers(), loadSavedLeads(initialLeadId)]);

  byId("outLeadPicker")?.addEventListener("change", (event) => {
    const leadId = String(event.target.value || "");
    if (leadId) {
      byId("outLead").value = leadId;
      setStatus("Saved lead selected. Choose a message type and generate a draft.");
    }
  });

  byId("outForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return;
    const leadId = byId("outLead").value.trim();
    if (!leadId) {
      setResult("Choose a saved lead or enter a valid lead ID first.", "error");
      setStatus("A lead is required to create a personalised draft.", "error");
      return;
    }

    setBusy(true);
    setResult("Preparing a personalised draft from this saved lead. No message is being sent automatically.", "loading");
    setStatus("Checking the AI service...");
    try {
      const status = await assertAiConfigured();
      const result = await apiFetch("/api/ai/outreach", {
        method: "POST",
        body: JSON.stringify({ leadId, type: byId("outType").value })
      });
      const content = String(result.content || "").trim();
      if (!content) throw new Error("The AI service returned an empty draft. Please try again.");
      lastText = content;
      lastLead = leadId;
      const offer = selectedOfferName();
      const offerNote = offer ? `\n\nOptional offer to discuss: ${offer}.` : "";
      setResult(`${content}${offerNote}`, "success");
      const provider = result.provider || status?.provider;
      const model = result.model || status?.model;
      setStatus(provider ? `Draft ready from ${provider}${model ? ` (${model})` : ""}. Review it before sending.` : "Draft ready. Review it before sending.", "success");
    } catch (error) {
      lastText = "";
      lastLead = "";
      setResult(`The draft could not be generated. ${error.message || "Please try again."}`, "error");
      setStatus("No outreach was sent. Fix the issue and try again.", "error");
    } finally {
      setBusy(false);
    }
  });

  byId("outCopy")?.addEventListener("click", async () => {
    if (!lastText) return;
    try {
      await copyText(byId("outResult").textContent || lastText);
      setStatus("Draft copied. You can now personalise and send it from your own channel.", "success");
    } catch (error) {
      setStatus(error.message || "Copy failed. Select the draft and copy it manually.", "error");
    }
  });

  byId("outWa")?.addEventListener("click", () => {
    if (!lastText) return;
    const popup = window.open(`https://wa.me/?text=${encodeURIComponent((byId("outResult").textContent || lastText).slice(0, 1500))}`, "_blank", "noopener,noreferrer");
    if (popup) popup.opener = null;
    setStatus(popup ? "WhatsApp opened with your editable draft. Review it before sending." : "Your browser blocked the WhatsApp window. Allow pop-ups and try again.", popup ? "success" : "error");
  });

  byId("outRecord")?.addEventListener("click", async () => {
    if (!lastLead || !lastText || busy) return;
    setBusy(true);
    setStatus("Recording outreach activity…");
    try {
      await apiFetch(`/api/crm/leads/${encodeURIComponent(lastLead)}/outreach`, {
        method: "POST",
        body: JSON.stringify({ channel: byId("outType").value === "cold_email" ? "email" : "other", type: byId("outType").value, message: (byId("outResult").textContent || lastText).slice(0, 5000), outcome: "drafted" })
      });
      setStatus("Outreach activity recorded in CRM. The lead moved to Contacted when appropriate.", "success");
    } catch (error) { setStatus(error.message || "Outreach activity could not be recorded.", "error"); }
    finally { setBusy(false); }
  });

  byId("outInvoice")?.addEventListener("click", async () => {
    if (!lastLead || busy) return;
    const amount = Number(window.prompt("Invoice amount in USD:", "149") || 0);
    if (!Number.isFinite(amount) || amount <= 0) return;
    setBusy(true);
    setStatus("Creating a real invoice link...");
    try {
      const result = await apiFetch("/api/earn/invoices", {
        method: "POST",
        body: JSON.stringify({ leadId: lastLead, offerKey: byId("outOffer").value || "paid_audit", amountUsd: amount, notes: lastText.slice(0, 500) })
      });
      const payLink = result.invoice?.payLink;
      if (!payLink) throw new Error("The invoice service did not return a payment link.");
      setResult(`${byId("outResult").textContent || lastText}\n\nInvoice payment link: ${payLink}`, "success");
      setStatus("Invoice link created. Share it only after reviewing the proposal with the client.", "success");
    } catch (error) {
      setStatus(`Invoice was not created. ${error.message || "Please try again."}`, "error");
    } finally {
      setBusy(false);
    }
  });
});
