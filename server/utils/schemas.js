import { paidPlanKeys } from "../config/plans.js";

function validationError(fieldErrors) {
  const error = new Error("Validation failed");
  error.fieldErrors = fieldErrors;
  return error;
}

function schema(validator) {
  return {
    safeParse(input) {
      try {
        return { success: true, data: validator(input || {}) };
      } catch (error) {
        return {
          success: false,
          error: {
            flatten: () => ({ fieldErrors: error.fieldErrors || { form: [error.message] } })
          }
        };
      }
    }
  };
}

function stringField(input, field, options = {}) {
  const value = input[field] === undefined || input[field] === null ? "" : String(input[field]).trim();
  const errors = [];

  if (options.required && !value) errors.push("Required");
  if (options.min && value.length < options.min) errors.push(`Must be at least ${options.min} characters`);
  if (options.max && value.length > options.max && !options.truncate) errors.push(`Must be at most ${options.max} characters`);
  if (options.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) errors.push("Must be a valid email");

  if (errors.length) throw validationError({ [field]: errors });
  const normalized = options.max && options.truncate ? value.slice(0, options.max) : value;
  return normalized || options.default || "";
}

function urlField(input, field, options = {}) {
  const value = stringField(input, field, { max: options.max || 2000, truncate: false });
  if (!value) return "";
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('protocol');
  } catch {
    throw validationError({ [field]: ["Must be a valid http(s) URL"] });
  }
  return value;
}

function safeImageUrl(value) {
  const raw = String(value || "").trim().slice(0, 2000);
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    return ["http:", "https:"].includes(parsed.protocol) ? raw : "";
  } catch {
    return "";
  }
}

function dateOnlyField(input, field) {
  const value = stringField(input, field, { max: 10, truncate: false });
  if (!value) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw validationError({ [field]: ["Must use YYYY-MM-DD"] });
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw validationError({ [field]: ["Must be a real calendar date"] });
  }
  return value;
}

function stringListField(input, field, options = {}) {
  const raw = input[field];
  let values = [];
  if (Array.isArray(raw)) {
    values = raw;
  } else if (typeof raw === "string") {
    // Browsers send multi-selects as comma strings; dashboard also sends arrays.
    values = raw.split(/[,;\n|]/);
  } else if (raw !== undefined && raw !== null && raw !== "") {
    values = [String(raw)];
  }
  const cleaned = [...new Set(values
    .map((value) => String(value || "").trim())
    .filter(Boolean))]
    .slice(0, options.maxItems || 20);

  for (const value of cleaned) {
    if (options.max && value.length > options.max) {
      throw validationError({ [field]: [`Each value must be at most ${options.max} characters`] });
    }
  }

  return cleaned;
}

function numberField(input, field, options = {}) {
  const value = input[field] === undefined || input[field] === "" ? options.default : Number(input[field]);
  if (!Number.isFinite(value)) {
    if (options.defaultOnInvalid) return options.default;
    throw validationError({ [field]: ["Must be a number"] });
  }
  const normalized = options.int ? Math.round(value) : value;
  if (options.min !== undefined && normalized < options.min) {
    if (options.clamp) return options.min;
    throw validationError({ [field]: [`Must be at least ${options.min}`] });
  }
  if (options.max !== undefined && normalized > options.max) {
    if (options.clamp) return options.max;
    throw validationError({ [field]: [`Must be at most ${options.max}`] });
  }
  return normalized;
}

function booleanField(input, field, options = {}) {
  const value = input[field];
  if (value === undefined || value === null || value === "") return Boolean(options.default);
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  const normalized = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return Boolean(options.default);
}

function optionalCoordinate(input, field, min, max) {
  if (input[field] === undefined || input[field] === "") return null;
  const value = Number(input[field]);
  if (!Number.isFinite(value) || value < min || value > max) {
    throw validationError({ [field]: [`Must be between ${min} and ${max}`] });
  }
  return value;
}

function enumField(input, field, allowed, options = {}) {
  const value = input[field] || options.default;
  if (!allowed.includes(value)) throw validationError({ [field]: [`Must be one of: ${allowed.join(", ")}`] });
  return value;
}

