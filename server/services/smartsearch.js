// ==========================================================================
// SMART LEAD SEARCH & BULK EXTRACTION
// ==========================================================================

import { extractPhoneNumbers, extractEmails, extractSocialProfiles, estimateRevenue, detectBusinessNeeds } from "./lead-extract.js";

// --- Enhanced lead normalization ---
export function enhanceSearchResult(leads, searchConfig) {
  if (!leads || !Array.isArray(leads)) return leads || [];

  const enriched = [];
  for (const lead of leads) {
    const text = [lead.name || "", lead.address || "", lead.city || "", lead.state || "", lead.zip || "", lead.category || "", lead.tags || "", JSON.stringify(lead.details || {}), lead.websiteUrl || "", JSON.stringify(lead.social || {}), lead.raw?.tags || ""].join(" ");

    const phone = extractPhoneNumbers(text);
    const email = extractEmails(text);
    const social = extractSocialProfiles(text, lead.social || {});
    const revenue = estimateRevenue(text);

    const needs = detectBusinessNeeds({ ...lead, phone: phone[0] || null, email: email[0] || null });

    let qualityScore = 0;
    qualityScore += phone.length ? 20 : 5;
    qualityScore += email.length ? 20 : 5;
    qualityScore += Object.keys(social).length ? 15 : 3;
    qualityScore += lead.websiteUrl ? 15 : 5;
    qualityScore += lead.rating ? 10 : 3;
    qualityScore += lead.reviewsCount > 10 ? 10 : 5;
    qualityScore += revenue ? 15 : 0;

    const enhancedLead = {
      ...lead,
      phone,
      email,
      social,
      revenue,
      businessNeeds: needs,
      salesReady: qualityScore >= 50,
      qualityScore,
      source: lead.source || "enhanced",
      extractedAt: new Date().toISOString(),
      extractedData: {
        phoneCount: phone.length,
        emailCount: email.length,
        socialPlatforms: Object.keys(social).length,
        hasRevenueSignal: Boolean(revenue),
        hasQualityScore: true,
      },
    };

    enriched.push(enhancedLead);
  }

  return enriched;
}

// --- Bulk extraction ---
export async function bulkExtractLeadData(leads, user) {
  const enhanced = [];
  const processed = new Set();

  for (const lead of leads) {
    const cacheKey = `${lead.id || lead.name}-${lead.source || "unknown"}`;
    if (processed.has(cacheKey)) continue;
    processed.add(cacheKey);

    if (lead.extractedData && lead.extractedData.extractedAt) {
      const age = Date.now() - new Date(lead.extractedData.extractedAt).getTime();
      if (age < 24 * 60 * 60 * 1000) {
        enhanced.push(lead);
        continue;
      }
    }

    const rawLead = { ...lead };
    const text = [lead.name || "", lead.address || "", lead.city || "", lead.state || "", lead.zip || "", lead.category || "", lead.websiteUrl || "", JSON.stringify(lead.details || {}), JSON.stringify(lead.tags || {})].join(" ");

    const phone = extractPhoneNumbers(text);
    const email = extractEmails(text);
    const social = extractSocialProfiles(text, lead.social || {});
    const revenue = estimateRevenue(text);

    const needs = detectBusinessNeeds({ ...lead, phone: phone[0] || null, email: email[0] || null });

    let qualityScore = 0;
    qualityScore += phone.length ? 20 : 5;
    qualityScore += email.length ? 20 : 5;
    qualityScore += Object.keys(social).length ? 15 : 3;
    qualityScore += lead.websiteUrl ? 15 : 5;
    qualityScore += lead.rating ? 10 : 3;
    qualityScore += lead.reviewsCount > 10 ? 10 : 5;
    qualityScore += revenue ? 15 : 0;

    const enriched = {
      ...lead,
      phone,
      email,
      social,
      revenue,
      businessNeeds: needs,
      salesReady: qualityScore >= 50,
      qualityScore,
      source: lead.source || "enhanced_search",
      extractedAt: new Date().toISOString(),
      extractedData: {
        phoneCount: phone.length,
        emailCount: email.length,
        socialPlatforms: Object.keys(social).length,
        hasRevenueSignal: Boolean(revenue),
        hasQualityScore: true,
      },
    };

    enhanced.push(enriched);
  }

  return enhanced;
}