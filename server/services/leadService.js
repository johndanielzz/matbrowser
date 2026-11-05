import { FirestoreRepository } from "../repositories/firestoreRepository.js";
import { env } from "../config/env.js";
import { getPlan } from "../config/plans.js";
import { GooglePlacesService } from "./googlePlacesService.js";
import { WebsiteAuditService } from "./websiteAuditService.js";
import { AppError } from "../utils/errors.js";
import { isAdminUser } from "../utils/entitlements.js";

const searchCache = new Map();
const SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_SEARCH_CACHE_ENTRIES = 80;
// Keep a margin below Vercel's 60-second ceiling for normalization,
// authorization, persistence and the JSON response after external providers.
const INTERACTIVE_PROVIDER_TIMEOUT_MS = 45000;
const HISTORY_ASSISTED_PROVIDER_TIMEOUT_MS = 14000;
const MAX_INLINE_AUDITS = 24;
const INLINE_AUDIT_CONCURRENCY = 4;
const SEARCH_ENGINE_VERSION = "strict-coverage-v4";

function getCachedSearch(cacheKey) {
  const entry = searchCache.get(cacheKey);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    searchCache.delete(cacheKey);
    return null;
  }
  return entry.response;
}

function cacheSearch(cacheKey, response) {
  searchCache.set(cacheKey, { response, expiresAt: Date.now() + SEARCH_CACHE_TTL_MS });
  while (searchCache.size > MAX_SEARCH_CACHE_ENTRIES) {
    const oldestKey = searchCache.keys().next().value;
    if (!oldestKey) break;
    searchCache.delete(oldestKey);
  }
}

function isTemporaryProviderFailure(error) {
  if (error?.code === "LEAD_SEARCH_TIMEOUT") return true;
  if (Number(error?.status || 0) >= 500) return true;
  return /^(OVERPASS|LEAD_PROVIDER|GOOGLE_PLACES|OPENSTREETMAP)_/i.test(String(error?.code || ""));
}

function hashString(value) {
  let hash = 2166136261;
  for (const character of String(value || "")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function withTimeout(promise, timeoutMs, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new AppError(message, 503, "LEAD_SEARCH_TIMEOUT")), timeoutMs);
    })
  ]).finally(() => clearTimeout(timer));
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index]);
    }
  }));
  return results;
}

function compactObject(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => {
    if (value === undefined || value === null || value === "") return false;
    if (Array.isArray(value) && value.length === 0) return false;
    if (typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0) return false;
    return true;
  }));
}

const crmStages = new Set(["New", "Contacted", "Follow Up", "Proposal Sent", "Meeting Scheduled", "Negotiation", "Won", "Lost"]);

function importedString(value, max = 240) {
  return String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .trim()
    .slice(0, max);
}

function importedHttpUrl(value, max = 2000) {
  const raw = importedString(value, max);
  if (!raw) return "";
  try {
    const parsed = new URL(raw);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : "";
  } catch {
    return "";
  }
}

function importedCoordinate(value, min, max) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : undefined;
}

function importedScore(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(100, Math.max(0, Math.round(parsed))) : fallback;
}

function importedObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

/**
 * Browser-local saved leads pre-date the account CRM.  Import only the small,
 * display-safe business profile needed by the CRM; raw provider payloads and
 * arbitrary nested values must never become server-persisted data from a
 * browser request.
 */