export const authSchemas = {
  register: schema((input) => ({
    name: stringField(input, "name", { required: true, min: 2, max: 120 }),
    email: stringField(input, "email", { required: true, email: true, max: 255 }).toLowerCase(),
    password: stringField(input, "password", { required: true, min: 8, max: 128 }),
    ref: stringField(input, "ref", { max: 40, truncate: true })
  })),
  verifyEmail: schema((input) => ({
    token: stringField(input, "token", { required: true, min: 10, max: 200 })
  })),
  resendVerification: schema((input) => ({
    email: stringField(input, "email", { required: true, email: true, max: 255 }).toLowerCase()
  })),
  login: schema((input) => ({
    email: stringField(input, "email", { required: true, email: true, max: 255 }).toLowerCase(),
    password: stringField(input, "password", { required: true, min: 8, max: 128 })
  })),
  refresh: schema((input) => ({
    refreshToken: stringField(input, "refreshToken", { required: true, min: 20, max: 4000 })
  })),
  firebaseSession: schema((input) => {
    const idToken = stringField(input, "idToken", { required: true, min: 10, max: 8000 });
    const name = stringField(input, "name", { max: 120, truncate: true });
    const password = stringField(input, "password", { max: 128 });
    if (password && password.length < 8) {
      throw validationError({ password: ["Must be at least 8 characters"] });
    }
    return { idToken, name, password };
  })
};

export const profileSchema = schema((input) => ({
  name: stringField(input, "name", { required: true, min: 2, max: 120 }),
  company: stringField(input, "company", { max: 160, truncate: true }),
  signature: stringField(input, "signature", { max: 1000, truncate: true })
}));

export const settingsSchema = schema((input) => ({
  leadAlerts: booleanField(input, "leadAlerts", { default: true }),
  weeklyDigest: booleanField(input, "weeklyDigest", { default: true }),
  emailNotifications: booleanField(input, "emailNotifications", { default: true }),
  smsNotifications: booleanField(input, "smsNotifications", { default: false }),
  browserNotifications: booleanField(input, "browserNotifications", { default: true }),
  defaultCountry: stringField(input, "defaultCountry", { max: 80, truncate: true, default: "United States" }),
  defaultResults: numberField(input, "defaultResults", { int: true, min: 5, max: 200, default: 20, defaultOnInvalid: true, clamp: true }),
  defaultRadius: numberField(input, "defaultRadius", { int: true, min: 500, max: 50000, default: 15000, defaultOnInvalid: true, clamp: true }),
  defaultSearchDepth: stringField(input, "defaultSearchDepth", { max: 20, truncate: true, default: "deep" }),
  defaultSortBy: stringField(input, "defaultSortBy", { max: 30, truncate: true, default: "opportunity" }),
  defaultLeadQuality: stringField(input, "defaultLeadQuality", { max: 30, truncate: true, default: "all" }),
  brandName: stringField(input, "brandName", { max: 120, truncate: true, default: "MAT Leads AI Pro X" }),
  bookingUrl: stringField(input, "bookingUrl", { max: 400, truncate: true }),
  primaryOffer: stringField(input, "primaryOffer", { max: 180, truncate: true, default: "Website + local lead growth audit" }),
  proposalPrice: numberField(input, "proposalPrice", { int: true, min: 0, max: 100000, default: 2500, defaultOnInvalid: true, clamp: true }),
  followUpCadence: stringField(input, "followUpCadence", { max: 120, truncate: true, default: "Day 1, Day 3, Day 7" }),
  noWebsiteWeight: numberField(input, "noWebsiteWeight", { int: true, min: 0, max: 100, default: 50, defaultOnInvalid: true, clamp: true }),
  poorMobileWeight: numberField(input, "poorMobileWeight", { int: true, min: 0, max: 100, default: 20, defaultOnInvalid: true, clamp: true }),
  weakSeoWeight: numberField(input, "weakSeoWeight", { int: true, min: 0, max: 100, default: 20, defaultOnInvalid: true, clamp: true }),
  noSslWeight: numberField(input, "noSslWeight", { int: true, min: 0, max: 100, default: 10, defaultOnInvalid: true, clamp: true }),
  socialPresenceWeight: numberField(input, "socialPresenceWeight", { int: true, min: 0, max: 100, default: 15, defaultOnInvalid: true, clamp: true }),
  lowReviewWeight: numberField(input, "lowReviewWeight", { int: true, min: 0, max: 100, default: 10, defaultOnInvalid: true, clamp: true }),
  senderName: stringField(input, "senderName", { max: 120, truncate: true }),
  replyToEmail: stringField(input, "replyToEmail", { max: 255, truncate: true }),
  bccEmail: stringField(input, "bccEmail", { max: 255, truncate: true }),
  emailSignature: stringField(input, "emailSignature", { max: 1000, truncate: true }),
  exportFormat: stringField(input, "exportFormat", { max: 10, truncate: true, default: "csv" }),
  dateFormat: stringField(input, "dateFormat", { max: 20, truncate: true, default: "MM/DD/YYYY" }),
  timezone: stringField(input, "timezone", { max: 60, truncate: true, default: "America/Los_Angeles" }),
  exportHeaders: booleanField(input, "exportHeaders", { default: true }),
  autoExport: booleanField(input, "autoExport", { default: false }),
  aiModel: stringField(input, "aiModel", { max: 60, truncate: true, default: "z-ai/glm-5.3-flash" }),
  outreachTone: stringField(input, "outreachTone", { max: 30, truncate: true, default: "professional" }),
  maxFollowUps: numberField(input, "maxFollowUps", { int: true, min: 0, max: 20, default: 3, defaultOnInvalid: true, clamp: true }),
  autoFollowUp: booleanField(input, "autoFollowUp", { default: false }),
  aiSuggestions: booleanField(input, "aiSuggestions", { default: true }),
  autoScore: booleanField(input, "autoScore", { default: true })
}));

