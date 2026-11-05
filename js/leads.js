import { apiFetch, byId, getCurrentUser, requireAuth, scoreClass, setCurrentUser } from "./api.js";

const countries = [
  "United States",
  "Canada",
  "United Kingdom",
  "Ireland",
  "Germany",
  "France",
  "Spain",
  "Italy",
  "Portugal",
  "Netherlands",
  "Belgium",
  "Switzerland",
  "Austria",
  "Poland",
  "Czech Republic",
  "Finland",
  "Sweden",
  "Norway",
  "Denmark",
  "Australia",
  "New Zealand",
  "Singapore",
  "Hong Kong",
  "Taiwan",
  "Japan",
  "South Korea",
  "India",
  "Mexico",
  "Brazil",
  "Argentina",
  "Chile",
  "Colombia",
  "Peru",
  "Panama",
  "Costa Rica",
  "South Africa",
  "Nigeria",
  "Ghana",
  "Kenya",
  "Egypt",
  "Morocco",
  "Turkey",
  "Israel",
  "Malaysia",
  "Philippines",
  "Thailand",
  "Vietnam",
  "Indonesia",
  "Senegal",
  "The Gambia",
  "Kuwait",
  "Qatar",
  "Bahrain",
  "Oman",
  "Jordan",
  "United Arab Emirates",
  "Saudi Arabia"
];

const businessTypes = [
  ["restaurants", "Restaurants"],
  ["coffee_shops", "Coffee Shops"],
  ["bakeries", "Bakeries"],
  ["hotels", "Hotels"],
  ["boutiques", "Boutiques"],
  ["car_dealers", "Car Dealers"],
  ["car_wash", "Car Wash"],
  ["auto_repair", "Auto Repair"],
  ["beauty_spas", "Beauty Salons & Spas"],
  ["dental", "Dentists"],
  ["medical", "Doctors & Clinics"],
  ["gyms", "Gyms & Fitness"],
  ["real_estate", "Real Estate Agencies"],
  ["law", "Law Firms"],
  ["accounting", "Accountants"],
  ["marketing_agencies", "Marketing Agencies"],
  ["contractors", "Contractors"],
  ["roofing", "Roofing Contractors"],
  ["hvac", "HVAC Contractors"],
  ["plumbers_electricians", "Plumbers & Electricians"],
  ["pharmacies", "Pharmacies"],
  ["veterinary", "Veterinarians"],
  ["schools", "Private Schools"],
  ["daycare", "Daycare Centers"],
  ["retail", "Retail Stores"],
  ["jewelers", "Jewelers"],
  ["furniture", "Furniture Stores"],
  ["electronics", "Electronics Stores"],
  ["travel_agencies", "Travel Agencies"],
  ["event_venues", "Event Venues"],
  ["finance_insurance", "Finance & Insurance"],
  ["laundromats", "Laundromats"],
  ["moving_storage", "Moving & Storage"],
  ["coworking", "Coworking Spaces"],
  ["photographers", "Photographers"]
];

const countryCallingCodesByIso = {
  US: "1",
  CA: "1",
  GB: "44",
  IE: "353",
  DE: "49",
  FR: "33",
  ES: "34",
  IT: "39",
  PT: "351",
  NL: "31",
  BE: "32",
  CH: "41",
  AT: "43",
  PL: "48",
  CZ: "420",
  FI: "358",
  SE: "46",
  NO: "47",
  DK: "45",
  AU: "61",
  NZ: "64",
  SG: "65",
  HK: "852",
  TW: "886",
  JP: "81",
  KR: "82",
  IN: "91",
  MX: "52",
  BR: "55",
  AR: "54",
  CL: "56",
  CO: "57",
  PE: "51",
  PA: "507",
  CR: "506",
  ZA: "27",
  NG: "234",
  GH: "233",
  KE: "254",
  EG: "20",
  MA: "212",
  TR: "90",
  IL: "972",
  MY: "60",
  PH: "63",
  TH: "66",
  VN: "84",
  ID: "62",
  SN: "221",
  GM: "220",
  KW: "965",
  QA: "974",
  BH: "973",
  OM: "968",
  JO: "962",
  AE: "971",
  SA: "966"
};

const countryCallingCodesByName = {
  "united states": "1",
  canada: "1",
  "united kingdom": "44",
  ireland: "353",
  germany: "49",
  france: "33",
  spain: "34",
  italy: "39",
  portugal: "351",
  netherlands: "31",
  belgium: "32",
  switzerland: "41",
  austria: "43",
  poland: "48",
  "czech republic": "420",
  finland: "358",
  sweden: "46",
  norway: "47",
  denmark: "45",
  australia: "61",
  "new zealand": "64",
  singapore: "65",
  "hong kong": "852",
  taiwan: "886",
  japan: "81",
  "south korea": "82",
  india: "91",
  mexico: "52",
  brazil: "55",
  argentina: "54",
  chile: "56",
  colombia: "57",
  peru: "51",
  panama: "507",
  "costa rica": "506",
  "south africa": "27",
  nigeria: "234",
  ghana: "233",
  kenya: "254",
  egypt: "20",
  morocco: "212",
  turkey: "90",
  israel: "972",
  malaysia: "60",
  philippines: "63",
  thailand: "66",
  vietnam: "84",
  indonesia: "62",
  senegal: "221",
  "the gambia": "220",
  gambia: "220",
  kuwait: "965",
  qatar: "974",
  bahrain: "973",
  oman: "968",
  jordan: "962",
  "united arab emirates": "971",
  "saudi arabia": "966"
};

let activeLeadReport = null;
let currentLeadResults = [];
let currentFilteredLeadResults = [];
let currentVisibleLeadResults = [];
let currentResultPage = 1;
let hasLeadSearchRun = false;
let currentSearchMetadata = null;
const localSavedLeadsKey = "mat_local_saved_leads_v1";
const defaultCountries = ["Germany"];
const defaultBusinessTypes = ["restaurants", "hotels", "boutiques", "car_dealers"];
const nichePacks = [
  {
    id: "no-website-restaurants",
    name: "Restaurants Need Websites",
    description: "Missing-site restaurants with phone or map contact data.",
    countries: ["United States"],
    city: "",
    businessTypes: ["restaurants", "bakeries", "coffee_shops"],
    industry: "restaurants, bakeries, coffee shops",
    keyword: "online ordering reservation website",
    leadQuality: "needs_website",
    sortBy: "website_missing",
    searchDepth: "deep",
    limit: 30,
    missingWebsiteOnly: true,
    requireContact: false,
    minOpportunityScore: 45
  },
  {
    id: "med-spa-booking",
    name: "Med Spa Booking Upgrade",
    description: "Beauty, spa, and clinic leads that can pay for booking funnels.",
    countries: ["United States"],
    city: "",
    businessTypes: ["beauty_spas", "medical"],
    industry: "med spa, beauty clinic, wellness clinic",
    keyword: "booking appointments skincare",
    leadQuality: "high_opportunity",
    sortBy: "opportunity",
    searchDepth: "deep",
    limit: 30,
    missingWebsiteOnly: false,
    requireContact: true,
    minOpportunityScore: 40
  },
  {
    id: "contractor-high-ticket",
    name: "High-Ticket Contractors",
    description: "Roofing, HVAC, plumbing, and electrical companies.",
    countries: ["United States"],
    city: "",
    businessTypes: ["roofing", "hvac", "plumbers_electricians", "contractors"],
    industry: "roofing HVAC plumbing electrician contractor",
    keyword: "quote request emergency service",
    leadQuality: "contact_ready",
    sortBy: "opportunity",
    searchDepth: "maximum",
    limit: 50,
    missingWebsiteOnly: false,
    requireContact: true,
    minOpportunityScore: 35
  },
  {
    id: "professional-services",
    name: "Professional Services SEO",
    description: "Law, accounting, real estate, and finance agencies.",
    countries: ["United States"],
    city: "",
    businessTypes: ["law", "accounting", "real_estate", "finance_insurance"],
    industry: "law firm accountant real estate insurance",
    keyword: "consultation local SEO lead generation",
    leadQuality: "high_opportunity",
    sortBy: "contact",
    searchDepth: "deep",
    limit: 40,
    missingWebsiteOnly: false,
    requireContact: true,
    minOpportunityScore: 30
  }
];
const defaultMapLinks = [
  "https://www.google.com/maps/@13.4053888,-16.6887424,11z?entry=ttu&g_ep=EgoyMDI2MDYwMS4wIKXMDSoASAFQAw%3D%3D",
  "https://www.google.com/maps/@13.4053888,-16.6887424,11z?entry=ttu",
  "https://www.google.com/maps/place/Germany/@51.0635856,5.1719926,6z/data=!3m1!4b1!4m6!3m5!1s0x479a721ec2b1be6b:0x75e85d6b8e91e55b!8m2!3d51.165691!4d10.451526!16zL20vMDM0NWg?entry=ttu&g_ep=EgoyMDI2MDYwMS4wIKXMDSoASAFQAw%3D%3D"
];
const pipelineStages = ["New", "Contacted", "Follow Up", "Proposal Sent", "Meeting Scheduled", "Negotiation", "Won", "Lost"];

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
    const url = new URL(value);
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

function syncTrialUsage(trial) {
  if (!trial) return;
  const user = getCurrentUser();
  if (!user) return;
  setCurrentUser({
    ...user,
    subscription: "trial",
    planName: "Free Trial",
    billingStatus: "trial",
    monthlyLeadLimit: trial.leadLimit,
    trialSearchesUsed: trial.used,
    trialSearchLimit: trial.searchLimit,
    trialLeadLimit: trial.leadLimit,
    entitlements: {
      ...(user.entitlements || {}),
      billingRequired: true,
      trial: true,
      trialSearchesUsed: trial.used,
      trialSearchLimit: trial.searchLimit,
      trialLeadLimit: trial.leadLimit,
      upgradeRequiredAfterTrial: true
    }
  });
}

function trialSearchText(trial) {
  if (!trial) return "";
  return ` Free trial: ${trial.remaining} of ${trial.searchLimit} searches left, ${trial.leadLimit} leads per search.`;
}

function socialLinksFromLead(lead = {}) {
  return {
    ...(lead.details?.social || {}),
    ...(lead.details?.publicWebsiteProfile?.socialLinks || {}),
    ...(lead.audit?.publicProfile?.socialLinks || {})
  };
}

function firstSocialUrl(lead = {}) {
  const links = socialLinksFromLead(lead);
  const preferred = ["facebook", "instagram", "linkedin", "tiktok", "youtube", "x", "threads", "snapchat", "whatsapp"];
  for (const key of preferred) {
    const url = safeExternalUrl(links[key]);
    if (url) return url;
  }
  return safeExternalUrl(lead.social) || safeExternalUrl(Object.values(links)[0]);
}

function renderSocialButtons(lead = {}) {
  const links = socialLinksFromLead(lead);
  const order = [["facebook", "FB"], ["instagram", "IG"], ["linkedin", "IN"], ["tiktok", "TT"], ["youtube", "YT"], ["x", "X"], ["whatsapp", "WA"]];
  const buttons = order.filter(([key]) => safeExternalUrl(links[key])).map(([key, label]) => `<a class="btn btn-ghost" href="${escapeHtml(safeExternalUrl(links[key]))}" target="_blank" rel="noreferrer" title="${escapeHtml(key)}">${escapeHtml(label)}</a>`);
  const first = firstSocialUrl(lead);
  if (!buttons.length && first) return `<a class="btn btn-ghost" href="${escapeHtml(first)}" target="_blank" rel="noreferrer">Social</a>`;
  return buttons.join("");
}

function normalizedName(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function isWhatsappUrl(value) {
  const url = safeExternalUrl(value);
  if (!url) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "wa.me" || host === "whatsapp.com" || host.endsWith(".whatsapp.com");
  } catch {
    return false;
  }
}

function countryCallingCodeForLead(lead = {}) {
  const iso = String(lead.countryCode || lead.details?.location?.countryCode || "").toUpperCase();
  if (countryCallingCodesByIso[iso]) return countryCallingCodesByIso[iso];
  const countryNames = [
    lead.country,
    lead.countryName,
    lead.details?.location?.country,
    lead.details?.location?.countryName
  ].map(normalizedName);
  return countryNames.map((name) => countryCallingCodesByName[name]).find(Boolean) || "";
}

function firstPhoneFromLead(lead = {}) {
  return [
    lead.details?.contact?.mobile,
    lead.details?.contact?.phone,
    lead.phone,
    lead.details?.publicWebsiteProfile?.phones?.[0],
    lead.audit?.publicProfile?.phones?.[0]
  ].find(Boolean) || "";
}

function normalizePhoneForWhatsapp(phone, lead = {}) {
  const raw = String(phone || "").trim();
  if (!raw) return "";
  const firstNumber = raw.split(/[\/|;]/)[0].replace(/\s*(?:ext\.?|extension|x)\s*\d+$/i, "").trim();
  let digits = firstNumber.replace(/\D/g, "");
  if (!digits) return "";

  if (firstNumber.startsWith("+")) {
    // Already includes an international prefix.
  } else if (digits.startsWith("00")) {
    digits = digits.slice(2);
  } else {
    const callingCode = countryCallingCodeForLead(lead);
    if (!callingCode) return "";
    const nationalNumber = digits.replace(/^0+/, "");
    digits = digits.startsWith(callingCode) && digits.length > callingCode.length + 5
      ? digits
      : `${callingCode}${nationalNumber}`;
  }

  return digits.length >= 8 && digits.length <= 15 ? digits : "";
}

function whatsappLinkFromPhone(phone, lead = {}) {
  const normalized = normalizePhoneForWhatsapp(phone, lead);
  return normalized ? `https://wa.me/${normalized}` : "";
}