function sanitizeImportedLead(input, expectedId) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const id = importedString(input.id, 200);
  if (!id || id !== String(expectedId || "")) return null;

  const details = importedObject(input.details);
  const contact = importedObject(details.contact);
  const location = importedObject(details.location);
  const business = importedObject(details.business);
  const socialInput = importedObject(details.social);
  const social = {};
  for (const [platform, value] of Object.entries(socialInput)) {
    const key = importedString(platform, 32).toLowerCase();
    const url = importedHttpUrl(value);
    if (key && url && Object.keys(social).length < 12) social[key] = url;
  }

  const phone = importedString(input.phone || contact.phone || contact.mobile, 120);
  const email = importedString(input.email || contact.email, 255);
  const websiteUrl = importedHttpUrl(input.websiteUrl || contact.website);
  const latitude = importedCoordinate(input.latitude ?? location.latitude, -90, 90);
  const longitude = importedCoordinate(input.longitude ?? location.longitude, -180, 180);
  const score = importedScore(input.opportunityScore ?? input.audit?.score);
  const stage = crmStages.has(input.localStage) ? input.localStage : crmStages.has(input.stage) ? input.stage : "New";

  return compactObject({
    id,
    name: importedString(input.name, 200) || "Unnamed business",
    category: importedString(input.category, 160),
    businessType: importedString(input.businessType, 160),
    industry: importedString(input.industry, 160),
    address: importedString(input.address || location.address, 400),
    city: importedString(input.city || location.city, 120),
    state: importedString(input.state, 120),
    zip: importedString(input.zip || location.postcode, 40),
    country: importedString(input.country || location.country, 120),
    countryCode: importedString(input.countryCode || location.countryCode, 8).toUpperCase(),
    phone,
    email,
    websiteUrl,
    googleMapsLink: importedHttpUrl(input.googleMapsLink || location.googleMapsLink),
    latitude,
    longitude,
    rating: Number.isFinite(Number(input.rating)) ? Math.max(0, Math.min(5, Number(input.rating))) : null,
    reviewsCount: Number.isFinite(Number(input.reviewsCount)) ? Math.max(0, Math.round(Number(input.reviewsCount))) : 0,
    openingHours: importedString(input.openingHours || details.operations?.openingHours, 1200),
    opportunityScore: score,
    opportunityCategory: importedString(input.opportunityCategory, 80),
    stage,
    source: "browser_local_import",
    details: compactObject({
      contact: compactObject({ phone, email, website: websiteUrl }),
      social,
      location: compactObject({
        latitude,
        longitude,
        address: importedString(input.address || location.address, 400),
        city: importedString(input.city || location.city, 120),
        postcode: importedString(input.zip || location.postcode, 40),
        country: importedString(input.country || location.country, 120),
        countryCode: importedString(input.countryCode || location.countryCode, 8).toUpperCase(),
        googleMapsLink: importedHttpUrl(input.googleMapsLink || location.googleMapsLink)
      }),
      business: compactObject({
        brand: importedString(business.brand, 160),
        description: importedString(business.description, 1200),
        primaryType: importedString(business.primaryType, 160)
      })
    })
  });
}

function listedWebsiteUrl(lead = {}) {
  // Providers do not all put a public website in the same field. Treat a URL
  // as "listed" only when it was actually supplied by the business/map data;
  // never infer one from a Maps link, name, or address.
  const candidates = [
    lead.websiteUrl,
    lead.details?.contact?.website,
    lead.details?.business?.website,
    lead.raw?.websiteUri,
    lead.raw?.website,
    lead.raw?.tags?.website,
    lead.raw?.tags?.["contact:website"],
    lead.audit?.publicProfile?.finalUrl,
    lead.details?.publicWebsiteProfile?.finalUrl
  ];
  return String(candidates.find((value) => typeof value === "string" && value.trim()) || "").trim();
}

function hasListedWebsite(lead = {}) {
  return Boolean(listedWebsiteUrl(lead));
}

function normalizeListedWebsite(lead = {}) {
  const websiteUrl = listedWebsiteUrl(lead);
  if (!websiteUrl || lead.websiteUrl === websiteUrl) return lead;
  return {
    ...lead,
    websiteUrl,
    details: {
      ...(lead.details || {}),
      contact: compactObject({ ...(lead.details?.contact || {}), website: websiteUrl })
    }
  };
}

function enrichLeadFromAudit(lead, audit) {
  const normalizedLead = normalizeListedWebsite(lead);
  const profile = audit?.publicProfile || {};
  const phone = normalizedLead.phone || profile.phones?.[0] || "";
  const email = normalizedLead.email || profile.emails?.[0] || "";
  const websiteUrl = normalizedLead.websiteUrl || profile.finalUrl || "";
  const contact = compactObject({
    ...(normalizedLead.details?.contact || {}),
    phone,
    email,
    website: websiteUrl
  });
  const social = compactObject({
    ...(normalizedLead.details?.social || {}),
    ...(profile.socialLinks || {})
  });
  const business = compactObject({
    ...(normalizedLead.details?.business || {}),
    websiteTitle: profile.metadata?.title,
    websiteDescription: profile.metadata?.description
  });
  const source = compactObject({
    ...(normalizedLead.details?.source || {}),
    websiteScanUrl: profile.finalUrl,
    websiteScanSource: profile.source,
    websiteExtractedAt: profile.finalUrl ? new Date().toISOString() : ""
  });
  const evidence = {
    name: Boolean(normalizedLead.name),
    address: Boolean(normalizedLead.address || normalizedLead.details?.location?.address),
    phone: Boolean(phone),
    email: Boolean(email),
    website: Boolean(websiteUrl),
    social: Object.keys(social).length > 0,
    websiteScan: Boolean(profile.finalUrl)
  };
  const confirmedFields = Object.values(evidence).filter(Boolean).length;
  const confidence = Math.round((confirmedFields / Object.keys(evidence).length) * 100);
  return {
    ...normalizedLead,
    phone,
    email,
    websiteUrl,
    social: normalizedLead.social || Object.values(social)[0] || "",
    details: {
      ...(normalizedLead.details || {}),
      contact,
      social,
      business,
      source,
      enrichment: {
        confidence,
        confirmedFields: Object.entries(evidence).filter(([, confirmed]) => confirmed).map(([field]) => field),
        evidence,
        lastCheckedAt: new Date().toISOString(),
        policy: "Only publicly observed map or website fields are included; missing fields remain unverified."
      },
      publicWebsiteProfile: profile.finalUrl ? {
        finalUrl: profile.finalUrl,
        emails: profile.emails || [],
        phones: profile.phones || [],
        socialLinks: profile.socialLinks || {},
        metadata: profile.metadata || {},
        source: profile.source
      } : normalizedLead.details?.publicWebsiteProfile
    }
  };
}