export const leadSearchSchema = schema((input) => {
  const mapLink = stringField(input, "mapLink", { max: 4000, truncate: true });
  const latitude = optionalCoordinate(input, "latitude", -90, 90);
  const longitude = optionalCoordinate(input, "longitude", -180, 180);
  const hasMapLocation = Boolean(mapLink || (latitude !== null && longitude !== null));
  const country = stringField(input, "country", { max: 80 });
  const countries = stringListField(input, "countries", { max: 80, maxItems: 12 });
  // Live dashboard sends both country + countries; merge them leniently so a 400 never blocks scanning.
  const merged = [...new Set([...(Array.isArray(countries) ? countries : []), ...(country ? String(country).split(/[,;\n|]/) : [])].map((v) => String(v || "").trim()).filter(Boolean))];
  const selectedCountries = merged.length ? merged : (hasMapLocation ? [] : ["Germany"]);
  const normalizedCountries = selectedCountries.length || hasMapLocation ? selectedCountries : ["Germany"];

  return {
    country: normalizedCountries[0] || "",
    countries: normalizedCountries,
    state: stringField(input, "state", { max: 80, truncate: true }),
    city: stringField(input, "city", { max: 80, truncate: true }),
    zip: stringField(input, "zip", { max: 24, truncate: true }),
    industry: stringField(input, "industry", { max: 240, truncate: true }),
    keyword: stringField(input, "keyword", { max: 240, truncate: true }),
    businessTypes: stringListField(input, "businessTypes", { max: 80, maxItems: 20 }),
    mapLink,
    latitude,
    longitude,
    radiusMeters: numberField(input, "radiusMeters", { int: true, min: 500, max: 50000, default: 15000, defaultOnInvalid: true, clamp: true }),
    limit: numberField(input, "limit", { int: true, min: 1, max: 200, default: 20, defaultOnInvalid: true, clamp: true }),
    searchDepth: enumField(input, "searchDepth", ["quick", "standard", "deep", "maximum"], { default: "deep" }),
    leadQuality: enumField(input, "leadQuality", ["all", "contact_ready", "needs_website", "high_opportunity", "owner_data"], { default: "all" }),
    sortBy: enumField(input, "sortBy", ["opportunity", "contact", "website_missing", "name"], { default: "opportunity" }),
    minOpportunityScore: numberField(input, "minOpportunityScore", { int: true, min: 0, max: 100, default: 0, defaultOnInvalid: true, clamp: true }),
    requireContact: booleanField(input, "requireContact", { default: false }),
    missingWebsiteOnly: booleanField(input, "missingWebsiteOnly", { default: false }),
    bypassCache: booleanField(input, "bypassCache", { default: false }),
    refreshSeed: stringField(input, "refreshSeed", { max: 80, truncate: true })
  };
});