function whatsappActionFromLead(lead = {}) {
  const socialLinks = socialLinksFromLead(lead);
  const explicitWhatsapp = safeExternalUrl(socialLinks.whatsapp || lead.details?.contact?.whatsappLink || lead.details?.contact?.whatsapp || "");
  if (explicitWhatsapp && isWhatsappUrl(explicitWhatsapp)) {
    return {
      url: explicitWhatsapp,
      label: "WhatsApp",
      status: "WhatsApp link",
      note: "Public WhatsApp link found — opens chat directly"
    };
  }

  const leadSocial = safeExternalUrl(lead.social || "");
  if (leadSocial && isWhatsappUrl(leadSocial)) {
    return {
      url: leadSocial,
      label: "WhatsApp",
      status: "WhatsApp link",
      note: "Public WhatsApp link found — opens chat directly"
    };
  }

  const phone = firstPhoneFromLead(lead);
  const phoneLink = whatsappLinkFromPhone(phone, lead);
  if (!phoneLink) return null;

  const needsCheck = lead.details?.contact?.whatsappNeedsCheck !== false;
  return {
    url: phoneLink,
    label: "WhatsApp",
    status: needsCheck ? "Tap to check WhatsApp" : "WhatsApp",
    note: "Opens WhatsApp with the real business number — WhatsApp shows if it is registered"
  };
}

function renderWhatsappButton(lead = {}, className = "btn btn-secondary") {
  const action = whatsappActionFromLead(lead);
  if (!action) return "";
  const hint = action.status === "WhatsApp link" ? "Opens WhatsApp chat directly" : "Opens WhatsApp to verify this number";
  return `<a class="${escapeHtml(className)}" href="${escapeHtml(action.url)}" target="_blank" rel="noreferrer" title="${escapeHtml(hint)}">${escapeHtml(action.label)}</a>`;
}

function renderWhatsappContact(lead = {}) {
  const action = whatsappActionFromLead(lead);
  const note = action
    ? `${action.note}. WhatsApp will confirm if the number is registered.`
    : "No valid WhatsApp-ready phone or public WhatsApp link found.";
  return `
    <div class="audit-item">
      <span>WhatsApp</span>
      <strong>${action ? `<a href="${escapeHtml(action.url)}" target="_blank" rel="noreferrer">${escapeHtml(action.label)}</a>` : `<span class="muted-value">${escapeHtml(note)}</span>`}</strong>
    </div>
    ${action ? `<div class="audit-item"><span>WhatsApp note</span><strong>${escapeHtml(note)}</strong></div>` : ""}
  `;
}

function primaryPhone(lead = {}) {
  return firstPhoneFromLead(lead) || lead.phone || "";
}

function telLinkFromLead(lead = {}) {
  const phone = primaryPhone(lead);
  const normalized = String(phone || "").replace(/[^\d+]/g, "");
  return normalized.length >= 7 ? `tel:${normalized}` : "";
}

function mailtoLinkFromLead(lead = {}, body = "") {
  const email = lead.email || lead.details?.contact?.email || lead.audit?.publicProfile?.emails?.[0] || "";
  if (!email) return "";
  const subject = `${lead.name || "Business"} website and lead growth`;
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function leadText(lead = {}) {
  return [
    lead.name,
    lead.businessType,
    lead.category,
    lead.address,
    lead.phone,
    lead.email,
    lead.websiteUrl,
    lead.marketName,
    lead.countryName,
    lead.country,
    lead.localStage,
    lead.localCampaign,
    lead.localNotes
  ].filter(Boolean).join(" ").toLowerCase();
}

function hasSocialLinks(lead = {}) {
  return Boolean(firstSocialUrl(lead) || Object.keys(socialLinksFromLead(lead)).length);
}

function leadStrengthScore(lead = {}) {
  const baseScore = Number(lead.opportunityScore ?? lead.audit?.score ?? 0);
  let score = Math.round(baseScore * 0.55);
  if (primaryPhone(lead)) score += 14;
  if (whatsappActionFromLead(lead)) score += 12;
  if (lead.email || lead.details?.contact?.email) score += 10;
  if (lead.websiteUrl) score += 6;
  if (!lead.websiteUrl) score += 10;
  if (hasSocialLinks(lead)) score += 10;
  if (lead.openingHours || lead.details?.operations?.openingHours) score += 4;
  if (lead.address || lead.details?.location?.address) score += 4;
  return Math.max(0, Math.min(100, score));
}

function leadStrengthTags(lead = {}) {
  return [
    primaryPhone(lead) && "Phone",
    whatsappActionFromLead(lead) && "WhatsApp",
    (lead.email || lead.details?.contact?.email) && "Email",
    hasSocialLinks(lead) && "Social",
    !lead.websiteUrl && "Needs website",
    lead.websiteUrl && "Website"
  ].filter(Boolean);
}

function renderLeadStrength(lead = {}) {
  const strength = leadStrengthScore(lead);
  const tags = leadStrengthTags(lead).slice(0, 5);
  return `
    <div class="lead-strength" aria-label="Lead quality score">
      <div>
        <strong>${strength}/100</strong>
        <span>Lead quality</span>
      </div>
      <div class="strength-track"><span style="width:${strength}%;"></span></div>
      <div class="lead-meta">${tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>
    </div>
  `;
}

function outreachMessage(lead = {}, channel = "email") {
  const businessName = lead.name || "your business";
  const businessType = lead.businessType || lead.category || "local business";
  const websiteGap = lead.websiteUrl
    ? "I noticed there may be room to improve the website conversion, local SEO, and contact flow."
    : "I noticed your business appears online without a strong website connected to the lead flow.";
  const contactLine = whatsappActionFromLead(lead)
    ? "I can also help connect your website, Google Maps visitors, and WhatsApp inquiries into one simple flow."
    : "I can help turn more Google Maps visitors into calls, messages, and booked inquiries.";

  if (channel === "whatsapp") {
    return `Hi ${businessName}, I found your ${businessType} listing and wanted to share a quick idea. ${websiteGap} ${contactLine} Would you like me to send a short example?`;
  }

  return [
    `Hi ${businessName},`,
    "",
    `I found your ${businessType} listing and noticed an opportunity to improve how customers contact you from Google Maps and your online presence.`,
    "",
    websiteGap,
    contactLine,
    "",
    "I can prepare a short website/lead audit showing what can be improved and where more calls, WhatsApp messages, and bookings can come from.",
    "",
    "Would you like me to send the quick audit?"
  ].join("\n");
}

function renderContactActions(lead = {}) {
  const whatsapp = renderWhatsappButton(lead, "btn btn-secondary");
  const phoneLink = telLinkFromLead(lead);
  const emailMessage = outreachMessage(lead, "email");
  const mailto = mailtoLinkFromLead(lead, emailMessage);
  const id = escapeHtml(localLeadId(lead));
  return `
    <div class="contact-action-grid">
      ${phoneLink ? `<a class="btn btn-secondary" href="${escapeHtml(phoneLink)}">Call</a>` : ""}
      ${whatsapp}
      ${mailto ? `<a class="btn btn-secondary" href="${escapeHtml(mailto)}">Email</a>` : ""}
      <button class="btn btn-secondary" type="button" data-copy-outreach="${id}" data-outreach-channel="whatsapp">Copy WhatsApp Pitch</button>
      <button class="btn btn-secondary" type="button" data-copy-outreach="${id}" data-outreach-channel="email">Copy Email Pitch</button>
    </div>
  `;
}

function leadDedupeKey(lead = {}) {
  const name = normalizedName(lead.name);
  const address = normalizedName(lead.address || lead.details?.location?.address);
  const phone = String(primaryPhone(lead)).replace(/\D/g, "");
  const website = safeExternalUrl(lead.websiteUrl).replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");
  return [name, phone || website || address].filter(Boolean).join("|") || localLeadId(lead);
}

function searchResultDedupeKey(lead = {}) {
  // Search providers already supply a stable record ID (for example an OSM
  // node/way ID or a Google Place ID). Preserve that identity in the visible
  // result list: different branches can legitimately share one switchboard
  // phone number, website, or street address and must not collapse into one
  // card before the user has seen them.
  const providerId = String(lead.id || lead.raw?.placeId || lead.raw?.id || "").trim();
  if (providerId) return `provider:${providerId.toLowerCase()}`;

  const latitude = Number(lead.latitude ?? lead.details?.location?.latitude);
  const longitude = Number(lead.longitude ?? lead.details?.location?.longitude);
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    return `location:${normalizedName(lead.name)}|${latitude.toFixed(5)}|${longitude.toFixed(5)}`;
  }
  return leadDedupeKey(lead);
}

function dedupeLeads(leads = []) {
  const byKey = new Map();
  for (const lead of leads) {
    const key = leadDedupeKey(lead);
    const existing = byKey.get(key);
    if (!existing || leadStrengthScore(lead) >= leadStrengthScore(existing)) {
      byKey.set(key, { ...(existing || {}), ...lead });
    }
  }
  return [...byKey.values()];
}

function dedupeSearchResults(leads = []) {
  const byKey = new Map();
  for (const lead of leads) {
    const key = searchResultDedupeKey(lead);
    const existing = byKey.get(key);
    if (!existing || leadStrengthScore(lead) >= leadStrengthScore(existing)) {
      byKey.set(key, { ...(existing || {}), ...lead });
    }
  }
  return [...byKey.values()];
}

// Short human-readable ID stamped on every saved lead so the AI tools, studio
// and lead picker can reference it (format: ML-XXXXXX, no look-alike chars).
function makeLeadId() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(6);
  try { (window.crypto || {}).getRandomValues?.(bytes); } catch {}
  let out = "ML-";
  for (let i = 0; i < 6; i += 1) {
    const byte = bytes[i] ?? Math.floor(Math.random() * 256);
    out += alphabet[byte % alphabet.length];
  }
  return out;
}

function backfillLocalLeadIds() {
  try {
    const leads = readLocalSavedLeads();
    let changed = false;
    for (const lead of leads) {
      if (lead && !lead.leadId) {
        lead.leadId = makeLeadId();
        changed = true;
      }
    }
    if (changed) writeLocalSavedLeads(leads);
  } catch {}
}

function localLeadId(lead = {}) {
  return String(lead.id || `${lead.name || "lead"}-${lead.address || ""}-${lead.googleMapsLink || ""}`)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 180) || `lead-${Date.now()}`;
}

function readLocalSavedLeads() {
  try {
    const parsed = JSON.parse(localStorage.getItem(localSavedLeadsKey) || "[]");
    return Array.isArray(parsed) ? parsed.filter((lead) => lead?.id || lead?.name) : [];
  } catch {
    return [];
  }
}

function writeLocalSavedLeads(leads = []) {
  let items = leads.slice(0, 500);
  while (items.length >= 0) {
    try {
      localStorage.setItem(localSavedLeadsKey, JSON.stringify(items));
      return items;
    } catch {
      if (items.length <= 50) throw new Error("Browser local storage is full. Export saved leads, delete old leads, then try again.");
      items = items.slice(0, Math.ceil(items.length * 0.75));
    }
  }
  return [];
}

function compactLeadForLocalStorage(lead = {}) {
  const copy = JSON.parse(JSON.stringify(lead || {}));
  const id = localLeadId(copy);
  delete copy.raw;
  if (copy.details?.source) {
    delete copy.details.source.rawTags;
    delete copy.details.source.rawPlace;
    delete copy.details.source.raw;
  }
  return {
    ...copy,
    id,
    leadId: copy.leadId || makeLeadId(),
    localSavedAt: new Date().toISOString()
  };
}

function saveLeadsToLocalStorage(leads = []) {
  const existing = readLocalSavedLeads();
  const byId = new Map(existing.map((lead) => [localLeadId(lead), lead]));
  for (const lead of leads) {
    if (!lead) continue;
    const compact = compactLeadForLocalStorage(lead);
    byId.set(compact.id, {
      ...(byId.get(compact.id) || {}),
      ...compact
    });
  }
  const saved = [...byId.values()].sort((left, right) => String(right.localSavedAt || "").localeCompare(String(left.localSavedAt || "")));
  return writeLocalSavedLeads(saved);
}

function deleteLocalSavedLead(id) {
  const remaining = readLocalSavedLeads().filter((lead) => localLeadId(lead) !== id);
  return writeLocalSavedLeads(remaining);
}

function findLocalSavedLead(id) {
  const requested = String(id || "");
  const requestedNormalized = localLeadId({ id: requested });
  return readLocalSavedLeads().find((lead) => (
    String(lead.id || "") === requested ||
    localLeadId(lead) === requested ||
    localLeadId(lead) === requestedNormalized
  )) || null;
}

function updateLocalSavedLead(id, patch = {}) {
  const targetId = String(id || "");
  const leads = readLocalSavedLeads();
  const updated = leads.map((lead) => {
    const isMatch = localLeadId(lead) === targetId || String(lead.id || "") === targetId;
    return isMatch
      ? { ...lead, ...patch, localUpdatedAt: new Date().toISOString() }
      : lead;
  });
  return writeLocalSavedLeads(updated);
}

function localReminderStatus(lead = {}) {
  if (!lead.localReminderAt) return "none";
  const reminder = new Date(lead.localReminderAt);
  if (Number.isNaN(reminder.getTime())) return "none";
  const now = new Date();
  return reminder <= now ? "due" : "upcoming";
}

function filteredLocalSavedLeads() {
  const query = String(byId("localLeadSearch")?.value || "").trim().toLowerCase();
  const stage = byId("localLeadStageFilter")?.value || "all";
  const due = byId("localLeadDueFilter")?.value || "all";
  return readLocalSavedLeads().filter((lead) => {
    if (query && !leadText(lead).includes(query)) return false;
    if (stage !== "all" && (lead.localStage || lead.stage || "New") !== stage) return false;
    if (due !== "all" && localReminderStatus(lead) !== due) return false;
    return true;
  });
}

function renderStageOptions(selected = "New") {
  return pipelineStages.map((stage) => `<option value="${escapeHtml(stage)}"${stage === selected ? " selected" : ""}>${escapeHtml(stage)}</option>`).join("");
}

function reminderText(lead = {}) {
  if (!lead.localReminderAt) return "No reminder set";
  const date = new Date(lead.localReminderAt);
  if (Number.isNaN(date.getTime())) return "No reminder set";
  const status = localReminderStatus(lead);
  return `${status === "due" ? "Due" : "Upcoming"}: ${date.toLocaleString()}`;
}