function hasPublicContact(lead) {
  return Boolean(
    lead.phone || lead.email || lead.details?.contact?.phone || lead.details?.contact?.mobile
    || lead.audit?.publicProfile?.phones?.length || lead.audit?.publicProfile?.emails?.length
    || Object.keys(lead.details?.social || {}).length || Object.keys(lead.audit?.publicProfile?.socialLinks || {}).length
  );
}

function meetsSearchQuality(lead, search = {}) {
  const score = Number(lead.opportunityScore || lead.audit?.score || 0);
  const quality = search.leadQuality || "all";
  const requiresContact = search.requireContact || quality === "contact_ready" || quality === "owner_data";
  if (requiresContact && !hasPublicContact(lead)) return false;
  if (search.missingWebsiteOnly && hasListedWebsite(lead)) return false;
  if (quality === "needs_website" && hasListedWebsite(lead)) return false;
  if (quality === "high_opportunity" && score < Math.max(55, Number(search.minOpportunityScore || 0))) return false;
  if (score < Number(search.minOpportunityScore || 0)) return false;
  return true;
}

function searchQualityCoverage(leads, search = {}) {
  const coverage = {
    scanned: Array.isArray(leads) ? leads.length : 0,
    matched: 0,
    missingPublicContact: 0,
    websiteListed: 0,
    belowMinimumScore: 0
  };
  const requiresContact = Boolean(search.requireContact || search.leadQuality === "contact_ready" || search.leadQuality === "owner_data");
  const requiresMissingWebsite = Boolean(search.missingWebsiteOnly || search.leadQuality === "needs_website");
  const minimumScore = Math.max(0, Number(search.minOpportunityScore || 0));
  for (const lead of leads || []) {
    if (requiresContact && !hasPublicContact(lead)) coverage.missingPublicContact += 1;
    if (requiresMissingWebsite && hasListedWebsite(lead)) coverage.websiteListed += 1;
    if (minimumScore && Number(lead.opportunityScore || lead.audit?.score || 0) < minimumScore) coverage.belowMinimumScore += 1;
    if (meetsSearchQuality(lead, search)) coverage.matched += 1;
  }
  return coverage;
}