const stages = ["New", "Contacted", "Follow Up", "Proposal Sent", "Meeting Scheduled", "Negotiation", "Won", "Lost"];

export const crmSchemas = {
  stage: schema((input) => ({
    stage: enumField(input, "stage", stages)
  })),
  note: schema((input) => {
    const rawTags = Array.isArray(input.tags) ? input.tags : [];
    const tags = rawTags.map((tag) => String(tag).trim()).filter(Boolean).slice(0, 12);
    return {
      note: stringField(input, "note", { required: true, min: 1, max: 4000 }),
      tags
    };
  }),
  outreachActivity: schema((input) => ({
    channel: enumField(input, "channel", ["email", "whatsapp", "phone", "other"], { default: "email" }),
    type: stringField(input, "type", { max: 80, truncate: true, default: "outreach" }),
    message: stringField(input, "message", { max: 5000, truncate: true }),
    outcome: stringField(input, "outcome", { max: 120, truncate: true, default: "drafted" }),
    nextActionAt: stringField(input, "nextActionAt", { max: 40, truncate: true })
  }))
};

export const savedSearchSchemas = {
  create: schema((input) => {
    const name = stringField(input, "name", { required: true, min: 1, max: 100 });
    const config = input.config && typeof input.config === "object" && !Array.isArray(input.config) ? input.config : {};
    if (JSON.stringify(config).length > 10000) throw validationError({ config: ["Search configuration is too large"] });
    return { name, config };
  }),
  run: schema((input) => ({ id: stringField(input, "id", { required: true, min: 1, max: 100 }) }))
};

export const socialSchemas = {
  userSearch: schema((input) => ({
    q: stringField(input, "q", { required: true, min: 2, max: 120, truncate: true })
  })),
  friendRequest: schema((input) => ({
    userId: stringField(input, "userId", { required: true, min: 1, max: 160, truncate: true })
  })),
  requestResponse: schema((input) => ({
    action: enumField(input, "action", ["accept", "decline"])
  })),
  message: schema((input) => ({
    text: stringField(input, "text", { required: true, min: 1, max: 4000 })
  })),
  messageEdit: schema((input) => ({
    text: stringField(input, "text", { required: true, min: 1, max: 4000 })
  })),
  reaction: schema((input) => ({
    emoji: enumField(input, "emoji", ["👍", "❤️", "🎉", "👀"])
  })),
  report: schema((input) => ({
    category: enumField(input, "category", ["spam", "abuse", "impersonation", "other"], { default: "other" }),
    description: stringField(input, "description", { max: 1000, truncate: true })
  }))
};

const outreachTypes = ["cold_email", "follow_up", "website_redesign", "seo", "marketing", "ai_automation", "business_audit"];