function renderLocalLeadTools(lead = {}) {
  const id = escapeHtml(localLeadId(lead));
  const selectedStage = lead.localStage || lead.stage || "New";
  const reminderDate = lead.localReminderAt ? String(lead.localReminderAt).slice(0, 10) : "";
  return `
    <div class="local-lead-tools">
      <div class="field">
        <label for="stage-${id}">Stage</label>
        <select id="stage-${id}" data-local-stage="${id}">
          ${renderStageOptions(selectedStage)}
        </select>
      </div>
      <div class="field">
        <label for="campaign-${id}">Campaign</label>
        <input id="campaign-${id}" value="${escapeHtml(lead.localCampaign || "")}" placeholder="Germany boutiques" data-local-campaign="${id}">
      </div>
      <div class="field">
        <label for="reminder-${id}">Follow-Up Date</label>
        <input id="reminder-${id}" type="date" value="${escapeHtml(reminderDate)}" data-local-reminder="${id}">
      </div>
      <div class="field" style="grid-column:1 / -1;">
        <label for="notes-${id}">Notes</label>
        <textarea id="notes-${id}" data-local-notes="${id}" placeholder="Call result, owner name, offer, next step">${escapeHtml(lead.localNotes || "")}</textarea>
      </div>
      <div class="notice" style="grid-column:1 / -1;">${escapeHtml(reminderText(lead))}</div>
    </div>
  `;
}

function localWebsiteBrief(lead) {
  const whatsapp = whatsappActionFromLead(lead);
  return [
    "LOCAL SAVED LEAD BRIEF",
    "",
    `Business name: ${displayValue(lead.name)}`,
    `Business type: ${displayValue(lead.businessType || lead.category)}`,
    `Phone: ${displayValue(lead.phone)}`,
    `WhatsApp contact: ${displayValue(whatsapp?.url)}`,
    `WhatsApp note: ${whatsapp ? `${whatsapp.note}. WhatsApp confirms if the number is registered.` : "Not found in public data"}`,
    `Email: ${displayValue(lead.email)}`,
    `Website: ${displayValue(lead.websiteUrl)}`,
    `Google Maps: ${displayValue(lead.googleMapsLink)}`,
    `Social links: ${displayValue(lead.details?.social || lead.social)}`,
    `Address: ${displayValue(lead.address)}`,
    `Market: ${displayValue(lead.marketName || lead.countryName)}`,
    `Opportunity score: ${displayValue(lead.opportunityScore ?? lead.audit?.score)}`,
    "",
    "NOTE",
    "This lead is saved in browser local storage and remains after logout until deleted."
  ].join("\n");
}

function searchUrl(query) {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

function localVerificationLinks(lead = {}) {
  const baseQuery = [lead.name, lead.address].filter(Boolean).join(" ") || "business";
  const whatsapp = whatsappActionFromLead(lead);
  return {
    facebookSearch: searchUrl(`${baseQuery} Facebook`),
    instagramSearch: searchUrl(`${baseQuery} Instagram`),
    linkedinSearch: searchUrl(`${baseQuery} LinkedIn owner manager`),
    tiktokSearch: searchUrl(`${baseQuery} TikTok`),
    youtubeSearch: searchUrl(`${baseQuery} YouTube`),
    xSearch: searchUrl(`${baseQuery} X Twitter`),
    whatsappContact: whatsapp?.url || ""
  };
}

function localRevenueAssets(lead = {}, dossier = {}) {
  const noWebsite = !lead.websiteUrl;
  const score = Number(lead.opportunityScore ?? lead.audit?.score ?? 50);
  const setupInvestment = noWebsite ? 3200 : 1800 + (score >= 70 ? 700 : 350);
  const estimatedMonthlyUpside = noWebsite ? 1200 : 850;
  const proposal = {
    title: noWebsite ? "Local Website Launch + Lead Capture System" : "Website Conversion + Local SEO Growth Sprint",
    targetBusiness: lead.name || "Saved lead",
    packagePrice: setupInvestment,
    monthlyRetainer: Math.max(497, Math.round(setupInvestment * 0.18)),
    timeline: noWebsite ? "7 to 14 days" : "5 to 10 days",
    deliverables: [
      noWebsite ? "Mobile-first website build" : "Website conversion and SEO fixes",
      "Google Maps trust and contact section",
      "Booking, quote, or contact form",
      "Local SEO copy and metadata",
      "Follow-up sequence for calls and replies"
    ],
    firstPitch: `I found a few quick wins for ${lead.name || "your business"} that can help turn more local searches into calls, bookings, and quote requests.`
  };
  const roi = {
    setupInvestment,
    estimatedMonthlyUpside,
    breakEvenMonths: Math.max(1, Math.ceil(setupInvestment / estimatedMonthlyUpside)),
    twelveMonthUpside: estimatedMonthlyUpside * 12,
    roiStory: `${moneyValue(setupInvestment)} in setup can break even quickly if the business captures roughly ${moneyValue(estimatedMonthlyUpside)} in extra monthly revenue.`
  };
  const callScript = {
    opener: `Hi, is this the best person to speak with about marketing or the website for ${lead.name || "your business"}?`,
    reason: noWebsite ? "I could not find a proper website connected to your map listing." : "I noticed a few website conversion opportunities.",
    valueHook: "The quick win is making it easier for people who already find you on Google Maps to call, book, or request a quote.",
    qualifyingQuestions: [
      "Where do most new customers come from right now?",
      "Do you track calls, bookings, forms, or missed inquiries?",
      "Who approves website or marketing improvements?"
    ],
    close: "Would it be useful if I sent a one-page audit with the exact fixes and a price range?"
  };
  const outreachSequence = [
    { day: 1, channel: "Email or contact form", subject: `Quick wins for ${lead.name || "your business"}`, message: proposal.firstPitch },
    { day: 2, channel: "Phone or WhatsApp", subject: "Verify decision maker", message: "Confirm who handles website or marketing decisions." },
    { day: 4, channel: "Email follow-up", subject: "3 quick wins", message: "Send conversion path, Google Maps trust, and booking/contact automation bullets." },
    { day: 7, channel: "Final follow-up", subject: "Should I close this out?", message: "Offer to close the loop unless they want the audit and ROI estimate." }
  ];
  return {
    leadReasons: [
      noWebsite && "No public website was found, making a new website build an obvious offer.",
      lead.phone && "A public phone number is available for direct outreach.",
      lead.email && "A public email is available for written outreach.",
      "The saved lead has enough business and location data for a targeted proposal."
    ].filter(Boolean),
    roi,
    proposal,
    callScript,
    outreachSequence,
    objectionHandlers: [
      { objection: "We do not have budget.", response: "Frame the work around break-even and extra monthly leads, not design expense." },
      { objection: "Send information.", response: "Ask which result matters most first: calls, bookings, Google visibility, or professional trust." }
    ],
    competitorGap: {
      competitorSearchUrl: searchUrl(`${lead.businessType || lead.category || "business"} near ${lead.marketName || lead.countryName || lead.address || ""} best website booking reviews`),
      positioningAngle: "Compare website, booking, reviews, local SEO, and contact speed before outreach.",
      likelyGaps: [
        noWebsite ? "Competitors with websites can capture demand first." : "Competitors may have stronger landing pages and calls to action.",
        "Better review proof, photos, and service pages can improve trust."
      ]
    },
    salesAgent: {
      status: lead.phone || lead.email ? "Ready for outreach" : "Needs contact verification",
      nextBestAction: lead.phone || lead.email ? "Send the audit summary, then call within 24 hours." : "Verify contact channels before outreach.",
      pipelineStage: lead.localStage || "New"
    },
    contactFinder: {
      status: lead.phone || lead.email ? "Public contact data found" : "Needs manual verification",
      bestContact: lead.phone || lead.email || dossier.contact?.whatsappLink || "Not found in public data",
      verifiedChannels: [lead.phone && "phone", lead.email && "email", dossier.contact?.whatsappLink && "whatsapp"].filter(Boolean)
    },
    clientReport: {
      title: `${lead.name || "Saved lead"} Growth Opportunity Report`,
      reportUrl: `/client-report.html?id=${encodeURIComponent(localLeadId(lead))}`,
      recommendedOffer: proposal.title,
      estimatedInvestment: proposal.packagePrice,
      estimatedMonthlyUpside: roi.estimatedMonthlyUpside
    }
  };
}

function localReportFromLead(lead) {
  const details = lead.details || {};
  const whatsapp = whatsappActionFromLead(lead);
  const contact = {
    phone: lead.phone,
    email: lead.email,
    website: lead.websiteUrl,
    social: lead.social,
    ...(details.contact || {}),
    whatsappLink: whatsapp?.url,
    whatsappSource: whatsapp?.status,
    whatsappVerificationNote: whatsapp ? `${whatsapp.note}. WhatsApp confirms if the number is registered.` : ""
  };
  const location = {
    address: lead.address,
    latitude: lead.latitude,
    longitude: lead.longitude,
    googleMapsLink: lead.googleMapsLink,
    marketName: lead.marketName,
    countryName: lead.countryName,
    ...(details.location || {})
  };
  const business = {
    name: lead.name,
    category: lead.category,
    businessType: lead.businessType,
    opportunityScore: lead.opportunityScore,
    ...(details.business || {})
  };
  const dossier = {
    summary: {
      name: lead.name,
      businessType: lead.businessType || lead.category,
      source: lead.source,
      score: lead.opportunityScore ?? lead.audit?.score
    },
    ownerContact: details.ownerContact || {},
    contact,
    social: details.social || {},
    location,
    business,
    operations: details.operations || {},
    websiteDiscovery: details.publicWebsiteProfile || {},
    verificationLinks: localVerificationLinks(lead),
    audit: lead.audit || {},
    source: details.source || { provider: lead.source || "local_storage" },
    copyReady: {
      websiteBuildBrief: localWebsiteBrief(lead)
    }
  };
  const revenueAssets = localRevenueAssets(lead, dossier);
  Object.assign(dossier, revenueAssets, {
    copyReady: {
      ...dossier.copyReady,
      proposalBrief: [
        "PROPOSAL PACK",
        "",
        `Business: ${displayValue(lead.name)}`,
        `Offer: ${displayValue(revenueAssets.proposal.title)}`,
        `Package price: ${moneyValue(revenueAssets.proposal.packagePrice)}`,
        `Monthly retainer: ${moneyValue(revenueAssets.proposal.monthlyRetainer)}`,
        `Timeline: ${displayValue(revenueAssets.proposal.timeline)}`,
        `ROI story: ${displayValue(revenueAssets.roi.roiStory)}`
      ].join("\n"),
      callScript: [
        revenueAssets.callScript.opener,
        revenueAssets.callScript.reason,
        revenueAssets.callScript.valueHook,
        "",
        "Questions:",
        ...revenueAssets.callScript.qualifyingQuestions.map((item) => `- ${item}`),
        "",
        `Close: ${revenueAssets.callScript.close}`
      ].join("\n"),
      outreachSequence: revenueAssets.outreachSequence.map((step) => `DAY ${step.day} - ${step.channel}\nSubject: ${step.subject}\n${step.message}`).join("\n\n")
    }
  });
  return { lead, dossier, aiSummary: "This lead was loaded from local browser storage." };
}

function renderExternalLink(value) {
  const url = safeExternalUrl(value);
  if (!url) return escapeHtml(displayValue(value));
  return `<a href="${url}" target="_blank" rel="noreferrer">${escapeHtml(url)}</a>`;
}

function renderCellValue(key, value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const rows = Object.entries(value).filter(([, item]) => item !== undefined && item !== null && item !== "");
    if (!rows.length) return "";
    return rows.map(([nestedKey, nestedValue]) => {
      const label = nestedKey.replace(/([A-Z])/g, " $1").replace(/_/g, " ").trim();
      const rendered = safeExternalUrl(nestedValue)
        ? renderExternalLink(nestedValue)
        : escapeHtml(displayValue(nestedValue));
      return `<span class="inline-link-row"><em>${escapeHtml(label)}:</em> ${rendered}</span>`;
    }).join("");
  }
  const shouldLink = /url|website|link|maps|osm|facebook|instagram|linkedin|twitter|youtube|tiktok|pinterest|threads|snapchat|whatsapp|social/i.test(key)
    || Boolean(safeExternalUrl(value));
  return shouldLink ? renderExternalLink(value) : escapeHtml(displayValue(value));
}

function renderSocialLinks(social = {}, empty = "No social links found yet.") {
  const entries = Object.entries(social || {}).filter(([, value]) => safeExternalUrl(value));
  if (!entries.length) return `<div class="empty-state">${escapeHtml(empty)}</div>`;
  return entries.map(([platform, url]) => `
    <div class="audit-item">
      <span>${escapeHtml(platform.replace(/([A-Z])/g, " $1").replace(/_/g, " ").trim())}</span>
      <strong>${renderExternalLink(url)}</strong>
    </div>
  `).join("");
}

function renderRows(data = {}, options = {}) {
  const entries = Object.entries(data).filter(([, value]) => {
    if (value === undefined || value === null || value === "") return false;
    if (Array.isArray(value) && value.length === 0) return false;
    if (typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0) return false;
    return true;
  });
  if (!entries.length) return `<div class="empty-state">${escapeHtml(options.empty || "No details available yet.")}</div>`;

  return entries.map(([key, value]) => {
    const label = key.replace(/([A-Z])/g, " $1").replace(/_/g, " ").trim();
    return `
      <div class="audit-item">
        <span>${escapeHtml(label)}</span>
        <strong>${renderCellValue(key, value)}</strong>
      </div>
    `;
  }).join("");
}

function renderExpectedRows(data = {}, fields = []) {
  return fields.map(([key, label, type]) => {
    const value = data?.[key];
    const found = !(value === undefined || value === null || value === "" || (Array.isArray(value) && !value.length));
    const rendered = found
      ? (/url|website|link|maps|osm/i.test(type || key) ? renderExternalLink(value) : escapeHtml(displayValue(value)))
      : `<span class="muted-value">Not found in public data</span>`;
    return `
      <div class="audit-item">
        <span>${escapeHtml(label)}</span>
        <strong>${rendered}</strong>
      </div>
    `;
  }).join("");
}

function flattenObject(value, prefix = "", output = {}) {
  if (!value || typeof value !== "object") return output;
  for (const [key, item] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (item && typeof item === "object" && !Array.isArray(item)) {
      flattenObject(item, path, output);
    } else {
      output[path] = displayValue(item);
    }
  }
  return output;
}