function normalizeSearchText(value) {
  return String(value || "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
}

function searchTerms(value) {
  return normalizeSearchText(value).split(/[\s,;/|]+/).filter((term) => term.length > 2);
}

function searchTermMatches(text, term) {
  const normalizedTerm = normalizeSearchText(term);
  if (!normalizedTerm) return false;
  const variants = new Set([normalizedTerm]);
  if (normalizedTerm.endsWith("ies") && normalizedTerm.length > 4) {
    variants.add(`${normalizedTerm.slice(0, -3)}y`);
  }
  if (normalizedTerm.endsWith("s") && normalizedTerm.length > 3) {
    variants.add(normalizedTerm.slice(0, -1));
  } else if (!normalizedTerm.endsWith("s")) {
    variants.add(`${normalizedTerm}s`);
  }
  return [...variants].some((variant) => text.includes(variant));
}

function historicalLeadMatchesSearch(lead, search = {}) {
  // Reuse prior public map results only for country-wide searches. A pasted map
  // link or a specific city/ZIP requires a fresh location-bound provider scan.
  if (search.mapLink || search.city || search.state || search.zip) return false;
  const countryNames = [...new Set([...(search.countries || []), search.country].map(normalizeSearchText).filter(Boolean))];
  const leadCountry = normalizeSearchText(`${lead.country || ""} ${lead.countryName || ""}`);
  if (countryNames.length && !countryNames.some((country) => leadCountry.includes(country))) return false;

  const selectedTypes = Array.isArray(search.businessTypes) ? search.businessTypes : [];
  if (selectedTypes.length) {
    const businessText = normalizeSearchText(`${lead.category || ""} ${lead.businessType || ""} ${lead.industry || ""} ${lead.details?.business?.primaryType || ""}`);
    const typeMatches = selectedTypes.some((type) => {
      const normalizedType = normalizeSearchText(type);
      const singularType = normalizedType.endsWith("s") ? normalizedType.slice(0, -1) : normalizedType;
      return businessText.includes(normalizedType) || businessText.includes(singularType);
    });
    if (!typeMatches) return false;
  }

  const queryTerms = [...searchTerms(search.industry), ...searchTerms(search.keyword)];
  if (queryTerms.length) {
    const businessText = normalizeSearchText(`${lead.name || ""} ${lead.category || ""} ${lead.businessType || ""} ${lead.details?.business?.description || ""}`);
    // Targeting text is advisory; accept a historic record when at least one
    // substantial niche term matches its real business classification. The
    // dashboard creates plural industry labels ("restaurants", "hotels")
    // while provider data commonly uses singular categories, so compare both
    // forms instead of accidentally discarding valid records.
    const recognizedTerms = queryTerms.filter((term) => searchTermMatches(businessText, term));
    if (recognizedTerms.length === 0 && search.industry) return false;
  }
  return true;
}

function leadIdentity(lead = {}) {
  return String(lead.id || `${lead.name || ""}|${lead.address || ""}|${lead.latitude || ""}|${lead.longitude || ""}`).trim().toLowerCase();
}

export class LeadService {
  constructor() {
    this.googlePlaces = new GooglePlacesService();
    this.websiteAudit = new WebsiteAuditService();
    this.leads = new FirestoreRepository("leads");
    this.users = new FirestoreRepository("users");
    this.auditLogs = new FirestoreRepository("auditLogs");
  }

  async currentAccessUser(user) {
    if (!user?.uid || isAdminUser(user)) return user;
    // Firebase password, popup, and legacy sessions can hold different
    // provider IDs for one verified email. Resolve the durable account before
    // enforcing a metered trial, so usage cannot split across login paths.
    let stored = await this.users.findById(user.uid);
    if (!stored && user.email) {
      const matches = await this.users.list({
        where: [{ field: "email", op: "==", value: String(user.email).trim().toLowerCase() }],
        limit: 1
      });
      stored = matches[0] || null;
    }
    if (!stored) return user;
    return {
      ...user,
      ...stored,
      uid: stored.uid || stored.id || user.uid,
      email: stored.email || user.email
    };
  }

  async assertTrialAccess(user) {
    if (isAdminUser(user) || user?.entitlements?.unlimitedAccess || user?.permissions?.includes?.("unlimited")) return null;
    const planKey = String(user?.subscription || user?.entitlements?.activePlan || "trial").toLowerCase();
    if (planKey !== "trial") return null;

    const plan = getPlan("trial");
    const searchLimit = Number(user?.trialSearchLimit || user?.entitlements?.trialSearchLimit || plan.trialSearchLimit);
    const leadLimit = Number(user?.trialLeadLimit || user?.entitlements?.trialLeadLimit || plan.trialLeadLimit);
    const used = Number(user?.trialSearchesUsed || user?.entitlements?.trialSearchesUsed || 0);
    if (used >= searchLimit) {
      throw new AppError("Your free trial searches are used. Upgrade to continue finding new leads.", 402, "TRIAL_SEARCH_LIMIT_REACHED");
    }
    return { used, searchLimit, leadLimit, remaining: Math.max(0, searchLimit - used) };
  }

  async recordTrialSearch(user, usage) {
    if (!usage || !user?.uid) return null;
    const used = usage.used + 1;
    await this.users.upsert(user.uid, {
      trialSearchesUsed: used,
      entitlements: {
        ...(user.entitlements || {}),
        billingRequired: true,
        trial: true,
        trialSearchesUsed: used,
        trialSearchLimit: usage.searchLimit,
        trialLeadLimit: usage.leadLimit,
        upgradeRequiredAfterTrial: true
      }
    });
    return { ...usage, used, remaining: Math.max(0, usage.searchLimit - used) };
  }

  async historicalMatchingLeads(search, user, maximum) {
    if (!maximum || search.mapLink || search.city || search.state || search.zip) return [];
    const admin = isAdminUser(user) || user?.entitlements?.unlimitedAccess || user?.permissions?.includes?.("unlimited");
    const records = await this.leads.list({
      where: admin ? [] : [{ field: "discoveredBy", op: "==", value: user?.uid }],
      limit: 500,
      orderBy: "discoveredAt"
    });
    return records
      .filter((lead) => historicalLeadMatchesSearch(lead, search))
      .filter((lead) => meetsSearchQuality(lead, search))
      .slice(0, maximum)
      .map((lead) => ({ ...normalizeListedWebsite(lead), searchResultOrigin: "previously_discovered" }));
  }

  async search(search, user) {
    const accessUser = await this.currentAccessUser(user);
    const startingTrialUsage = await this.assertTrialAccess(accessUser);
    const admin = isAdminUser(accessUser) || accessUser?.entitlements?.unlimitedAccess || accessUser?.permissions?.includes?.("unlimited");
    const effectiveSearch = search;
    const bypassCache = Boolean(effectiveSearch?.bypassCache || effectiveSearch?.refreshSeed);
    const requestedLimit = effectiveSearch?.limit || 50;
    const requiresPublicContact = Boolean(
      effectiveSearch?.requireContact
      || effectiveSearch?.leadQuality === "contact_ready"
      || effectiveSearch?.leadQuality === "owner_data"
    );
    const requiresMissingWebsite = Boolean(
      effectiveSearch?.missingWebsiteOnly || effectiveSearch?.leadQuality === "needs_website"
    );
    // A business must pass every active quality filter. Public-map records
    // commonly omit a contact field, so a strict contact + no-website search
    // needs a wider real candidate pool before filtering. This is discovery
    // only: the response still includes only verified matching records.
    const strictDataSearch = requiresPublicContact || requiresMissingWebsite;
    const candidateMultiplier = requiresPublicContact && requiresMissingWebsite
      ? 20
      : strictDataSearch ? 8 : 2;
    const providerCandidateCap = requiresPublicContact && requiresMissingWebsite
      ? Math.min(1200, Math.max(800, requestedLimit * 20))
      : 320;
    const providerSearch = {
      ...effectiveSearch,
      limit: Math.min(
        providerCandidateCap,
        Math.max(requestedLimit, requestedLimit * candidateMultiplier)
      ),
      interactive: true,
      // Internal metadata lets the Google adapter distinguish the user's
      // requested count from its larger quality-filter candidate pool.
      requestedResultLimit: requestedLimit,
      searchEngineVersion: SEARCH_ENGINE_VERSION
    };
    const resultLimit = Math.min(requestedLimit, startingTrialUsage?.leadLimit || requestedLimit);
    // Read account-authorized prior map discoveries before an expensive strict
    // lookup. They provide an honest, fast fallback when a public map mirror
    // is slow or unavailable; a specific map/city/ZIP never uses this path.
    const historicalSeed = await this.historicalMatchingLeads(effectiveSearch, accessUser, resultLimit);
    const hasFullHistoricalFallback = historicalSeed.length >= resultLimit;
    const cacheKey = JSON.stringify(providerSearch) + "-" + (admin ? `admin:${accessUser?.uid || "session"}` : `user:${accessUser?.uid || "session"}`);
    const cached = bypassCache ? null : getCachedSearch(cacheKey);
    if (cached) {
      const updatedTrialUsage = await this.recordTrialSearch(accessUser, startingTrialUsage);
      void this.auditLogs.create({
        actor: accessUser?.email || "guest",
        action: "lead_search_cached",
        query: effectiveSearch,
        count: cached.leads?.length || 0
      }).catch(() => {});
      return {
        ...cached,
        leads: cached.leads,
        trial: updatedTrialUsage ? {
          ...updatedTrialUsage,
          limited: updatedTrialUsage.remaining <= 0,
          upgradeUrl: "/pricing.html"
        } : cached.trial
      };
    }

    // Once this account already has enough matching, verified map records to
    // satisfy the selected result count, return them immediately. Refresh is
    // the explicit action that asks providers for newly discovered records.
    // This prevents a slow public mirror from making a 20-result request look
    // like a 2-result request simply because its live batch was sparse.
    let result = hasFullHistoricalFallback && !bypassCache
      ? {
          source: "stored_search_history",
          providerLabel: "Previously discovered map results",
          leads: []
        }
      : null;
    if (!result) {
      try {
        // Saved matches are an honest fallback, but they must not cut a strict
        // contact + missing-website discovery request down to the short
        // history-assisted timeout. That workflow verifies a wider batch of
        // real public-map records before it can decide which leads qualify.
        const needsDeepProviderDiscovery = Boolean(requiresPublicContact && requiresMissingWebsite);
        result = await withTimeout(
          this.googlePlaces.search(providerSearch),
          needsDeepProviderDiscovery || !historicalSeed.length
            ? INTERACTIVE_PROVIDER_TIMEOUT_MS
            : HISTORY_ASSISTED_PROVIDER_TIMEOUT_MS,
          "Lead data providers are taking too long. Please retry in a moment."
        );
      } catch (error) {
        if (historicalSeed.length && isTemporaryProviderFailure(error)) {
          result = {
            source: "stored_search_history",
            providerLabel: "Previously discovered map results",
            leads: []
          };
        } else if (error instanceof AppError) throw error;
        else throw new AppError("Lead search could not reach a map data provider. Please retry.", 503, "LEAD_PROVIDER_UNAVAILABLE");
      }
    }
    let audited = [];
    let inlineAuditCount = 0;
    try {
      const targetedDataSearch = Boolean(effectiveSearch?.requireContact || effectiveSearch?.missingWebsiteOnly || effectiveSearch?.leadQuality === "contact_ready");
      const strictContactWithoutWebsiteSearch = Boolean(requiresPublicContact && requiresMissingWebsite);
      const largeResultRequest = resultLimit > 50;
      const auditCandidateCount = Math.min(
        result.leads.length,
        // Large result requests prioritize fast discovery. Their records still
        // retain map contact fields and receive a complete audit when opened.
        // A website audit cannot add valid website-derived contact data to a
        // record that must have no listed website. OSM detail enrichment has
        // already verified the public map contact tags, so skipping audits for
        // this exact workflow removes redundant network calls and keeps the
        // strict search safely within a serverless response window.
        strictContactWithoutWebsiteSearch
          ? 0
          : largeResultRequest ? 0 : targetedDataSearch ? MAX_INLINE_AUDITS : Math.max(10, Math.min(resultLimit * 2, MAX_INLINE_AUDITS))
      );
      inlineAuditCount = auditCandidateCount;
      const auditCandidates = result.leads.slice(0, auditCandidateCount);
      const auditedCandidates = await mapWithConcurrency(auditCandidates, INLINE_AUDIT_CONCURRENCY, async (lead) => {
        try {
          const audit = lead.audit?.publicProfile
            ? lead.audit
            : await this.websiteAudit.audit(lead, {
              timeoutMs: 3500,
              discoverProfiles: !largeResultRequest && auditCandidates.indexOf(lead) < 5,
              profilePageLimit: 2,
              profilePageTimeoutMs: 2200
            });
          return { ...enrichLeadFromAudit(lead, audit), audit, opportunityScore: audit.score, opportunityCategory: audit.category };
        } catch (error) {
          return { ...lead, audit: { score: 0, category: "Audit Pending", checks: {} }, opportunityScore: 0, opportunityCategory: "Audit Pending" };
        }
      });
      audited = [
        ...auditedCandidates,
        ...result.leads.slice(auditCandidateCount).map((lead) => ({
          ...normalizeListedWebsite(lead),
          audit: { score: lead.opportunityScore || 0, category: "Audit Pending", checks: {} },
          opportunityScore: lead.opportunityScore || 0,
          opportunityCategory: "Audit Pending"
        }))
      ];
    } catch {
      audited = (result.leads || []).map((lead) => ({
        ...normalizeListedWebsite(lead),
        audit: { score: 0, category: "Audit Pending", checks: {} },
        opportunityScore: 0,
        opportunityCategory: "Audit Pending"
      }));
    }

    const qualityCoverage = searchQualityCoverage(audited, effectiveSearch);
    let filteredPool = audited.filter((lead) => meetsSearchQuality(lead, effectiveSearch));
    if (effectiveSearch && effectiveSearch.filters) {
      filteredPool = filteredPool.filter(lead => {
        let passes = true;
        for (const filter of effectiveSearch.filters) {
          const { field, op, value } = filter;
          if (op === "==") {
            if (String(lead[field] || "") !== String(value)) passes = false;
          } else if (op === "contains") {
            if (!String(lead[field] || "").toLowerCase().includes(String(value).toLowerCase())) passes = false;
          } else if (op === ">=") {
            if (Number(lead[field] || 0) < Number(value)) passes = false;
          } else if (op === "<=") {
            if (Number(lead[field] || 999999) > Number(value)) passes = false;
          } else if (op === "in") {
            if (!value.includes(String(lead[field] || ""))) passes = false;
          }
        }
        return passes;
      });
    }

    // Explicit data-quality requirements must never be silently relaxed: a
    // "contact details only" search should not return contactless businesses.
    const hasStrictQualityFilter = Boolean(effectiveSearch?.requireContact || effectiveSearch?.missingWebsiteOnly || effectiveSearch?.leadQuality !== "all" || Number(effectiveSearch?.minOpportunityScore || 0) > 0);
    const filtersRelaxed = !hasStrictQualityFilter && filteredPool.length === 0 && audited.length > 0;
    const freshQualifiedPool = await this.fallbackLeadOrder(
      filtersRelaxed ? await this.fallbackLeadPool(audited) : filteredPool,
      effectiveSearch?.refreshSeed || "",
      effectiveSearch?.sortBy
    );

    // A public provider can be briefly rate-limited or return sparse fields.
    // For a country-wide search, supplement the fresh pool with the same
    // account's previously discovered, still-matching public map records.
    // This is real stored search data, never generated filler, and records
    // from other users are never exposed to a standard account.
    // Include the whole matching history before de-duplicating. Slicing it by
    // the raw fresh count first was incorrect: if fresh provider records were
    // also in history, de-duplication could shrink a selected 20/100 result
    // to only a few cards even though enough real matching records existed.
    const historicalMatches = freshQualifiedPool.length < resultLimit ? historicalSeed : [];
    const seenLeads = new Set();
    const mergedPool = [...freshQualifiedPool, ...historicalMatches].filter((lead) => {
      const key = leadIdentity(lead);
      if (!key || seenLeads.has(key)) return false;
      seenLeads.add(key);
      return true;
    });
    const qualifiedPool = await this.fallbackLeadOrder(
      mergedPool,
      effectiveSearch?.refreshSeed || "",
      effectiveSearch?.sortBy
    );
    const qualified = qualifiedPool.slice(0, resultLimit);
    const storedResultCount = qualified.filter((lead) => lead.searchResultOrigin === "previously_discovered").length;

    await this.leads.upsertMany(qualified
      .filter((lead) => lead.searchResultOrigin !== "previously_discovered")
      .map((lead) => ({
        id: lead.id,
        data: {
          ...lead,
          source: lead.source || "enhanced_search",
          discoveredBy: accessUser?.uid,
          discoveredAt: new Date().toISOString()
        }
      })));

    const updatedTrialUsage = await this.recordTrialSearch(accessUser, startingTrialUsage);

    // An audit trail is important, but a slow local disk must not delay the
    // browser response after the business results are already ready.
    void this.auditLogs.create({
      actor: accessUser?.email || "guest",
      action: "lead_search",
      query: effectiveSearch,
      count: qualified.length
    }).catch(() => {});

    const response = {
      ...result,
      leads: qualified,
      cached: false,
      refreshed: bypassCache,
      refreshSeed: effectiveSearch?.refreshSeed || "",
      adminUnlimited: admin,
      searchStats: {
        requestedLimit: effectiveSearch?.limit || 50,
        appliedResultLimit: resultLimit,
        planResultLimited: Boolean(startingTrialUsage && resultLimit < requestedLimit),
        returnedLimit: qualified.length,
        providerCandidateLimit: providerSearch.limit,
        searchEngineVersion: SEARCH_ENGINE_VERSION,
        rawCount: result.leads?.length || 0,
        inlineAuditCount,
        normalizedCandidateCount: audited.length,
        qualifiedCount: qualified.length,
        qualifiedPoolCount: qualifiedPool.length,
        freshQualifiedCount: freshQualifiedPool.length,
        storedResultCount,
        usedStoredSearchResults: storedResultCount > 0,
        availableStoredMatchCount: historicalSeed.length,
        qualityCoverage,
        searchExhausted: qualified.length < resultLimit,
        strictContactFilter: Boolean(effectiveSearch?.requireContact || effectiveSearch?.leadQuality === "contact_ready" || effectiveSearch?.leadQuality === "owner_data"),
        strictMissingWebsiteFilter: Boolean(effectiveSearch?.missingWebsiteOnly || effectiveSearch?.leadQuality === "needs_website"),
        contactCoverageLimited: Boolean(
          (effectiveSearch?.requireContact || effectiveSearch?.leadQuality === "contact_ready" || effectiveSearch?.leadQuality === "owner_data")
          && /^openstreetmap_(photon|nominatim)$/.test(String(result.source || ""))
        ),
        filtersRelaxed,
        bypassCache,
        searchDepth: effectiveSearch?.searchDepth,
        leadQuality: "enhanced",
        sortBy: effectiveSearch?.sortBy
      },
      trial: updatedTrialUsage ? {
        ...updatedTrialUsage,
        limited: updatedTrialUsage.remaining <= 0,
        upgradeUrl: "/pricing.html"
      } : undefined
    };

    if (!bypassCache) cacheSearch(cacheKey, response);
    return response;
  }

  async fallbackLeadPool(audited) {
    return [...audited].sort((left, right) => {
      const scoreDifference = Number(right.opportunityScore || right.audit?.score || 0) - Number(left.opportunityScore || left.audit?.score || 0);
      if (scoreDifference) return scoreDifference;
      const contactDifference = Number(hasPublicContact(right)) - Number(hasPublicContact(left));
      if (contactDifference) return contactDifference;
      return String(left.name || "").localeCompare(String(right.name || ""));
    });
  }

  async fallbackLeadOrder(leads, refreshSeed, sortBy = "opportunity") {
    const ordered = freshLeadOrder(leads, refreshSeed);
    if (sortBy === "contact") {
      return ordered.sort((a, b) => Number(hasPublicContact(b)) - Number(hasPublicContact(a)) || Number(b.opportunityScore || 0) - Number(a.opportunityScore || 0));
    }
    if (sortBy === "website_missing") {
      return ordered.sort((a, b) => Number(!hasListedWebsite(b)) - Number(!hasListedWebsite(a)) || Number(b.opportunityScore || 0) - Number(a.opportunityScore || 0));
    }
    if (sortBy === "name") return ordered.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
    return ordered;
  }

  async save(leadId, user, fallbackLead = null) {
    let existing = null;
    try { existing = await this.getById(leadId); } catch { existing = null; }
    if (existing && !this.canAccessLead(existing, user)) return null;
    const lead = existing || sanitizeImportedLead(fallbackLead, leadId);
    if (!lead) return null;
    return this.leads.upsert(lead.id, {
      ...lead,
      ownerId: user?.uid,
      discoveredBy: lead.discoveredBy || user?.uid,
      stage: lead.stage || "New",
      savedAt: new Date().toISOString()
    });
  }

  async getById(id) {
    return await this.leads.findById(id) || null;
  }

  canAccessLead(lead, user) {
    if (!lead || !user?.uid) return false;
    if (isAdminUser(user) || user?.entitlements?.unlimitedAccess || user?.permissions?.includes?.("unlimited")) return true;
    const uid = String(user.uid);
    return String(lead.ownerId || "") === uid || String(lead.discoveredBy || "") === uid;
  }

  async getForUser(id, user) {
    const lead = await this.getById(id);
    return this.canAccessLead(lead, user) ? lead : null;
  }

  async getReport(id) {
    const lead = await this.getById(id);
    if (!lead) return null;
    const audit = lead.audit?.publicProfile ? lead.audit : await this.websiteAudit.audit(lead);
    const publicEnrichedLead = { ...lead };
    const enrichedLead = { ...publicEnrichedLead, audit, opportunityScore: audit.score, opportunityCategory: audit.category };
    return {
      lead: enrichedLead,
      dossier: { needs: [], bestOffer: "Contact info and website presence detected" },
      aiSummary: "Enhanced lead extraction ready"
    };
  }

  async getReportForUser(id, user) {
    const lead = await this.getForUser(id, user);
    if (!lead) return null;
    const audit = lead.audit?.publicProfile ? lead.audit : await this.websiteAudit.audit(lead);
    const enrichedLead = { ...lead, audit, opportunityScore: audit.score, opportunityCategory: audit.category };
    return {
      lead: enrichedLead,
      dossier: { needs: [], bestOffer: "Contact info and website presence detected" },
      aiSummary: "Enhanced lead extraction ready"
    };
  }
}

function freshLeadOrder(leads, refreshSeed) {
  const ordered = [...leads].sort((a, b) => {
    const scoreA = Number(a.opportunityScore || 0) || 0;
    const scoreB = Number(b.opportunityScore || 0) || 0;
    if (scoreB !== scoreA) return scoreB - scoreA;
    return String(a.name || "").localeCompare(String(b.name || ""));
  });
  if (!refreshSeed) return ordered;
  // Refresh has an explicit new seed. Rotate real, already-qualified records
  // deterministically instead of returning the same top cards every time.
  return ordered
    .map((lead, index) => ({
      lead,
      rank: hashString(`${refreshSeed}:${leadIdentity(lead)}:${index}`)
    }))
    .sort((left, right) => left.rank - right.rank)
    .map(({ lead }) => lead);
}
