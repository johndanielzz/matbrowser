// ==========================================================================
// ENHANCED LEAD EXTRACTION — Phone, email, social media, revenue signals
// ==========================================================================

// Phone number extraction patterns (helps: phone numbers, mobile)
export const PHONE_PATTERNS = [
  /(\+?1?[-.\s]?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/g,
  /(\+?[\d\s\-().]{7,15})/g,
  /(\+?[\d\s\-().]{7,15}(?:9|8|7))\b/g,
];

// Email extraction patterns
export const EMAIL_PATTERNS = [
  /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  /@gmail\.com|[a-zA-Z0-9._%+-]+@company\.[a-z]{2,}/gi,
];

// Social media patterns
export const SOCIAL_PATTERNS = [
  { name: "Twitter", pattern: /@([a-zA-Z0-9_]{3,15})/g, domain: "twitter.com/", icon: "𝕏" },
  { name: "Instagram", pattern: /(@[a-zA-Z0-9._]{3,30})/g, domain: "instagram.com/", icon: "📷" },
  { name: "Facebook", pattern: /(@[a-zA-Z0-9._]{3,50})/g, domain: "facebook.com/", icon: "f" },
  { name: "LinkedIn", pattern: /((?:linkedin\.com\/[a-z0-9_-]+)|(@[a-z0-9_-]{3,30}))/gi, domain: "linkedin.com/in/", icon: "💼" },
  { name: "YouTube", pattern: /(@[a-zA-Z0-9_-]{3,30})/g, domain: "youtube.com/@", icon: "▶️" },
  { name: "TikTok", pattern: /(@[a-zA-Z0-9._]{3,30})/g, domain: "tiktok.com/@", icon: "🎵" },
  { name: "WhatsApp", pattern: [/wa\.me\/[a-zA-Z0-9._-]{3,50}/g], domain: "wa.me/", icon: "📱" },
  { name: "WeChat", pattern: /@([a-zA-Z0-9_-]{3,50})/g, domain: "wechat.com/", icon: "💬" },
  { name: "Telegram", pattern: /(@[a-zA-Z0-9_-]{3,30})/g, domain: "t.me/", icon: "✈️" },
];

// Revenue patterns
export const REVENUE_PATTERNS = [
  /\$\s?\d+(?:,\d{3})*(?:\.\d{2})?/,
  /\d{1,3}(?:,\d{3})*(?:\.\d{2})?(?:\s?(?:million|billion|thousand|k|m|B))?/gi,
];

// --- Phone extraction ---
export function extractPhoneNumbers(text) {
  const phones = new Set();
  for (const pattern of PHONE_PATTERNS) {
    let match;
    const cloned = new RegExp(pattern.source, pattern.flags);
    while ((match = cloned.exec(text)) !== null) {
      const cleaned = match[1].replace(/[-().\s]/g, "");
      if (cleaned.length >= 10) phones.add(cleaned);
    }
  }
  return Array.from(phones);
}

// --- Email extraction ---
export function extractEmails(text) {
  const emails = new Set();
  for (const pattern of EMAIL_PATTERNS) {
    let match;
    const cloned = new RegExp(pattern.source, pattern.flags);
    while ((match = cloned.exec(text)) !== null) {
      const email = match[0].toLowerCase().trim();
      if (email.length < 30) emails.add(email);
    }
  }
  return Array.from(emails).filter(email => email.includes("@") && !email.includes(" "));
}

// --- Social media extraction ---
export function extractSocialProfiles(text, existing = {}) {
  const social = { ...existing };
  for (const type of SOCIAL_PATTERNS) {
    let match;
    const cloned = new RegExp(type.pattern.source, type.pattern.flags);
    while ((match = cloned.exec(text)) !== null) {
      const handle = match[1] || match[0].replace(/^@/, "");
      if (handle.length >= 3 && handle.length <= 50) {
        const key = type.name.toLowerCase().replace(/\s/g, "_");
        if (!social[key]) {
          social[key] = { username: handle, url: `https://${type.domain}${handle}`, handle, platform: type.name };
        }
      }
    }
  }
  return social;
}

// --- Revenue estimation ---
export function estimateRevenue(text) {
  const revenues = [];
  for (const pattern of REVENUE_PATTERNS) {
    let match;
    const cloned = new RegExp(pattern.source, pattern.flags);
    while ((match = cloned.exec(text)) !== null) {
      const val = match[0].replace(/[$,\s]/g, "");
      const num = parseFloat(val);
      if (!isNaN(num) && num > 1000) revenues.push(num);
    }
  }
  if (!revenues.length) return null;
  const avg = revenues.reduce((a, b) => a + b, 0) / revenues.length;
  const max = Math.max(...revenues);
  const min = Math.min(...revenues);
  let size;
  if (avg < 50000) size = "Small";
  else if (avg < 250000) size = "Medium";
  else size = "Large";
  return { estimatedAnnualRevenue: Math.round(avg), lowestRevenue: Math.round(min), highestRevenue: Math.round(max), avgRevenue: Math.round(avg), sampleSize: revenues.length, size };
}

// --- Business needs detection ---
export function detectBusinessNeeds(lead) {
  const needs = [];
  const text = [lead.name || "", lead.address || "", lead.city || "", lead.category || "", lead.websiteUrl || "", JSON.stringify(lead.social || {}), lead.details || ""].join(" ");
  if (!lead.websiteUrl) needs.push("no_website");
  if (lead.category?.includes("restaurant") || lead.category?.includes("food")) needs.push("no_online_ordering");
  if (lead.category?.includes("clinic") || lead.category?.includes("medical")) needs.push("no_booking_system");
  if (lead.websiteUrl && !lead.openingHours) needs.push("no_hours_on_website");
  if (!lead.phone && !lead.email) needs.push("no_contact_info");
  return needs;
}