export const aiSchemas = {
  chat: schema((input) => ({
    prompt: stringField(input, "prompt", { required: true, min: 1, max: 4000 })
  })),
  agent: schema((input) => ({
    prompt: stringField(input, "prompt", { required: true, min: 1, max: 2200 })
  })),
  analyze: schema((input) => ({
    leadId: stringField(input, "leadId", { required: true, min: 1, max: 160 })
  })),
  outreach: schema((input) => ({
    leadId: stringField(input, "leadId", { required: true, min: 1, max: 160 }),
    type: enumField(input, "type", outreachTypes, { default: "cold_email" })
  })),
  proposal: schema((input) => ({
    leadId: stringField(input, "leadId", { required: true, min: 1, max: 160 }),
    offerKey: stringField(input, "offerKey", { max: 80, truncate: true })
  })),
  tycoon: schema((input) => ({
    prompt: stringField(input, "prompt", { required: true, min: 1, max: 4000 }),
    leadId: stringField(input, "leadId", { max: 160, truncate: true }),
    lead: input.lead && typeof input.lead === "object" ? input.lead : {}
  })),
  websiteBuild: schema((input) => ({
    leadId: stringField(input, "leadId", { max: 160, truncate: true }),
    lead: input.lead && typeof input.lead === "object" ? input.lead : {},
    businessName: stringField(input, "businessName", { max: 160, truncate: true }),
    style: stringField(input, "style", { max: 80, truncate: true }),
    palette: stringField(input, "palette", { max: 80, truncate: true }),
    pages: numberField(input, "pages", { int: true, min: 1, max: 4, clamp: true, default: 1 }),
    design: stringField(input, "design", { max: 40, truncate: true }),
    tone: stringField(input, "tone", { max: 40, truncate: true }),
    targetAudience: stringField(input, "targetAudience", { max: 400, truncate: true }),
    primaryGoal: enumField(input, "primaryGoal", ["calls", "bookings", "quotes", "sales", "brand", "enquiries"], { default: "enquiries" }),
    location: stringField(input, "location", { max: 160, truncate: true }),
    services: stringField(input, "services", { max: 1200, truncate: true }),
    cta: stringField(input, "cta", { max: 160, truncate: true }),
    about: stringField(input, "about", { max: 1200, truncate: true }),
    language: stringField(input, "language", { max: 40, truncate: true }),
    followBrief: booleanField(input, "followBrief", { default: true }),
    images: input.images && typeof input.images === "object" ? { hero: safeImageUrl(input.images.hero), gallery: Array.isArray(input.images.gallery) ? input.images.gallery.map((g) => safeImageUrl(g)).filter(Boolean).slice(0, 6) : [] } : { hero: "", gallery: [] }
  })),
  websiteRefine: schema((input) => ({
    websiteId: stringField(input, "websiteId", { required: true, min: 1, max: 160 }),
    instruction: stringField(input, "instruction", { required: true, min: 1, max: 2000 })
  })),
  websiteHtml: schema((input) => ({
    html: stringField(input, "html", { required: true, min: 100, max: 500000 })
  }))
};

export const gigSchemas = {
  create: schema((input) => ({
    title: stringField(input, "title", { required: true, min: 3, max: 160 }),
    payUsd: numberField(input, "payUsd", { min: 5, max: 100000, defaultOnInvalid: false }),
    level: stringField(input, "level", { max: 40, truncate: true }),
    description: stringField(input, "description", { max: 1000, truncate: true })
  }))
};

export const earnSchemas = {
  invoice: schema((input) => ({
    leadId: stringField(input, "leadId", { max: 160, truncate: true }),
    leadName: stringField(input, "leadName", { max: 160, truncate: true }),
    offerKey: stringField(input, "offerKey", { max: 80, truncate: true }),
    amountUsd: numberField(input, "amountUsd", { min: 1, max: 100000, defaultOnInvalid: false }),
    clientName: stringField(input, "clientName", { max: 160, truncate: true }),
    clientEmail: stringField(input, "clientEmail", { max: 255, truncate: true }),
    notes: stringField(input, "notes", { max: 1000, truncate: true }),
    dueDate: dateOnlyField(input, "dueDate"),
    paymentUrl: urlField(input, "paymentUrl", { max: 2000 }),
    paymentInstructions: stringField(input, "paymentInstructions", { max: 1200, truncate: true })
  })),
  payout: schema((input) => ({
    amountUsd: numberField(input, "amountUsd", { min: 10, max: 100000, defaultOnInvalid: false }),
    destination: stringField(input, "destination", { max: 200, truncate: true })
  })),
  invoicePaid: schema((input) => ({
    transactionId: stringField(input, "transactionId", { max: 220, truncate: true })
  }))
};

export const billingSchema = schema((input) => ({
  plan: enumField(input, "plan", paidPlanKeys)
}));

export const paypalConfirmationSchema = schema((input) => ({
  plan: enumField(input, "plan", paidPlanKeys),
  sessionId: stringField(input, "sessionId", { required: true, min: 8, max: 160 }),
  paypalToken: stringField(input, "paypalToken", { max: 220, truncate: true }),
  payerId: stringField(input, "payerId", { max: 220, truncate: true }),
  transactionId: stringField(input, "transactionId", { max: 220, truncate: true })
}));