function downloadFile(filename, mimeType, content) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function dossierCsv(report) {
  const flat = flattenObject(report?.dossier || {});
  const rows = [["Field", "Value"], ...Object.entries(flat)];
  return rows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, "\"\"")}"`).join(",")).join("\n");
}

function leadsCsv(leads = []) {
  const rows = [
    ["Name", "Business Type", "Address", "Phone", "WhatsApp", "Email", "Website", "Maps", "Score", "Market", "Source", "Social Links"],
    ...leads.map((lead) => {
      const whatsapp = whatsappActionFromLead(lead);
      return [
        lead.name,
        lead.businessType || lead.category,
        lead.address,
        lead.phone,
        whatsapp?.url || "",
        lead.email,
        lead.websiteUrl,
        lead.googleMapsLink,
        lead.opportunityScore ?? lead.audit?.score ?? "",
        lead.marketName || lead.countryName || lead.country,
        lead.source,
        displayValue(lead.details?.social || lead.social || "")
      ];
    })
  ];
  return rows.map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, "\"\"")}"`).join(",")).join("\n");
}

function websiteBrief(report) {
  return report?.dossier?.copyReady?.websiteBuildBrief || JSON.stringify(report?.dossier || report?.lead || {}, null, 2);
}

function moneyValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return displayValue(value) || "Not calculated";
  return `$${Math.round(number).toLocaleString()}`;
}

function renderBulletList(items = [], empty = "No items available yet.") {
  const values = (Array.isArray(items) ? items : [items]).filter(Boolean);
  if (!values.length) return `<div class="empty-state">${escapeHtml(empty)}</div>`;
  return `<ul>${values.map((item) => `<li>${escapeHtml(displayValue(item))}</li>`).join("")}</ul>`;
}

function renderAssetSummaryCards(dossier = {}) {
  const cards = [
    ["Lead status", dossier.contactFinder?.status || "Needs review"],
    ["Next action", dossier.salesAgent?.nextBestAction || "Verify the lead and send the audit."],
    ["Proposal", dossier.proposal?.title || "Proposal pack pending"],
    ["ROI story", dossier.roi?.roiStory || "ROI estimate pending"]
  ];
  return `<div class="asset-grid">${cards.map(([label, value]) => `
    <div class="asset-card">
      <strong>${escapeHtml(label)}</strong>
      <span>${escapeHtml(value)}</span>
    </div>
  `).join("")}</div>`;
}

function renderOutreachSequence(sequence = []) {
  if (!Array.isArray(sequence) || !sequence.length) return `<div class="empty-state">No outreach sequence generated yet.</div>`;
  return sequence.map((step) => `
    <div class="audit-item">
      <span>Day ${escapeHtml(step.day)} - ${escapeHtml(step.channel || "Follow-up")}</span>
      <strong>${escapeHtml(step.subject || step.message || "")}</strong>
    </div>
  `).join("");
}

function renderObjectionHandlers(handlers = []) {
  if (!Array.isArray(handlers) || !handlers.length) return `<div class="empty-state">No objection handlers generated yet.</div>`;
  return handlers.map((item) => `
    <div class="audit-item">
      <span>${escapeHtml(item.objection || "Objection")}</span>
      <strong>${escapeHtml(item.response || "")}</strong>
    </div>
  `).join("");
}

function reportAssetText(report, asset) {
  const dossier = report?.dossier || {};
  if (asset === "proposal") {
    return dossier.copyReady?.proposalBrief || JSON.stringify(dossier.proposal || {}, null, 2);
  }
  if (asset === "call-script") {
    return dossier.copyReady?.callScript || JSON.stringify(dossier.callScript || {}, null, 2);
  }
  if (asset === "outreach-sequence") {
    return dossier.copyReady?.outreachSequence || JSON.stringify(dossier.outreachSequence || {}, null, 2);
  }
  if (asset === "roi") {
    return [
      "ROI CALCULATOR",
      "",
      `Setup investment: ${moneyValue(dossier.roi?.setupInvestment)}`,
      `Estimated monthly upside: ${moneyValue(dossier.roi?.estimatedMonthlyUpside)}`,
      `Break-even months: ${displayValue(dossier.roi?.breakEvenMonths)}`,
      `12-month upside: ${moneyValue(dossier.roi?.twelveMonthUpside)}`,
      "",
      dossier.roi?.roiStory || ""
    ].join("\n");
  }
  return JSON.stringify(dossier, null, 2);
}

function renderRevenueEngine(report) {
  const dossier = report?.dossier || {};
  if (!dossier.proposal && !dossier.roi && !dossier.salesAgent) return "";
  const leadId = report?.lead?.id || "";
  const clientReportUrl = leadId ? `/client-report.html?id=${encodeURIComponent(leadId)}` : "";
  return `
    <section class="panel" style="grid-column:1 / -1;">
      <div class="section-header compact-header">
        <div>
          <h2>AI Sales Agent</h2>
          <p>Proposal, ROI, contact verification, and follow-up assets for this lead.</p>
        </div>
        <div class="toolbar">
          <button class="btn btn-secondary" type="button" data-copy-report-asset="proposal">Copy Proposal</button>
          <button class="btn btn-secondary" type="button" data-copy-report-asset="call-script">Copy Script</button>
          <button class="btn btn-secondary" type="button" data-copy-report-asset="outreach-sequence">Copy Sequence</button>
          ${clientReportUrl ? `<a class="btn btn-primary" href="${clientReportUrl}">Client Report</a>` : ""}
        </div>
      </div>
      ${renderAssetSummaryCards(dossier)}
    </section>

    <section class="panel">
      <h2>Why This Lead Will Buy</h2>
      ${renderBulletList(dossier.leadReasons, "No purchase reasons generated yet.")}
      <h2 style="margin-top:20px;">Contact Finder</h2>
      <div class="audit-list">${renderRows(dossier.contactFinder, { empty: "No contact finder data generated yet." })}</div>
    </section>

    <section class="panel">
      <h2>ROI Calculator</h2>
      <div class="audit-list">
        <div class="audit-item"><span>Setup investment</span><strong>${moneyValue(dossier.roi?.setupInvestment)}</strong></div>
        <div class="audit-item"><span>Monthly upside</span><strong>${moneyValue(dossier.roi?.estimatedMonthlyUpside)}</strong></div>
        <div class="audit-item"><span>Break-even</span><strong>${escapeHtml(displayValue(dossier.roi?.breakEvenMonths))} months</strong></div>
        <div class="audit-item"><span>12-month upside</span><strong>${moneyValue(dossier.roi?.twelveMonthUpside)}</strong></div>
      </div>
      <p style="margin-top:12px;">${escapeHtml(dossier.roi?.roiStory || "ROI estimate pending.")}</p>
      <button class="btn btn-secondary" type="button" data-copy-report-asset="roi" style="margin-top:14px;">Copy ROI</button>
    </section>

    <section class="panel">
      <h2>Proposal Pack</h2>
      <div class="audit-list">${renderRows(dossier.proposal, { empty: "No proposal pack generated yet." })}</div>
    </section>

    <section class="panel">
      <h2>Call Script</h2>
      <div class="audit-list">${renderRows(dossier.callScript, { empty: "No call script generated yet." })}</div>
      <h2 style="margin-top:20px;">Objection Handler</h2>
      <div class="audit-list">${renderObjectionHandlers(dossier.objectionHandlers)}</div>
    </section>

    <section class="panel">
      <h2>7-Day Outreach Sequence</h2>
      <div class="audit-list">${renderOutreachSequence(dossier.outreachSequence)}</div>
    </section>

    <section class="panel">
      <h2>Competitor Gap Finder</h2>
      <div class="audit-list">${renderRows(dossier.competitorGap, { empty: "No competitor gap data generated yet." })}</div>
    </section>
  `;
}

function populateCountries() {
  const select = byId("country");
  if (!select) return;
  select.innerHTML = countries.map((country) => (
    `<option value="${escapeHtml(country)}"${defaultCountries.includes(country) ? " selected" : ""}>${escapeHtml(country)}</option>`
  )).join("");
}

function populateBusinessTypes() {
  const select = byId("businessTypes");
  if (!select) return;
  const selectedDefaults = new Set(defaultBusinessTypes);
  select.innerHTML = businessTypes.map(([value, label]) => (
    `<option value="${escapeHtml(value)}"${selectedDefaults.has(value) ? " selected" : ""}>${escapeHtml(label)}</option>`
  )).join("");
}

function selectMultiValues(id, values = []) {
  const field = byId(id);
  if (!field) return;
  const selected = new Set(values);
  Array.from(field.options || []).forEach((option) => {
    option.selected = selected.has(option.value);
  });
}

function setFieldValue(id, value) {
  const field = byId(id);
  if (field) field.value = value ?? "";
}

function setCheckedValue(id, value) {
  const field = byId(id);
  if (field) field.checked = Boolean(value);
}

function applyNichePack(pack) {
  selectMultiValues("country", pack.countries);
  selectMultiValues("businessTypes", pack.businessTypes);
  setFieldValue("city", pack.city || "");
  setFieldValue("industry", pack.industry || "");
  setFieldValue("keyword", pack.keyword || "");
  setFieldValue("leadQuality", pack.leadQuality || "all");
  setFieldValue("sortBy", pack.sortBy || "opportunity");
  setFieldValue("searchDepth", pack.searchDepth || "deep");
  setFieldValue("limit", String(pack.limit || 20));
  setFieldValue("minOpportunityScore", String(pack.minOpportunityScore || 0));
  setCheckedValue("missingWebsiteOnly", pack.missingWebsiteOnly);
  setCheckedValue("requireContact", pack.requireContact);
  updateMapPreview();
  const note = byId("searchNote");
  if (note) note.textContent = `${pack.name} loaded. Searching real map data with the selected revenue preset.`;
  byId("leadSearchForm")?.requestSubmit();
}

function initNichePacks() {
  const target = document.querySelector("[data-niche-packs]");
  if (!target) return;
  target.innerHTML = nichePacks.map((pack) => `
    <button class="niche-pack-button" type="button" data-niche-pack="${escapeHtml(pack.id)}">
      <strong>${escapeHtml(pack.name)}</strong>
      <span>${escapeHtml(pack.description)}</span>
    </button>
  `).join("");
  target.addEventListener("click", (event) => {
    const button = event.target.closest("[data-niche-pack]");
    if (!button) return;
    const pack = nichePacks.find((item) => item.id === button.dataset.nichePack);
    if (pack) applyNichePack(pack);
  });
}

function selectedValues(select, fallback = []) {
  if (!select) return [...fallback];
  const values = Array.from(select.selectedOptions || []).map((option) => option.value).filter(Boolean);
  if (values.length) return values;
  if (select.value) return [select.value];
  return [...fallback];
}

function normalizedMapLink(value) {
  return decodeURIComponent(String(value || "").trim()).replace(/&amp;/g, "&");
}

function isDefaultMapLink(value) {
  const normalized = normalizedMapLink(value);
  return defaultMapLinks.some((link) => normalized === normalizedMapLink(link));
}

function normalizedInteger(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
}

function getSearchPayload(form, options = {}) {
  const params = new URLSearchParams(window.location.search);
  const payload = Object.fromEntries(new FormData(form).entries());
  for (const [key, value] of params.entries()) {
    if (!payload[key] && value) payload[key] = value;
  }
  const countrySelect = byId("country");
  const selectedCountries = selectedValues(countrySelect, defaultCountries);
  payload.countries = selectedCountries;
  payload.country = selectedCountries[0] || payload.country || "";

  const businessTypeSelect = byId("businessTypes");
  const selectedBusinessTypes = selectedValues(businessTypeSelect, defaultBusinessTypes);
  payload.businessTypes = selectedBusinessTypes;
  if (!payload.industry && selectedBusinessTypes.length) {
    payload.industry = selectedBusinessTypes.join(", ");
  }
  payload.mapLink = String(payload.mapLink || "").trim();
  payload.radiusMeters = normalizedInteger(payload.radiusMeters, 15000, 500, 50000);
  payload.limit = normalizedInteger(payload.limit, 20, 1, 200);
  payload.minOpportunityScore = normalizedInteger(payload.minOpportunityScore, 0, 0, 100);
  payload.searchDepth = payload.searchDepth || "deep";
  payload.leadQuality = payload.leadQuality || "all";
  payload.sortBy = payload.sortBy || "opportunity";
  payload.requireContact = Boolean(byId("requireContact")?.checked);
  payload.missingWebsiteOnly = Boolean(byId("missingWebsiteOnly")?.checked);
  if (options.refresh) {
    payload.bypassCache = true;
    payload.refreshSeed = `${Date.now()}-${globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2)}`;
  }
  return payload;
}

function parseMapLink(mapLink) {
  if (!mapLink) return null;
  const decoded = decodeURIComponent(mapLink);
  const atMatch = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,(\d+(?:\.\d+)?)z)?/i.exec(decoded);
  if (atMatch) {
    return {
      latitude: Number(atMatch[1]),
      longitude: Number(atMatch[2]),
      zoom: atMatch[3] ? Number(atMatch[3]) : 11
    };
  }
  const queryMatch = /[?&](?:q|ll)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i.exec(decoded);
  if (queryMatch) {
    return {
      latitude: Number(queryMatch[1]),
      longitude: Number(queryMatch[2]),
      zoom: 11
    };
  }
  return null;
}

function updateMapPreview() {
  const field = byId("mapLink");
  const preview = byId("mapPreview");
  const meta = byId("mapMeta");
  const radius = byId("radiusMeters");
  if (!field || !preview || !meta) return;

  const parsed = parseMapLink(field.value);
  if (!parsed) {
    preview.innerHTML = `<iframe title="Germany default map preview" src="https://www.google.com/maps?q=52.52,13.405&z=6&output=embed" loading="lazy"></iframe>`;
    meta.textContent = "Default country scan: Germany. Paste a Google Maps link only for an exact area.";
    return;
  }

  const zoom = Math.max(3, Math.min(18, Math.round(parsed.zoom || 11)));
  preview.innerHTML = `<iframe title="Google Maps location preview" src="https://www.google.com/maps?q=${parsed.latitude},${parsed.longitude}&z=${zoom}&output=embed" loading="lazy"></iframe>`;
  meta.textContent = `Centered at ${parsed.latitude}, ${parsed.longitude}. Radius: ${Number(radius?.value || 15000).toLocaleString()} meters.`;
}

