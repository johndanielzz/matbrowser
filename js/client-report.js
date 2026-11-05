import { apiFetch, byId, requireAuth } from "./api.js";

const localSavedLeadsKey = "mat_local_saved_leads_v1";
let activeReport = null;
let activeSettings = {};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  })[character]);
}

function safeExternalUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function displayValue(value) {
  if (value === true) return "Yes";
  if (value === false) return "No";
  if (Array.isArray(value)) return value.filter(Boolean).join(", ");
  if (value && typeof value === "object") return JSON.stringify(value);
  return value ?? "";
}

function moneyValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return displayValue(value) || "Not calculated";
  return `$${Math.round(number).toLocaleString()}`;
}

function localLeadId(lead = {}) {
  return String(lead.localId || lead.id || lead.googlePlaceId || `${lead.name || "lead"}-${lead.address || ""}`)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "lead";
}

function readLocalSavedLeads() {
  try {
    const parsed = JSON.parse(localStorage.getItem(localSavedLeadsKey) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function findLocalSavedLead(id) {
  const requested = String(id || "");
  return readLocalSavedLeads().find((lead) => String(lead.id) === requested || localLeadId(lead) === requested) || null;
}

function buildLocalReport(lead = {}) {
  const noWebsite = !lead.websiteUrl;
  const setupInvestment = noWebsite ? 3200 : 2200;
  const estimatedMonthlyUpside = noWebsite ? 1200 : 850;
  const proposal = {
    title: noWebsite ? "Local Website Launch + Lead Capture System" : "Website Conversion + Local SEO Growth Sprint",
    packagePrice: setupInvestment,
    monthlyRetainer: Math.max(497, Math.round(setupInvestment * 0.18)),
    timeline: noWebsite ? "7 to 14 days" : "5 to 10 days",
    deliverables: [
      noWebsite ? "Mobile-first website build" : "Website conversion and SEO fixes",
      "Google Maps trust and contact section",
      "Booking, quote, or contact form",
      "Local SEO copy and metadata",
      "Follow-up sequence for calls and replies"
    ]
  };
  const roi = {
    setupInvestment,
    estimatedMonthlyUpside,
    breakEvenMonths: Math.max(1, Math.ceil(setupInvestment / estimatedMonthlyUpside)),
    twelveMonthUpside: estimatedMonthlyUpside * 12,
    roiStory: `${moneyValue(setupInvestment)} in setup can break even quickly if the business captures roughly ${moneyValue(estimatedMonthlyUpside)} in extra monthly revenue.`
  };
  const dossier = {
    summary: {
      name: lead.name,
      businessType: lead.businessType || lead.category,
      score: lead.opportunityScore ?? lead.audit?.score
    },
    contact: {
      phone: lead.phone,
      email: lead.email,
      website: lead.websiteUrl
    },
    location: {
      address: lead.address,
      googleMapsLink: lead.googleMapsLink,
      marketName: lead.marketName || lead.countryName
    },
    audit: lead.audit || {},
    leadReasons: [
      noWebsite && "No public website was found, making a new website build an obvious offer.",
      lead.phone && "A public phone number is available for direct outreach.",
      lead.email && "A public email is available for written outreach.",
      "The lead has enough business and location data for a targeted proposal."
    ].filter(Boolean),
    proposal,
    roi,
    competitorGap: {
      positioningAngle: "Compare website, booking, reviews, local SEO, and contact speed before outreach.",
      likelyGaps: [
        noWebsite ? "Competitors with websites can capture demand first." : "Competitors may have stronger landing pages and calls to action.",
        "Better review proof, photos, and service pages can improve trust."
      ]
    },
    outreachSequence: [
      { day: 1, channel: "Email or contact form", subject: `Quick wins for ${lead.name || "your business"}`, message: "Send the short audit and offer the report." },
      { day: 2, channel: "Phone or WhatsApp", subject: "Verify decision maker", message: "Confirm who handles website or marketing decisions." },
      { day: 7, channel: "Final follow-up", subject: "Should I close this out?", message: "Offer to close the loop unless they want the ROI estimate." }
    ],
    clientReport: {
      title: `${lead.name || "Saved lead"} Growth Opportunity Report`,
      recommendedOffer: proposal.title,
      estimatedInvestment: proposal.packagePrice,
      estimatedMonthlyUpside: roi.estimatedMonthlyUpside
    }
  };
  return { lead, dossier, aiSummary: "This report was generated from a locally saved lead." };
}

function renderList(items = [], empty = "No details available yet.") {
  const values = (Array.isArray(items) ? items : [items]).filter(Boolean);
  if (!values.length) return `<div class="empty-state">${escapeHtml(empty)}</div>`;
  return `<ul>${values.map((item) => `<li>${escapeHtml(displayValue(item))}</li>`).join("")}</ul>`;
}

function renderRows(data = {}, empty = "No details available yet.") {
  const rows = Object.entries(data || {}).filter(([, value]) => {
    if (value === undefined || value === null || value === "") return false;
    if (Array.isArray(value) && !value.length) return false;
    if (typeof value === "object" && !Array.isArray(value) && !Object.keys(value).length) return false;
    return true;
  });
  if (!rows.length) return `<div class="empty-state">${escapeHtml(empty)}</div>`;
  return rows.map(([key, value]) => `
    <div class="audit-item">
      <span>${escapeHtml(key.replace(/([A-Z])/g, " $1").replace(/_/g, " ").trim())}</span>
      <strong>${escapeHtml(displayValue(value))}</strong>
    </div>
  `).join("");
}

function reportText(report = activeReport, settings = activeSettings) {
  const lead = report?.lead || {};
  const dossier = report?.dossier || {};
  const proposal = dossier.proposal || {};
  const roi = dossier.roi || {};
  return [
    `${settings.brandName || "MAT Leads AI Pro X"} Client Growth Report`,
    "",
    `Business: ${displayValue(lead.name)}`,
    `Offer: ${displayValue(proposal.title || settings.primaryOffer)}`,
    `Investment: ${moneyValue(proposal.packagePrice || settings.proposalPrice)}`,
    `Estimated monthly upside: ${moneyValue(roi.estimatedMonthlyUpside)}`,
    `Break-even: ${displayValue(roi.breakEvenMonths)} months`,
    "",
    "Why now:",
    ...(dossier.leadReasons || []).map((item) => `- ${item}`),
    "",
    "Deliverables:",
    ...(proposal.deliverables || []).map((item) => `- ${item}`),
    "",
    `Next step: ${settings.bookingUrl || "Book a strategy call"}`
  ].join("\n");
}

function renderClientReport(report, settings = {}) {
  const target = byId("clientReport");
  const lead = report.lead || {};
  const dossier = report.dossier || {};
  const proposal = dossier.proposal || {};
  const roi = dossier.roi || {};
  const bookingUrl = safeExternalUrl(settings.bookingUrl);
  const websiteUrl = safeExternalUrl(lead.websiteUrl || dossier.contact?.website);
  const mapsUrl = safeExternalUrl(lead.googleMapsLink || dossier.location?.googleMapsLink);
  const brandName = settings.brandName || "MAT Leads AI Pro X";
  const reportTitle = dossier.clientReport?.title || `${lead.name || "Business"} Growth Opportunity Report`;
  target.innerHTML = `
    <article class="panel" style="grid-column:1 / -1;">
      <p class="tag success">${escapeHtml(brandName)}</p>
      <h2>${escapeHtml(reportTitle)}</h2>
      <p>${escapeHtml(dossier.clientReport?.summary || "Website, local SEO, proposal, ROI, and follow-up plan.")}</p>
      <div class="lead-actions" style="margin-top:16px;">
        ${bookingUrl ? `<a class="btn btn-primary" href="${escapeHtml(bookingUrl)}" target="_blank" rel="noreferrer">Book Strategy Call</a>` : ""}
        ${websiteUrl ? `<a class="btn btn-secondary" href="${escapeHtml(websiteUrl)}" target="_blank" rel="noreferrer">Website</a>` : ""}
        ${mapsUrl ? `<a class="btn btn-secondary" href="${escapeHtml(mapsUrl)}" target="_blank" rel="noreferrer">Maps</a>` : ""}
      </div>
    </article>

    <article class="panel">
      <h2>Opportunity</h2>
      <div class="audit-list">${renderRows({
        business: lead.name,
        category: lead.businessType || lead.category,
        score: dossier.audit?.score ?? lead.opportunityScore,
        opportunity: dossier.audit?.category || lead.opportunityCategory
      })}</div>
      <h2 style="margin-top:20px;">Why Now</h2>
      ${renderList(dossier.leadReasons)}
    </article>

    <article class="panel">
      <h2>ROI Snapshot</h2>
      <div class="audit-list">
        <div class="audit-item"><span>Investment</span><strong>${moneyValue(proposal.packagePrice || settings.proposalPrice)}</strong></div>
        <div class="audit-item"><span>Monthly upside</span><strong>${moneyValue(roi.estimatedMonthlyUpside)}</strong></div>
        <div class="audit-item"><span>Break-even</span><strong>${escapeHtml(displayValue(roi.breakEvenMonths))} months</strong></div>
        <div class="audit-item"><span>12-month upside</span><strong>${moneyValue(roi.twelveMonthUpside)}</strong></div>
      </div>
      <p style="margin-top:12px;">${escapeHtml(roi.roiStory || "ROI estimate should be refined after confirming average customer value.")}</p>
    </article>

    <article class="panel">
      <h2>Proposal</h2>
      <div class="audit-list">${renderRows({
        offer: proposal.title || settings.primaryOffer,
        packagePrice: moneyValue(proposal.packagePrice || settings.proposalPrice),
        monthlyRetainer: moneyValue(proposal.monthlyRetainer),
        timeline: proposal.timeline,
        closeRateTarget: proposal.closeRateTarget
      })}</div>
      <h2 style="margin-top:20px;">Deliverables</h2>
      ${renderList(proposal.deliverables)}
    </article>

    <article class="panel">
      <h2>Competitor Gap</h2>
      <div class="audit-list">${renderRows(dossier.competitorGap, "No competitor gap data generated yet.")}</div>
    </article>

    <article class="panel">
      <h2>Contact & Source</h2>
      <div class="audit-list">${renderRows({
        phone: lead.phone || dossier.contact?.phone,
        email: lead.email || dossier.contact?.email,
        website: websiteUrl,
        maps: mapsUrl,
        address: lead.address || dossier.location?.address,
        bestContact: dossier.contactFinder?.bestContact
      })}</div>
    </article>

    <article class="panel">
      <h2>Follow-Up Plan</h2>
      <div class="audit-list">${(dossier.outreachSequence || []).map((step) => `
        <div class="audit-item">
          <span>Day ${escapeHtml(step.day)} - ${escapeHtml(step.channel || "Follow-up")}</span>
          <strong>${escapeHtml(step.subject || step.message || "")}</strong>
        </div>
      `).join("") || `<div class="empty-state">No follow-up sequence generated yet.</div>`}</div>
    </article>
  `;
}

async function loadClientReport() {
  if (!requireAuth()) return;
  const target = byId("clientReport");
  const leadId = new URLSearchParams(window.location.search).get("id");
  if (!leadId) {
    target.innerHTML = `<div class="empty-state">Open a lead report first, then use Client Report.</div>`;
    return;
  }

  try {
    const [report, settingsResult] = await Promise.all([
      apiFetch(`/api/leads/${encodeURIComponent(leadId)}/report`),
      apiFetch("/api/auth/settings").catch(() => ({}))
    ]);
    activeReport = report;
    activeSettings = settingsResult.settings || {};
    renderClientReport(activeReport, activeSettings);
  } catch (error) {
    const localLead = findLocalSavedLead(leadId);
    if (localLead) {
      activeReport = buildLocalReport(localLead);
      activeSettings = {};
      renderClientReport(activeReport, activeSettings);
      return;
    }
    target.innerHTML = `<div class="error-state">${escapeHtml(error.message)}</div>`;
  }
}

document.addEventListener("click", async (event) => {
  const copy = event.target.closest("[data-copy-client-report]");
  const print = event.target.closest("[data-print-client-report]");
  if (copy) {
    if (!activeReport) return;
    const original = copy.textContent;
    await navigator.clipboard.writeText(reportText());
    copy.textContent = "Copied";
    setTimeout(() => {
      copy.textContent = original;
    }, 1400);
  }
  if (print) window.print();
});

document.addEventListener("DOMContentLoaded", loadClientReport);