function renderLead(lead) {
  const score = lead.opportunityScore ?? lead.audit?.score ?? 0;
  const websiteUrl = safeExternalUrl(lead.websiteUrl);
  const mapsUrl = safeExternalUrl(lead.googleMapsLink);
  const website = websiteUrl ? `<a href="${websiteUrl}" target="_blank" rel="noreferrer">${escapeHtml(websiteUrl)}</a>` : "Website missing";
  const market = lead.marketName ? `<span class="tag">${escapeHtml(lead.marketName)}</span>` : "";
  // Contact fields can come from OpenStreetMap, Google Places, or the verified
  // public website profile. Resolve all sources before deciding what to show.
  const phone = primaryPhone(lead);
  const publicEmail = lead.email || lead.details?.contact?.email || lead.audit?.publicProfile?.emails?.[0] || "";
  const email = publicEmail ? `<span class="tag success">Email: ${escapeHtml(publicEmail)}</span>` : "";
  const phoneTag = phone ? `<span class="tag success">Phone: ${escapeHtml(phone)}</span>` : `<span class="tag">Phone unavailable</span>`;
  const hours = lead.openingHours ? `<span class="tag">Hours found</span>` : "";
  const source = lead.source ? `<span class="tag">${escapeHtml(lead.source.replaceAll("_", " "))}</span>` : "";
  const storedResult = lead.searchResultOrigin === "previously_discovered" ? `<span class="tag">Previously discovered</span>` : "";
  const socialLinks = socialLinksFromLead(lead);
  const socialUrl = firstSocialUrl(lead);
  const whatsapp = whatsappActionFromLead(lead);
  const socialFound = socialUrl || Object.keys(socialLinks).length
    ? `<span class="tag success">Social found</span>`
    : "";
  const whatsappFound = whatsapp ? `<span class="tag success">${escapeHtml(whatsapp.status)}</span>` : "";
  const contactReady = (phone || publicEmail || lead.social || Object.keys(socialLinks).length) ? `<span class="tag success">Contact ready</span>` : "";
  const websiteGap = !lead.websiteUrl ? `<span class="tag warning">Needs website</span>` : "";
  const enrichmentConfidence = Number(lead.details?.enrichment?.confidence);
  const confidenceTag = Number.isFinite(enrichmentConfidence) && enrichmentConfidence > 0
    ? `<span class="tag" title="Based on publicly observed business fields">Data confidence ${enrichmentConfidence}%</span>`
    : "";
  return `
    <article class="lead-card">
      <div class="lead-card__top">
        <div>
          <h3>${escapeHtml(lead.name)}</h3>
          <p>${escapeHtml(lead.businessType || lead.category || "Local business")} - ${escapeHtml(lead.address || "Address unavailable")}</p>
          <label class="select-check">
            <input type="checkbox" data-result-select="${escapeHtml(lead.id)}">
            <span>Select lead</span>
          </label>
        </div>
        <span class="score-pill ${scoreClass(score)}">${score}/100</span>
      </div>
      ${renderLeadStrength(lead)}
      <div class="lead-meta">
        <span class="tag">${escapeHtml(lead.rating || "No")} rating</span>
        <span class="tag">${escapeHtml(lead.reviewsCount || 0)} reviews</span>
        ${phoneTag}
        ${market}
        ${email}
        ${hours}
        ${socialFound}
        ${whatsappFound}
        ${contactReady}
        ${websiteGap}
        ${confidenceTag}
        ${storedResult}
        ${source}
      </div>
      <p>${website}</p>
      ${renderContactActions(lead)}
      <div class="lead-actions">
        <a class="btn btn-secondary" href="/lead-details.html?id=${encodeURIComponent(lead.id)}">View</a>
        <button class="btn btn-primary" type="button" data-open-deal-closer="${escapeHtml(lead.id)}">Close Deal</button>
        <button class="btn btn-primary" type="button" data-save-lead="${lead.id}">Save Lead</button>
        <label class="select-check" title="Tick to reveal the AI website builder for this lead">
          <input type="checkbox" data-ai-website-toggle="${escapeHtml(lead.id)}">
          <span>Use AI to create website</span>
        </label>
        <button class="btn btn-primary" type="button" hidden data-create-website="${escapeHtml(lead.id)}" data-lead-name="${escapeHtml(lead.name || "Business")}">Create Website</button>
        ${renderWhatsappButton(lead, "btn btn-secondary")}
        ${renderSocialButtons(lead)}
        ${mapsUrl ? `<a class="btn btn-ghost" href="${mapsUrl}" target="_blank" rel="noreferrer">Maps</a>` : ""}
      </div>
    </article>
  `;
}

function renderLocalSavedLead(lead) {
  const score = lead.opportunityScore ?? lead.audit?.score ?? 0;
  const mapsUrl = safeExternalUrl(lead.googleMapsLink);
  const websiteUrl = safeExternalUrl(lead.websiteUrl);
  const socialUrl = firstSocialUrl(lead);
  const whatsapp = whatsappActionFromLead(lead);
  const savedAt = lead.localSavedAt ? new Date(lead.localSavedAt).toLocaleString() : "Saved locally";
  return `
    <article class="lead-card local-lead-card">
      <div class="lead-card__top">
        <div>
          <h3>${escapeHtml(lead.name || "Saved lead")}</h3>
          <p>${escapeHtml(lead.businessType || lead.category || "Local business")} - ${escapeHtml(lead.address || "Address unavailable")}</p>
        </div>
        <span class="score-pill ${scoreClass(score)}">${score}/100</span>
      </div>
      ${renderLeadStrength(lead)}
      <div class="lead-meta">
        <span class="tag success">Local saved</span>
        <span class="tag tag-lead-id" title="Lead ID — used by AI tools and Website Studio">ID ${escapeHtml(lead.leadId || localLeadId(lead))}</span>
        <span class="tag">${escapeHtml(lead.localStage || lead.stage || "New")}</span>
        ${lead.localCampaign ? `<span class="tag">${escapeHtml(lead.localCampaign)}</span>` : ""}
        ${localReminderStatus(lead) === "due" ? `<span class="tag warning">Follow up due</span>` : ""}
        ${socialUrl ? `<span class="tag success">Social found</span>` : ""}
        ${whatsapp ? `<span class="tag success">${escapeHtml(whatsapp.status)}</span>` : ""}
        <span class="tag">${escapeHtml(lead.phone || "No phone")}</span>
        ${lead.email ? `<span class="tag">${escapeHtml(lead.email)}</span>` : ""}
        ${lead.marketName ? `<span class="tag">${escapeHtml(lead.marketName)}</span>` : ""}
      </div>
      <p>${websiteUrl ? `<a href="${websiteUrl}" target="_blank" rel="noreferrer">${escapeHtml(websiteUrl)}</a>` : "Website missing"}</p>
      <p class="muted-value">${escapeHtml(savedAt)}</p>
      ${renderContactActions(lead)}
      ${renderLocalLeadTools(lead)}
      <div class="lead-actions">
        <a class="btn btn-secondary" href="/lead-details.html?id=${encodeURIComponent(localLeadId(lead))}">View</a>
        <button class="btn btn-primary" type="button" data-open-deal-closer="${escapeHtml(localLeadId(lead))}">Close Deal</button>
        <label class="select-check" title="Tick to reveal the AI website builder for this lead">
          <input type="checkbox" data-ai-website-toggle="${escapeHtml(localLeadId(lead))}">
          <span>Use AI to create website</span>
        </label>
        <button class="btn btn-primary" type="button" hidden data-create-website="${escapeHtml(localLeadId(lead))}" data-lead-name="${escapeHtml(lead.name || "Business")}">Create Website</button>
        ${renderWhatsappButton(lead, "btn btn-secondary")}
        ${socialUrl ? `<a class="btn btn-ghost" href="${socialUrl}" target="_blank" rel="noreferrer">Social</a>` : ""}
        ${mapsUrl ? `<a class="btn btn-ghost" href="${mapsUrl}" target="_blank" rel="noreferrer">Maps</a>` : ""}
        <button class="btn btn-ghost" type="button" data-delete-local-lead="${escapeHtml(localLeadId(lead))}">Delete</button>
      </div>
    </article>
  `;
}

function renderLocalSavedLeads() {
  const target = byId("localSavedLeads");
  const summary = byId("localSavedLeadSummary");
  if (!target) return;

  const allLeads = readLocalSavedLeads();
  const leads = filteredLocalSavedLeads();
  const dueCount = allLeads.filter((lead) => localReminderStatus(lead) === "due").length;
  if (summary) {
    summary.textContent = allLeads.length
      ? `${leads.length} of ${allLeads.length} saved leads shown. ${dueCount} follow-ups due. Leads stay after logout until you delete them.`
      : "No local saved leads yet.";
  }
  target.innerHTML = leads.length
    ? leads.map(renderLocalSavedLead).join("")
    : `<div class="empty-state">Saved leads will appear here after you press Save Lead or Save All.</div>`;
}

function renderLocalLeadDetail(target, lead) {
  const report = localReportFromLead(lead);
  activeLeadReport = report;
  const dossier = report.dossier;
  const score = lead.opportunityScore ?? lead.audit?.score ?? 0;
  const websiteUrl = safeExternalUrl(lead.websiteUrl);
  const mapsUrl = safeExternalUrl(lead.googleMapsLink);
  const socialLinks = socialLinksFromLead(lead);
  const socialUrl = firstSocialUrl(lead);
  const whatsapp = whatsappActionFromLead(lead);
  target.innerHTML = `
    <section class="panel">
      <div class="lead-card__top">
        <div>
          <h2>${escapeHtml(lead.name || "Saved lead")}</h2>
          <p>${escapeHtml(lead.businessType || lead.category || "Local business")} - ${escapeHtml(lead.address || "Address unavailable")}</p>
        </div>
        <span class="score-pill ${scoreClass(score)}">${score}/100</span>
      </div>
      <div class="lead-meta" style="margin-top:14px;">
        <span class="tag success">Loaded from local storage</span>
        <span class="tag tag-lead-id" title="Lead ID — used by AI tools and Website Studio">ID ${escapeHtml(lead.leadId || localLeadId(lead))}</span>
        <span class="tag">${lead.phone ? "Phone found" : "Phone missing"}</span>
        <span class="tag">${lead.email ? "Email found" : "Email missing"}</span>
        <span class="tag">${lead.websiteUrl ? "Website found" : "Website missing"}</span>
        ${socialUrl ? `<span class="tag success">Social found</span>` : ""}
        ${whatsapp ? `<span class="tag success">${escapeHtml(whatsapp.status)}</span>` : ""}
      </div>
      ${renderLeadStrength(lead)}
      <div class="lead-actions" style="margin-top:16px;">
        ${websiteUrl ? `<a class="btn btn-secondary" href="${websiteUrl}" target="_blank" rel="noreferrer">Website</a>` : ""}
        ${mapsUrl ? `<a class="btn btn-secondary" href="${mapsUrl}" target="_blank" rel="noreferrer">Maps</a>` : ""}
        ${renderWhatsappButton(lead, "btn btn-secondary")}
        ${socialUrl ? `<a class="btn btn-secondary" href="${socialUrl}" target="_blank" rel="noreferrer">Social</a>` : ""}
        <button class="btn btn-secondary" type="button" data-copy-dossier>Copy All Data</button>
        <button class="btn btn-primary" type="button" data-copy-brief>Copy Website Brief</button>
        <button class="btn btn-secondary" type="button" data-download-json>JSON</button>
        <button class="btn btn-secondary" type="button" data-download-csv>CSV</button>
        <button class="btn btn-ghost" type="button" data-delete-local-lead="${escapeHtml(localLeadId(lead))}">Delete Local</button>
      </div>
      <h2 style="margin-top:20px;">Verified Contact Actions</h2>
      ${renderContactActions(lead)}
    </section>

    <section class="panel" style="grid-column:1 / -1;">
      <h2>Copy-Ready Website Build Brief</h2>
      <pre class="copy-brief">${escapeHtml(localWebsiteBrief(lead))}</pre>
    </section>

    ${renderRevenueEngine(report)}

    <section class="panel">
      <h2>Contact Details</h2>
      <div class="audit-list">
        ${renderExpectedRows(dossier.contact, [
          ["phone", "Phone"],
          ["mobile", "Mobile"],
          ["email", "Email"],
          ["website", "Website", "website"]
        ])}
        ${renderWhatsappContact(lead)}
      </div>
      <h2 style="margin-top:20px;">Local CRM</h2>
      ${renderLocalLeadTools(lead)}
    </section>

    <section class="panel">
      <h2>Social Links</h2>
      <div class="audit-list">${renderSocialLinks({ ...dossier.social, ...socialLinks }, "No social links saved locally.")}</div>
      <h2 style="margin-top:20px;">Website Discovery</h2>
      <div class="audit-list">${renderRows(dossier.websiteDiscovery, { empty: "No website discovery data saved locally." })}</div>
      <h2 style="margin-top:20px;">Social Finder Links</h2>
      <div class="audit-list">${renderRows({
        facebookSearch: dossier.verificationLinks?.facebookSearch,
        instagramSearch: dossier.verificationLinks?.instagramSearch,
        linkedinSearch: dossier.verificationLinks?.linkedinSearch,
        tiktokSearch: dossier.verificationLinks?.tiktokSearch,
        youtubeSearch: dossier.verificationLinks?.youtubeSearch,
        xSearch: dossier.verificationLinks?.xSearch,
        whatsappContact: dossier.verificationLinks?.whatsappContact
      }, { empty: "No social finder links saved locally." })}</div>
    </section>

    <section class="panel">
      <h2>Business Details</h2>
      <div class="audit-list">${renderRows(dossier.business, { empty: "No business details saved locally." })}</div>
    </section>

    <section class="panel">
      <h2>Location</h2>
      <div class="audit-list">${renderRows(dossier.location, { empty: "No location details saved locally." })}</div>
    </section>

    <section class="panel">
      <h2>Local Storage Data</h2>
      <p>This data is stored in this browser and remains after logout until deleted.</p>
      <pre class="code-block">${escapeHtml(JSON.stringify(lead, null, 2))}</pre>
    </section>
  `;
}

function visibleLeadFilterState() {
  return {
    query: String(byId("visibleLeadSearch")?.value || "").trim().toLowerCase(),
    filter: byId("visibleLeadFilter")?.value || "all",
    minScore: Number(byId("visibleLeadMinScore")?.value || 0)
  };
}

function leadMatchesVisibleFilter(lead, state) {
  if (state.query && !leadText(lead).includes(state.query)) return false;
  if (leadStrengthScore(lead) < state.minScore) return false;
  // A verified public social profile is a valid contact path. Keep this
  // browser-side command-center filter consistent with the server's
  // Contact details only rule so it never hides qualifying social-only leads.
  if (state.filter === "contact_ready" && !(primaryPhone(lead) || lead.email || whatsappActionFromLead(lead) || hasSocialLinks(lead))) return false;
  if (state.filter === "has_whatsapp" && !whatsappActionFromLead(lead)) return false;
  if (state.filter === "needs_website" && lead.websiteUrl) return false;
  if (state.filter === "has_social" && !hasSocialLinks(lead)) return false;
  if (state.filter === "high_score" && leadStrengthScore(lead) < 70) return false;
  return true;
}

function filteredVisibleLeadResults() {
  const state = visibleLeadFilterState();
  return currentLeadResults.filter((lead) => leadMatchesVisibleFilter(lead, state));
}

function resetLeadResultPage() {
  currentResultPage = 1;
}

function updateSearchRunDetails() {
  const target = byId("searchRunDetails");
  if (!target) return;
  if (!currentSearchMetadata) {
    target.hidden = true;
    target.textContent = "";
    return;
  }
  const stats = currentSearchMetadata.searchStats || {};
  const requested = Number(stats.appliedResultLimit || stats.requestedLimit || currentLeadResults.length);
  const returned = Number(stats.returnedLimit ?? currentLeadResults.length);
  const filtered = currentFilteredLeadResults.length;
  const pageSize = selectedResultPageSize();
  const totalPages = totalLeadResultPages();
  const start = filtered ? ((currentResultPage - 1) * pageSize) + 1 : 0;
  const end = Math.min(currentResultPage * pageSize, filtered);
  target.hidden = false;
  target.textContent = `Search status: requested ${requested}, returned ${returned}, currently matching ${filtered}. Page ${currentResultPage} of ${totalPages}; showing ${start}-${end}.`;
}

function selectedResultPageSize() {
  // Requested results and visible-card pagination are deliberately separate:
  // requesting 100 should still give the user useful Next/Previous pages.
  // Never silently fall back to the old five-card layout. Search volume and
  // card pagination are separate, and the professional dashboard starts at
  // twenty cards per page while still allowing smaller values only through
  // an explicit, current control.
  return normalizedInteger(byId("leadPageSize")?.value, 20, 10, 100);
}

function totalLeadResultPages() {
  return Math.max(1, Math.ceil(currentFilteredLeadResults.length / selectedResultPageSize()));
}

function selectedVisibleLeadIds() {
  return new Set(Array.from(document.querySelectorAll("[data-result-select]:checked")).map((input) => input.dataset.resultSelect));
}

function selectedVisibleLeads() {
  const selected = selectedVisibleLeadIds();
  return currentVisibleLeadResults.filter((lead) => selected.has(String(lead.id)));
}

function updateLeadCommandSummary() {
  const target = byId("leadCommandSummary");
  if (!target) return;
  const selectedCount = selectedVisibleLeadIds().size;
  const totalPages = totalLeadResultPages();
  const whatsappCount = currentFilteredLeadResults.filter((lead) => whatsappActionFromLead(lead)).length;
  const noWebsiteCount = currentFilteredLeadResults.filter((lead) => !lead.websiteUrl).length;
  const contactCount = currentFilteredLeadResults.filter((lead) => primaryPhone(lead) || lead.email || whatsappActionFromLead(lead) || hasSocialLinks(lead)).length;
  target.textContent = currentLeadResults.length
    ? `Page ${currentResultPage} of ${totalPages}. Showing ${currentVisibleLeadResults.length} of ${currentFilteredLeadResults.length} filtered leads (${currentLeadResults.length} total). ${contactCount} contact-ready, ${whatsappCount} WhatsApp actions, ${noWebsiteCount} need websites. ${selectedCount} selected on this page.`
    : "Run a search to activate lead filters and bulk actions.";
}

function renderLeadPagination() {
  const target = byId("leadPagination");
  if (!target) return;

  if (!currentFilteredLeadResults.length) {
    target.innerHTML = "";
    return;
  }

  const totalPages = totalLeadResultPages();
  const pageSize = selectedResultPageSize();
  const start = (currentResultPage - 1) * pageSize + 1;
  const end = Math.min(currentResultPage * pageSize, currentFilteredLeadResults.length);
  const needsPaging = totalPages > 1;
  const firstPage = Math.max(1, Math.min(currentResultPage - 2, totalPages - 4));
  const lastPage = Math.min(totalPages, firstPage + 4);
  const pageButtons = Array.from({ length: lastPage - firstPage + 1 }, (_, offset) => {
    const page = firstPage + offset;
    return `<button class="btn ${page === currentResultPage ? "btn-primary" : "btn-secondary"}" type="button" data-lead-page="${page}" ${page === currentResultPage ? 'aria-current="page"' : ""} aria-label="Go to lead results page ${page}">${page}</button>`;
  }).join("");
  target.innerHTML = `
    <div class="pagination-controls">
      <button class="btn btn-secondary" type="button" data-lead-page="first" ${currentResultPage <= 1 ? "disabled" : ""}>First</button>
      <button class="btn btn-secondary" type="button" data-lead-page="prev" ${currentResultPage <= 1 ? "disabled" : ""}>Previous</button>
      <span class="pagination-status" aria-live="polite">Showing ${start}-${end} of ${currentFilteredLeadResults.length} leads</span>
      <span class="pagination-pages" aria-label="Lead result pages">${pageButtons}</span>
      <button class="btn btn-primary" type="button" data-lead-page="next" ${currentResultPage >= totalPages ? "disabled" : ""}>Next</button>
      <button class="btn btn-secondary" type="button" data-lead-page="last" ${currentResultPage >= totalPages ? "disabled" : ""}>Last</button>
      <button class="btn btn-secondary" type="button" data-refresh-leads>Refresh Leads</button>
    </div>
    ${needsPaging ? "" : `<div class="notice pagination-note">All matching leads are on this page.</div>`}
  `;
}

function renderFilteredLeadResults() {
  const target = byId("leadResults");
  if (!target) return;
  currentFilteredLeadResults = filteredVisibleLeadResults();
  const totalPages = totalLeadResultPages();
  currentResultPage = Math.min(Math.max(currentResultPage, 1), totalPages);
  const pageSize = selectedResultPageSize();
  const pageStart = (currentResultPage - 1) * pageSize;
  currentVisibleLeadResults = currentFilteredLeadResults.slice(pageStart, pageStart + pageSize);
  updateSearchRunDetails();

  if (!currentLeadResults.length) {
    const requiresContact = Boolean(byId("requireContact")?.checked) || byId("leadQuality")?.value === "contact_ready";
    const requiresMissingWebsite = Boolean(byId("missingWebsiteOnly")?.checked) || byId("leadQuality")?.value === "needs_website";
    const emptyMessage = requiresContact
      ? "No businesses with a verified public phone, email, or social contact were found in this area. Try a larger radius, another city, or refresh the search."
      : requiresMissingWebsite
        ? "No businesses without a website URL listed in the available public map data matched this area. Try a larger radius, another city, or refresh the search."
        : "No leads found for this search yet. Try Refresh Leads, choose a different business type, or paste a more exact Google Maps city link.";
    target.innerHTML = `<div class="empty-state">${hasLeadSearchRun ? emptyMessage : "Start a search to discover leads."}</div>`;
    renderLeadPagination();
    updateLeadCommandSummary();
    return;
  }

  if (!currentFilteredLeadResults.length) {
    target.innerHTML = `<div class="empty-state">No leads match the current filters. Lower the minimum score or switch the filter back to All results.</div>`;
    renderLeadPagination();
    updateLeadCommandSummary();
    return;
  }

  target.innerHTML = currentVisibleLeadResults.map(renderLead).join("");
  renderLeadPagination();
  updateLeadCommandSummary();
}

function renderResults(leads, metadata = null) {
  const target = byId("leadResults");
  if (!target) return;
  hasLeadSearchRun = true;
  currentSearchMetadata = metadata;
  // Search results use provider identity, while the explicit Local Saved
  // Leads cleanup keeps its broader name/contact duplicate behavior.
  currentLeadResults = dedupeSearchResults(Array.isArray(leads) ? leads : []);
  resetLeadResultPage();
  renderFilteredLeadResults();
}

function requiresNodeLeadApi() {
  const isLocalHost = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
  if (!isLocalHost || !window.location.port || window.location.port === "3000") return false;
  const note = byId("searchNote");
  if (note) note.textContent = "Connected to the MAT LEADS Node API at localhost:3000. Your search will run through the secure server even from this local preview.";
  return false;
}

function initLeadSearch() {
  const form = byId("leadSearchForm");
  const target = byId("leadResults");
  if (!form || !target) return;
  if (requiresNodeLeadApi()) return;
  if (!requireAuth()) return;

  const params = new URLSearchParams(window.location.search);
  for (const [key, value] of params.entries()) {
    const field = form.elements.namedItem(key);
    if (field?.multiple) {
      const values = new Set(params.getAll(key).flatMap((item) => item.split(",")));
      Array.from(field.options).forEach((option) => {
        option.selected = values.has(option.value);
      });
    } else if (field) {
      field.value = value;
    } else if (key === "country" || key === "countries") {
      const countrySelect = byId("country");
      const values = new Set(params.getAll(key).flatMap((item) => item.split(",")));
      Array.from(countrySelect?.options || []).forEach((option) => {
        option.selected = values.has(option.value);
      });
    }
  }

  let searchInFlight = false;

  async function runLeadSearch({ refresh = false } = {}) {
    if (!requireAuth()) return;
    if (searchInFlight) return;
    searchInFlight = true;
    const actionButtons = form.querySelectorAll("button");
    form.setAttribute("aria-busy", "true");
    actionButtons.forEach((button) => {
      button.disabled = true;
    });
    currentLeadResults = [];
    currentFilteredLeadResults = [];
    currentVisibleLeadResults = [];
    currentSearchMetadata = null;
    resetLeadResultPage();
    renderLeadPagination();
    updateLeadCommandSummary();
    updateSearchRunDetails();
    target.innerHTML = `<div class="skeleton">${refresh ? "Refreshing with new real leads..." : "Searching real business map data..."}</div>`;
    const note = byId("searchNote");
    if (note) note.textContent = refresh ? "Refreshing the selected market with fresh provider data..." : "Connecting to the secure lead provider and scanning the selected market...";

    try {
      const result = await apiFetch("/api/leads/search", {
        method: "POST",
        body: JSON.stringify(getSearchPayload(form, { refresh }))
      });
      syncTrialUsage(result.trial);
      renderResults(result.leads || [], result);
      const note = byId("searchNote");
      if (note) {
        const locationText = result.location
          ? ` around ${result.location.latitude}, ${result.location.longitude}`
          : "";
        const provider = result.providerLabel || (result.source === "openstreetmap_overpass" ? "OpenStreetMap Overpass" : "Google Places");
        const countryText = result.selectedCountries?.length ? ` Countries: ${result.selectedCountries.join(", ")}.` : "";
        const stats = result.searchStats
          ? ` Scanned ${result.searchStats.rawCount} raw, qualified ${result.searchStats.qualifiedCount} from ${result.searchStats.qualifiedPoolCount || result.searchStats.qualifiedCount} matching candidates, depth ${result.searchStats.searchDepth}.`
          : "";
        const cacheText = result.cached ? " Cached repeat search." : "";
        const refreshText = result.refreshed ? " Fresh lead refresh was used." : "";
        const relaxedText = result.searchStats?.filtersRelaxed ? " Strict filters had no matches, so top real candidates were shown." : "";
        const trialText = trialSearchText(result.trial);
        const pageText = (result.leads || []).length > selectedResultPageSize() ? " Use Next and Previous below the cards to browse all returned leads." : "";
        const strictCoverageText = result.searchStats?.strictContactFilter && result.searchStats?.strictMissingWebsiteFilter
          ? " Both strict filters were verified against public map fields; only businesses with a public phone, email, or social tag and no listed website URL are included."
          : "";
        const limitedCoverageText = result.searchStats?.strictContactFilter && result.searchStats?.qualifiedCount < result.searchStats?.requestedLimit
          ? " Fewer results means the selected market currently has fewer public map records meeting every strict requirement; use Refresh Leads or broaden the location to scan other real records."
          : "";
        const sourceCoverageText = result.searchStats?.contactCoverageLimited
          ? " The fallback provider has limited public contact and website coverage; configure Google Places for more complete licensed business profiles."
          : "";
        const coverage = result.searchStats?.qualityCoverage;
        const excludedText = result.searchStats?.searchExhausted && coverage
          ? ` Of ${coverage.scanned} real records scanned, ${coverage.missingPublicContact} lacked a public contact method, ${coverage.websiteListed} already listed a website, and ${coverage.belowMinimumScore} were below the chosen score.`
          : "";
        const planLimitText = result.searchStats?.planResultLimited
          ? ` Your current plan allows up to ${result.searchStats.appliedResultLimit} leads per search; upgrade to request 20, 100, or more.`
          : "";
        const adminAccessText = result.adminUnlimited
          ? " Admin access confirmed: no plan result cap was applied."
          : "";
        const providerWarningText = result.pagination?.warning
          ? ` Provider note: ${result.pagination.warning}`
          : "";
        const storedResultText = result.searchStats?.usedStoredSearchResults
          ? ` ${result.searchStats.storedResultCount} matching result(s) came from your authorized previously discovered public-map records while fresh provider data was limited.`
          : "";
        const availabilityText = result.searchStats?.searchExhausted
          ? ` ${result.searchStats.returnedLimit} verified matching result(s) are currently available for the exact filters selected; the requested total cannot be padded with unverified businesses.`
          : "";
        note.textContent = `Real ${provider} results loaded${locationText}.${countryText}${stats}${strictCoverageText}${limitedCoverageText}${excludedText}${sourceCoverageText}${storedResultText}${availabilityText}${planLimitText}${adminAccessText}${providerWarningText}${cacheText}${refreshText}${relaxedText}${trialText}${pageText} Query: ${result.query || "businesses"}.`;
      }
    } catch (error) {
      const raw = String(error?.message || "Search failed");
      target.innerHTML = `<div class="error-state">${raw}</div>`;
      const note = byId("searchNote");
      if (note) note.textContent = raw.includes("free trial")
        ? `${error.message} Open Pricing to subscribe.`
        : /validation|invalid request/i.test(raw)
          ? `${raw} — pick at least one Country or Business Type, then Search again.`
          : /google places/i.test(raw)
            ? `${raw} — remove GOOGLE_PLACES_API_KEY in Vercel to use free OpenStreetMap, or fix the Google key.`
            : /overpass|openstreetmap/i.test(raw)
              ? `${raw} — Overpass is rate-limited, click Refresh Leads to retry another mirror.`
              : "Real map-link search needs valid coordinates and an available map data provider.";
    } finally {
      actionButtons.forEach((button) => {
        button.disabled = false;
      });
      searchInFlight = false;
      form.removeAttribute("aria-busy");
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await runLeadSearch();
  });

  byId("searchNote")?.setAttribute("aria-live", "polite");
  form.querySelector("[data-search-submit]")?.addEventListener("click", () => {
    if (!searchInFlight) {
      const note = byId("searchNote");
      if (note) note.textContent = "Preparing your real lead search...";
    }
  });

  document.addEventListener("click", async (event) => {
    const refreshButton = event.target.closest("[data-refresh-leads]");
    if (refreshButton) {
      if (!form.contains(refreshButton) && !byId("leadPagination")?.contains(refreshButton)) return;
      await runLeadSearch({ refresh: true });
      return;
    }
    const expandButton = event.target.closest("[data-expand-search]");
    if (!expandButton || !form.contains(expandButton)) return;
    const radiusField = byId("radiusMeters");
    const currentRadius = normalizedInteger(radiusField?.value, 15000, 500, 50000);
    const expandedRadius = Math.min(50000, Math.max(currentRadius + 5000, currentRadius * 2));
    if (radiusField) radiusField.value = String(expandedRadius);
    updateMapPreview();
    await runLeadSearch({ refresh: true });
  });

  if (params.size > 0) form.requestSubmit();
}

function initMapLinkPreview() {
  const field = byId("mapLink");
  const radius = byId("radiusMeters");
  const country = byId("country");
  if (!field) return;
  field.addEventListener("input", updateMapPreview);
  radius?.addEventListener("change", updateMapPreview);
  country?.addEventListener("change", () => {
    if (isDefaultMapLink(field.value)) {
      field.value = "";
    }
    updateMapPreview();
  });
  updateMapPreview();
}

function initLeadCommandCenter() {
  ["visibleLeadSearch", "visibleLeadFilter", "visibleLeadMinScore", "leadPageSize"].forEach((id) => {
    const field = byId(id);
    field?.addEventListener("input", () => {
      resetLeadResultPage();
      renderFilteredLeadResults();
    });
    field?.addEventListener("change", () => {
      resetLeadResultPage();
      renderFilteredLeadResults();
    });
  });

  document.addEventListener("change", (event) => {
    if (event.target.closest("[data-result-select]")) {
      updateLeadCommandSummary();
    }
  });

  document.addEventListener("click", (event) => {
    const selectButton = event.target.closest("[data-select-visible-leads]");
    const pageButton = event.target.closest("[data-lead-page]");

    if (pageButton) {
      const totalPages = totalLeadResultPages();
      const requestedPage = pageButton.dataset.leadPage;
      if (requestedPage === "first") currentResultPage = 1;
      else if (requestedPage === "last") currentResultPage = totalPages;
      else if (requestedPage === "next") currentResultPage += 1;
      else if (requestedPage === "prev") currentResultPage -= 1;
      else currentResultPage = Number(requestedPage) || currentResultPage;
      currentResultPage = Math.min(Math.max(currentResultPage, 1), totalPages);
      renderFilteredLeadResults();
      byId("leadResults")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    if (!selectButton) return;
    const checkboxes = Array.from(document.querySelectorAll("[data-result-select]"));
    const shouldSelect = checkboxes.some((checkbox) => !checkbox.checked);
    checkboxes.forEach((checkbox) => {
      checkbox.checked = shouldSelect;
    });
    updateLeadCommandSummary();
  });
}

function initWebsiteStudioActions() {
  document.addEventListener("change", (event) => {
    const toggle = event.target.closest("[data-ai-website-toggle]");
    if (!toggle) return;
    const card = toggle.closest(".lead-card");
    const btn = card?.querySelector("[data-create-website]");
    if (btn) btn.hidden = !toggle.checked;
  });
  document.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-create-website]");
    if (!btn) return;
    if (!requireAuth()) return;
    const user = getCurrentUser();
    const pro = user && (String(user.role || "").toLowerCase() === "admin" || user?.entitlements?.unlimitedAccess || /professional|growth|agency|enterprise|pro/i.test(String(user.subscription || user.planName || user?.entitlements?.activePlan || "")));
    const leadId = btn.dataset.createWebsite;
    const lead = currentLeadResults.find((l) => String(l.id) === String(leadId))
      || currentFilteredLeadResults.find((l) => String(l.id) === String(leadId))
      || readLocalSavedLeads().find((l) => String(localLeadId(l)) === String(leadId) || String(l.id) === String(leadId));
    if (lead) {
      if (!lead.leadId) lead.leadId = makeLeadId();
      try { sessionStorage.setItem("mat_studio_lead", JSON.stringify(lead)); } catch {}
    }
    if (!pro) {
      window.location.href = "/pricing.html?upgrade=pro";
      return;
    }
    const name = btn.dataset.leadName || lead?.name || "Business";
    window.location.href = `/website-studio.html?leadId=${encodeURIComponent(leadId)}&business=${encodeURIComponent(name)}`;
  });
}

function initLeadActions() {
  document.addEventListener("click", async (event) => {
    const closerButton = event.target.closest("[data-open-deal-closer]");
    if (closerButton) {
      if (!requireAuth()) return;
      const leadId = closerButton.dataset.openDealCloser;
      const lead = currentLeadResults.find((item) => String(item.id) === String(leadId))
        || currentFilteredLeadResults.find((item) => String(item.id) === String(leadId))
        || readLocalSavedLeads().find((item) => String(localLeadId(item)) === String(leadId) || String(item.id) === String(leadId));
      if (lead) {
        try { sessionStorage.setItem("mat_deal_closer_lead", JSON.stringify(lead)); } catch {}
      }
      window.location.href = `/proposals.html?leadId=${encodeURIComponent(leadId)}`;
      return;
    }
    const button = event.target.closest("[data-save-lead]");
    if (!button) return;
    if (!requireAuth()) return;
    button.disabled = true;
    button.textContent = "Saving...";

    try {
      const lead = currentLeadResults.find((item) => item.id === button.dataset.saveLead);
      if (lead) {
        saveLeadsToLocalStorage([lead]);
        renderLocalSavedLeads();
      }
      await apiFetch(`/api/leads/${encodeURIComponent(button.dataset.saveLead)}/save`, {
        method: "POST",
        body: JSON.stringify({ lead })
      });
      button.textContent = "Saved";
    } catch (error) {
      button.textContent = error.message;
      button.disabled = false;
    }
  });
}

function initBulkLeadActions() {
  document.addEventListener("click", async (event) => {
    const exportButton = event.target.closest("[data-export-visible-leads]");
    const saveButton = event.target.closest("[data-save-visible-leads]");
    const exportSelectedButton = event.target.closest("[data-export-selected-leads]");
    const saveSelectedButton = event.target.closest("[data-save-selected-leads]");
    if (!exportButton && !saveButton && !exportSelectedButton && !saveSelectedButton) return;
    if (!requireAuth()) return;

    const note = byId("searchNote");
    const selectedLeads = selectedVisibleLeads();
    const actionLeads = (exportSelectedButton || saveSelectedButton) ? selectedLeads : currentFilteredLeadResults;
    if (!actionLeads.length) {
      if (note) note.textContent = "Run a search first, then save or export the visible leads.";
      return;
    }

    if (exportButton || exportSelectedButton) {
      downloadFile(`mat-leads-${new Date().toISOString().slice(0, 10)}.csv`, "text/csv", leadsCsv(actionLeads));
      if (note) note.textContent = `Exported ${actionLeads.length} ${exportSelectedButton ? "selected" : "filtered"} leads to CSV.`;
      return;
    }

    const activeButton = saveButton || saveSelectedButton;
    const original = activeButton.textContent;
    activeButton.disabled = true;
    activeButton.textContent = "Saving...";
    try {
      saveLeadsToLocalStorage(actionLeads);
      renderLocalSavedLeads();
      for (let index = 0; index < actionLeads.length; index += 10) {
        const batch = actionLeads.slice(index, index + 10);
        await Promise.all(batch.map((lead) => (
          apiFetch(`/api/leads/${encodeURIComponent(lead.id)}/save`, {
            method: "POST",
            body: JSON.stringify({ lead })
          })
        )));
      }
      if (note) note.textContent = `Saved ${actionLeads.length} ${saveSelectedButton ? "selected" : "filtered"} leads to CRM and local storage.`;
    } catch (error) {
      if (note) note.textContent = error.message;
    } finally {
      activeButton.disabled = false;
      activeButton.textContent = original;
    }
  });
}

function initLocalSavedLeadActions() {
  document.addEventListener("click", (event) => {
    const deleteButton = event.target.closest("[data-delete-local-lead]");
    const exportButton = event.target.closest("[data-export-local-leads]");
    const dedupeButton = event.target.closest("[data-dedupe-local-leads]");
    const clearButton = event.target.closest("[data-clear-local-leads]");
    if (!deleteButton && !exportButton && !dedupeButton && !clearButton) return;

    const note = byId("localSavedLeadSummary");
    const leads = readLocalSavedLeads();

    if (exportButton) {
      if (!leads.length) {
        if (note) note.textContent = "No local saved leads to export.";
        return;
      }
      const filtered = filteredLocalSavedLeads();
      downloadFile(`mat-local-saved-leads-${new Date().toISOString().slice(0, 10)}.csv`, "text/csv", leadsCsv(filtered));
      if (note) note.textContent = `Exported ${filtered.length} filtered local saved leads.`;
      return;
    }

    if (dedupeButton) {
      const cleaned = dedupeLeads(leads);
      writeLocalSavedLeads(cleaned);
      renderLocalSavedLeads();
      if (note) note.textContent = `Cleaned duplicates. ${cleaned.length} saved leads remain.`;
      return;
    }

    if (clearButton) {
      if (!leads.length) return;
      const confirmed = window.confirm("Delete all local saved leads from this browser?");
      if (!confirmed) return;
      writeLocalSavedLeads([]);
      renderLocalSavedLeads();
      return;
    }

    if (deleteButton) {
      deleteLocalSavedLead(deleteButton.dataset.deleteLocalLead);
      renderLocalSavedLeads();
      if (document.body.dataset.page === "lead-details") {
        const detail = byId("leadDetail");
        if (detail) detail.innerHTML = `<div class="empty-state">Local saved lead deleted from this browser.</div>`;
      }
    }
  });

  document.addEventListener("change", (event) => {
    const stage = event.target.closest("[data-local-stage]");
    const reminder = event.target.closest("[data-local-reminder]");
    if (stage) {
      updateLocalSavedLead(stage.dataset.localStage, { localStage: stage.value });
      renderLocalSavedLeads();
      return;
    }
    if (reminder) {
      updateLocalSavedLead(reminder.dataset.localReminder, { localReminderAt: reminder.value ? `${reminder.value}T09:00:00` : "" });
      renderLocalSavedLeads();
    }
  });

  document.addEventListener("focusout", (event) => {
    const campaign = event.target.closest("[data-local-campaign]");
    const notes = event.target.closest("[data-local-notes]");
    if (campaign) {
      updateLocalSavedLead(campaign.dataset.localCampaign, { localCampaign: campaign.value.trim() });
      renderLocalSavedLeads();
      return;
    }
    if (notes) {
      updateLocalSavedLead(notes.dataset.localNotes, { localNotes: notes.value.trim() });
      renderLocalSavedLeads();
    }
  });
}

function initLocalSavedLeadFilters() {
  ["localLeadSearch", "localLeadStageFilter", "localLeadDueFilter"].forEach((id) => {
    const field = byId(id);
    field?.addEventListener("input", renderLocalSavedLeads);
    field?.addEventListener("change", renderLocalSavedLeads);
  });
}

function initLeadDetails() {
  const target = byId("leadDetail");
  if (!target) return;
  if (!requireAuth()) return;
  const leadId = new URLSearchParams(window.location.search).get("id");

  if (!leadId) {
    target.innerHTML = `<div class="empty-state">Open a real lead from the dashboard search results to view website audit and AI analysis.</div>`;
    return;
  }

  target.innerHTML = `<div class="skeleton">Loading lead intelligence...</div>`;

  apiFetch(`/api/leads/${encodeURIComponent(leadId)}/report`)
    .then((result) => {
      activeLeadReport = result;
      const lead = result.lead;
      const dossier = result.dossier || {};
      const audit = lead.audit || {};
      const checks = audit.checks || {};
      const score = audit.score || lead.opportunityScore || 0;
      const websiteUrl = safeExternalUrl(lead.websiteUrl);
      const mapsUrl = safeExternalUrl(lead.googleMapsLink);
      const socialLinks = socialLinksFromLead(lead);
      const socialUrl = firstSocialUrl(lead);
      const whatsapp = whatsappActionFromLead(lead);
      const rawSnapshot = dossier.source?.rawTags || lead.raw || {};
      const brief = websiteBrief(result);
      target.innerHTML = `
        <section class="panel">
          <div class="lead-card__top">
            <div>
              <h2>${escapeHtml(lead.name)}</h2>
              <p>${escapeHtml(lead.businessType || lead.category || "Local business")} - ${escapeHtml(lead.address || "Address unavailable")}</p>
            </div>
            <span class="score-pill ${scoreClass(score)}">${score}/100</span>
          </div>
          <div class="lead-meta" style="margin-top:14px;">
            <span class="tag">${escapeHtml(lead.source || "map data")}</span>
            <span class="tag">${lead.websiteUrl ? "Website found" : "Website missing"}</span>
            <span class="tag">${lead.phone ? "Phone found" : "Phone missing"}</span>
            <span class="tag">${lead.email ? "Email found" : "Email missing"}</span>
            ${socialUrl ? `<span class="tag success">Social found</span>` : ""}
            ${whatsapp ? `<span class="tag success">${escapeHtml(whatsapp.status)}</span>` : ""}
          </div>
          ${renderLeadStrength(lead)}
          <div class="lead-actions" style="margin-top:16px;">
            ${websiteUrl ? `<a class="btn btn-secondary" href="${websiteUrl}" target="_blank" rel="noreferrer">Website</a>` : ""}
            ${mapsUrl ? `<a class="btn btn-secondary" href="${mapsUrl}" target="_blank" rel="noreferrer">Maps</a>` : ""}
            ${renderWhatsappButton(lead, "btn btn-secondary")}
            ${socialUrl ? `<a class="btn btn-secondary" href="${socialUrl}" target="_blank" rel="noreferrer">Social</a>` : ""}
            <button class="btn btn-secondary" type="button" data-copy-dossier>Copy All Data</button>
            <button class="btn btn-primary" type="button" data-copy-brief>Copy Website Brief</button>
            <button class="btn btn-secondary" type="button" data-download-json>JSON</button>
            <button class="btn btn-secondary" type="button" data-download-csv>CSV</button>
            <a class="btn btn-primary" href="/outreach.html?leadId=${encodeURIComponent(lead.id)}">Open Outreach Studio</a>
            <a class="btn btn-secondary" href="/website-studio.html?leadId=${encodeURIComponent(lead.id)}&business=${encodeURIComponent(lead.name || "")}">Build Website</a>
            <button class="btn btn-secondary" type="button" data-detail-refresh>Refresh data</button>
          </div>
          <h2 style="margin-top:20px;">Verified Contact Actions</h2>
          ${renderContactActions(lead)}
        </section>

        <section class="panel lead-detail-controls">
          <div class="section-header compact-header">
            <div>
              <h2>Pipeline control</h2>
              <p>Update the CRM stage and record a verified note without leaving this lead.</p>
            </div>
            <span id="detailSaveStatus" class="muted-value" role="status" aria-live="polite">Changes save to your CRM.</span>
          </div>
          <div class="form-grid compact">
            <div class="field">
              <label for="detailStage">Pipeline stage</label>
              <select id="detailStage" data-detail-stage>
                ${["New", "Contacted", "Follow Up", "Proposal Sent", "Meeting Scheduled", "Negotiation", "Won", "Lost"].map((stage) => `<option value="${stage}" ${String(lead.stage || "New") === stage ? "selected" : ""}>${stage}</option>`).join("")}
              </select>
            </div>
            <form class="field" data-detail-note-form>
              <label for="detailNote">Add CRM note</label>
              <div class="inline-form"><input id="detailNote" name="note" maxlength="1000" placeholder="Next step, objection, or client context"><button class="btn btn-secondary" type="submit">Save note</button></div>
            </form>
          </div>
        </section>

        <section class="panel" style="grid-column:1 / -1;">
          <h2>Copy-Ready Website Build Brief</h2>
          <p>Use this directly to build the website, write outreach, or brief a designer.</p>
          <pre class="copy-brief">${escapeHtml(brief)}</pre>
        </section>

        ${renderRevenueEngine(result)}

        <section class="panel">
          <h2>Owner / Decision Maker</h2>
          <div class="audit-list">
            ${renderExpectedRows(dossier.ownerContact, [
              ["ownerName", "Owner name"],
              ["operator", "Operator / company"],
              ["contactPerson", "Contact person / manager"],
              ["contactRole", "Contact role"],
              ["publicContactNote", "Public source note"]
            ])}
          </div>
          <h2 style="margin-top:20px;">Owner / Contact Finder Links</h2>
          <div class="audit-list">
            ${renderRows(dossier.verificationLinks, { empty: "No verification links could be generated." })}
          </div>
        </section>

        <section class="panel">
          <h2>Contact Details</h2>
          <div class="audit-list">
            ${renderExpectedRows(dossier.contact, [
              ["phone", "Phone"],
              ["mobile", "Mobile"],
              ["email", "Email"],
              ["website", "Website", "website"],
              ["fax", "Fax"]
            ])}
            ${renderWhatsappContact(lead)}
          </div>
          <h2 style="margin-top:20px;">Online Presence</h2>
          <div class="audit-list">
            ${renderRows(dossier.onlinePresence, { empty: "No online presence details found yet." })}
          </div>
        </section>

        <section class="panel">
          <h2>Website Discovery</h2>
          <p>Public contact and social data extracted from the business website when available.</p>
          <div class="audit-list">
            ${renderRows(dossier.websiteDiscovery, { empty: "No website discovery data found yet." })}
          </div>
          <h2 style="margin-top:20px;">Social Finder Links</h2>
          <div class="audit-list">
            ${renderRows({
              facebookSearch: dossier.verificationLinks?.facebookSearch,
              instagramSearch: dossier.verificationLinks?.instagramSearch,
              linkedinSearch: dossier.verificationLinks?.linkedinSearch,
              tiktokSearch: dossier.verificationLinks?.tiktokSearch,
              youtubeSearch: dossier.verificationLinks?.youtubeSearch,
              xSearch: dossier.verificationLinks?.xSearch,
              whatsappContact: dossier.verificationLinks?.whatsappContact
            }, { empty: "No social finder links available." })}
          </div>
        </section>

        <section class="panel">
          <h2>Business Details</h2>
          <div class="audit-list">
            ${renderRows(dossier.business, { empty: "No business profile details found yet." })}
          </div>
          <h2 style="margin-top:20px;">Operations</h2>
          <div class="audit-list">
            ${renderRows(dossier.operations, { empty: "No operations data found yet." })}
          </div>
        </section>

        <section class="panel">
          <h2>Location</h2>
          <div class="audit-list">
            ${renderRows(dossier.location, { empty: "No location details found yet." })}
          </div>
          <h2 style="margin-top:20px;">Social Links</h2>
          <div class="audit-list">
            ${renderSocialLinks({ ...dossier.social, ...socialLinks }, "No social links found yet.")}
          </div>
        </section>

        <section class="panel">
          <h2>Website Audit</h2>
          <div class="audit-list">
            ${Object.entries(checks).map(([key, value]) => `
              <div class="audit-item">
                <span>${escapeHtml(key.replace(/([A-Z])/g, " $1").trim())}</span>
                <span class="status-pill ${value ? "success" : "warning"}">${value ? "Found" : "Missing"}</span>
              </div>
            `).join("")}
          </div>
          <h2 style="margin-top:20px;">Sales Use</h2>
          <div class="audit-list">
            ${renderRows(dossier.salesUse, { empty: "No sales-use guidance available yet." })}
          </div>
        </section>

        <section class="panel">
          <h2>AI Opportunity</h2>
          <p>${result.aiSummary || "Ready for NVIDIA-powered analysis."}</p>
          <div class="lead-actions">
            <button class="btn btn-primary" type="button" data-ai-analyze="${lead.id}">Analyze</button>
            <button class="btn btn-secondary" type="button" data-ai-outreach="${lead.id}">Write Outreach</button>
          </div>
          <div id="aiOutput" class="notice" style="margin-top:12px;">Ready</div>
        </section>

        <section class="panel" style="grid-column:1 / -1;">
          <h2>Provider Source Data</h2>
          <p>Raw public map/source fields captured for website builds, outreach, and verification.</p>
          <pre class="code-block">${escapeHtml(JSON.stringify(rawSnapshot, null, 2))}</pre>
        </section>
      `;
    })
    .catch((error) => {
      const localLead = findLocalSavedLead(leadId);
      if (localLead) {
        renderLocalLeadDetail(target, localLead);
        return;
      }
      target.innerHTML = `<div class="error-state">${error.message}</div>`;
    });
}

function findLeadForAction(id) {
  const requested = String(id || "");
  return currentLeadResults.find((lead) => String(lead.id) === requested || localLeadId(lead) === requested)
    || findLocalSavedLead(requested)
    || (activeLeadReport?.lead && (String(activeLeadReport.lead.id) === requested || localLeadId(activeLeadReport.lead) === requested) ? activeLeadReport.lead : null);
}

function initOutreachActions() {
  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-copy-outreach]");
    if (!button) return;
    const lead = findLeadForAction(button.dataset.copyOutreach);
    if (!lead) return;

    const original = button.textContent;
    const channel = button.dataset.outreachChannel || "email";
    const message = outreachMessage(lead, channel);
    await navigator.clipboard.writeText(message);
    button.textContent = "Copied";
    setTimeout(() => {
      button.textContent = original;
    }, 1400);
  });
}

function initLeadDetailControls() {
  document.addEventListener("change", async (event) => {
    const stage = event.target.closest("[data-detail-stage]");
    if (!stage || !activeLeadReport?.lead?.id) return;
    const status = byId("detailSaveStatus");
    stage.disabled = true;
    if (status) status.textContent = "Saving stage...";
    try {
      const result = await apiFetch(`/api/crm/leads/${encodeURIComponent(activeLeadReport.lead.id)}/stage`, {
        method: "PATCH",
        body: JSON.stringify({ stage: stage.value })
      });
      activeLeadReport.lead.stage = result.lead?.stage || stage.value;
      if (status) status.textContent = `Saved as ${activeLeadReport.lead.stage}.`;
    } catch (error) {
      if (status) status.textContent = error.message || "Stage could not be saved.";
    } finally {
      stage.disabled = false;
    }
  });

  document.addEventListener("submit", async (event) => {
    const form = event.target.closest("[data-detail-note-form]");
    if (!form || !activeLeadReport?.lead?.id) return;
    event.preventDefault();
    const input = form.querySelector("[name=note]");
    const note = String(input?.value || "").trim();
    const status = byId("detailSaveStatus");
    if (!note) {
      if (status) status.textContent = "Write a note before saving.";
      input?.focus();
      return;
    }
    const button = form.querySelector("button[type=submit]");
    if (button) button.disabled = true;
    if (status) status.textContent = "Saving note...";
    try {
      await apiFetch(`/api/crm/leads/${encodeURIComponent(activeLeadReport.lead.id)}/notes`, {
        method: "POST",
        body: JSON.stringify({ note, tags: ["lead-details"] })
      });
      if (input) input.value = "";
      if (status) status.textContent = "Note saved to CRM activity.";
    } catch (error) {
      if (status) status.textContent = error.message || "Note could not be saved.";
    } finally {
      if (button) button.disabled = false;
    }
  });

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-detail-refresh]")) window.location.reload();
  });
}

function initAiButtons() {
  document.addEventListener("click", async (event) => {
    const analyze = event.target.closest("[data-ai-analyze]");
    const outreach = event.target.closest("[data-ai-outreach]");
    if (!analyze && !outreach) return;
    if (!requireAuth()) return;

    const output = byId("aiOutput");
    const button = analyze || outreach;
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "Running...";
    if (output) output.textContent = "Loading analysis...";

    try {
      const endpoint = analyze ? "/api/ai/analyze" : "/api/ai/outreach";
      const result = await apiFetch(endpoint, {
        method: "POST",
        body: JSON.stringify({ leadId: (analyze || outreach).dataset.aiAnalyze || (analyze || outreach).dataset.aiOutreach })
      });
      if (output) output.textContent = result.content || result.message || "Complete";
    } catch (error) {
      if (output) output.textContent = error.message;
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  });
}

function initLeadDossierActions() {
  document.addEventListener("click", async (event) => {
    const copy = event.target.closest("[data-copy-dossier]");
    const copyBrief = event.target.closest("[data-copy-brief]");
    const copyAsset = event.target.closest("[data-copy-report-asset]");
    const json = event.target.closest("[data-download-json]");
    const csv = event.target.closest("[data-download-csv]");
    if (!copy && !copyBrief && !copyAsset && !json && !csv) return;

    const report = activeLeadReport;
    if (!report) return;
    const leadName = String(report.lead?.name || "lead").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "lead";

    if (copy) {
      const original = copy.textContent;
      await navigator.clipboard.writeText(JSON.stringify(report.dossier || report.lead, null, 2));
      copy.textContent = "Copied";
      setTimeout(() => {
        copy.textContent = original;
      }, 1400);
    }

    if (copyBrief) {
      const original = copyBrief.textContent;
      await navigator.clipboard.writeText(websiteBrief(report));
      copyBrief.textContent = "Brief Copied";
      setTimeout(() => {
        copyBrief.textContent = original;
      }, 1400);
    }

    if (copyAsset) {
      const original = copyAsset.textContent;
      await navigator.clipboard.writeText(reportAssetText(report, copyAsset.dataset.copyReportAsset));
      copyAsset.textContent = "Copied";
      setTimeout(() => {
        copyAsset.textContent = original;
      }, 1400);
    }

    if (json) {
      downloadFile(`${leadName}-dossier.json`, "application/json", JSON.stringify(report, null, 2));
    }

    if (csv) {
      downloadFile(`${leadName}-dossier.csv`, "text/csv", dossierCsv(report));
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  populateCountries();
  populateBusinessTypes();
  initNichePacks();
  initMapLinkPreview();
  initLeadCommandCenter();
  initLeadSearch();
  initLeadActions();
  initWebsiteStudioActions();
  initBulkLeadActions();
  initLocalSavedLeadActions();
  initLocalSavedLeadFilters();
  backfillLocalLeadIds();
  renderLocalSavedLeads();
  initLeadDetails();
  initLeadDetailControls();
  initOutreachActions();
  initAiButtons();
  initLeadDossierActions();
});
