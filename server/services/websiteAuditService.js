import dns from "node:dns/promises";
import net from "node:net";
import { performance } from "node:perf_hooks";
import { AppError } from "../utils/errors.js";

function normalizeWebsiteUrl(input) {
  if (!input) return "";
  const trimmed = String(input).trim();
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withProtocol);
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new AppError("Only HTTP and HTTPS websites can be audited.", 422, "INVALID_WEBSITE_URL");
  }
  return url;
}

function isPrivateIp(address) {
  if (net.isIP(address) === 4) {
    const parts = address.split(".").map(Number);
    return (
      parts[0] === 10 ||
      parts[0] === 127 ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      (parts[0] === 169 && parts[1] === 254) ||
      parts[0] === 0
    );
  }

  if (net.isIP(address) === 6) {
    const value = address.toLowerCase();
    return value === "::1" || value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe80");
  }

  return true;
}

async function assertPublicHostname(url) {
  if (["localhost", "metadata.google.internal"].includes(url.hostname)) {
    throw new AppError("Website host is not allowed.", 422, "SSRF_HOST_BLOCKED");
  }

  const addresses = await dns.lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some((entry) => isPrivateIp(entry.address))) {
    throw new AppError("Website host resolves to a private network.", 422, "SSRF_IP_BLOCKED");
  }
}

function hasPattern(html, pattern) {
  return pattern.test(html);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function compactObject(object) {
  return Object.fromEntries(Object.entries(object || {}).filter(([, value]) => {
    if (value === undefined || value === null || value === "") return false;
    if (Array.isArray(value) && value.length === 0) return false;
    if (typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === 0) return false;
    return true;
  }));
}

function absoluteUrl(value, baseUrl) {
  try {
    const url = new URL(decodeHtml(value), baseUrl);
    if (!["http:", "https:"].includes(url.protocol)) return "";
    url.hash = "";
    return url.href;
  } catch {
    return "";
  }
}

function extractHrefValues(html) {
  const values = [];
  const pattern = /\bhref\s*=\s*["']([^"']{1,1200})["']/gi;
  let match;
  while ((match = pattern.exec(html))) {
    values.push(decodeHtml(match[1]));
  }
  return values;
}

function extractEmails(html) {
  const emails = [];
  const mailtoPattern = /\bmailto:([^"'?\s<>]+)/gi;
  let mailto;
  while ((mailto = mailtoPattern.exec(html))) {
    emails.push(mailto[1]);
  }

  const plainPattern = /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/gi;
  let plain;
  while ((plain = plainPattern.exec(html))) {
    emails.push(plain[0]);
  }

  return unique(emails
    .map((email) => email.toLowerCase())
    .filter((email) => !/\.(png|jpg|jpeg|gif|webp|svg|css|js)$/i.test(email))
    .slice(0, 10));
}

function extractPhones(html) {
  const phones = [];
  const telPattern = /\btel:([^"'\s<>]+)/gi;
  let tel;
  while ((tel = telPattern.exec(html))) {
    phones.push(tel[1]);
  }

  const plainPattern = /(?:\+|00)?\d[\d\s().-]{6,}\d/g;
  let plain;
  while ((plain = plainPattern.exec(html))) {
    phones.push(plain[0]);
  }

  return unique(phones
    .map((phone) => decodeURIComponent(phone).replace(/[^\d+().\-\s]/g, "").replace(/\s+/g, " ").trim())
    .filter((phone) => {
      const digits = phone.replace(/\D/g, "");
      return digits.length >= 7 && digits.length <= 16;
    })
    .slice(0, 8));
}

function socialPlatform(url) {
  const host = url.hostname.replace(/^www\./i, "").toLowerCase();
  if (host === "facebook.com" || host.endsWith(".facebook.com")) return "facebook";
  if (host === "instagram.com" || host.endsWith(".instagram.com")) return "instagram";
  if (host === "linkedin.com" || host.endsWith(".linkedin.com")) return "linkedin";
  if (host === "x.com") return "x";
  if (host === "twitter.com" || host.endsWith(".twitter.com")) return "x";
  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) return "tiktok";
  if (host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtu.be") return "youtube";
  if (host === "pinterest.com" || host.endsWith(".pinterest.com")) return "pinterest";
  if (host === "threads.net" || host.endsWith(".threads.net")) return "threads";
  if (host === "snapchat.com" || host.endsWith(".snapchat.com")) return "snapchat";
  if (host === "wa.me" || host === "api.whatsapp.com" || host === "whatsapp.com" || host.endsWith(".whatsapp.com")) return "whatsapp";
  return "";
}

function isLikelyBusinessSocialProfile(url) {
  const value = url.href.toLowerCase();
  if (/(share|sharer|intent\/tweet|plugins\/|dialog\/|\/login|\/privacy|\/policy|\/terms|\/help|\/search|\/hashtag|\/explore|\/watch\?|\/embed)/i.test(value)) {
    return false;
  }
  return Boolean(socialPlatform(url));
}

function extractSocialLinks(html, finalUrl) {
  const candidates = [
    ...extractHrefValues(html).map((href) => absoluteUrl(href, finalUrl)),
    ...Array.from(html.matchAll(/https?:\/\/[^\s"'<>]+/gi)).map(([url]) => decodeHtml(url))
  ];
  const byPlatform = {};

  for (const candidate of candidates) {
    try {
      const url = new URL(candidate);
      url.hash = "";
      const platform = socialPlatform(url);
      if (!platform || !isLikelyBusinessSocialProfile(url)) continue;
      byPlatform[platform] ||= url.href;
    } catch {
      // Ignore malformed URLs found in public HTML.
    }
  }

  return compactObject(byPlatform);
}

function profileFromHtml(html, finalUrl, source = "official_business_website") {
  return {
    finalUrl: finalUrl.href,
    emails: extractEmails(html),
    phones: extractPhones(html),
    socialLinks: extractSocialLinks(html, finalUrl),
    metadata: extractMetadata(html),
    scannedPages: [finalUrl.href],
    source
  };
}

function mergePublicProfiles(profiles = []) {
  const socialLinks = {};
  for (const profile of profiles) {
    Object.assign(socialLinks, profile?.socialLinks || {});
  }
  return {
    finalUrl: profiles.find((profile) => profile?.finalUrl)?.finalUrl || "",
    emails: unique(profiles.flatMap((profile) => profile?.emails || [])).slice(0, 10),
    phones: unique(profiles.flatMap((profile) => profile?.phones || [])).slice(0, 8),
    socialLinks: compactObject(socialLinks),
    metadata: compactObject(Object.assign({}, ...profiles.map((profile) => profile?.metadata || {}))),
    scannedPages: unique(profiles.flatMap((profile) => profile?.scannedPages || [])).slice(0, 8),
    source: "official_business_website"
  };
}

function sameOriginUrl(value, baseUrl) {
  try {
    const url = new URL(value, baseUrl);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    if (url.origin !== baseUrl.origin) return null;
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

function socialDiscoveryPageUrls(html, finalUrl) {
  const priorityPath = /(contact|about|social|links|connect|find-us|follow|impressum|kontakt|uber-uns)/i;
  const linked = extractHrefValues(html)
    .map((href) => sameOriginUrl(href, finalUrl))
    .filter((url) => url && priorityPath.test(`${url.pathname} ${url.search}`));
  const commonPaths = [
    "/contact",
    "/contact-us",
    "/about",
    "/about-us",
    "/links",
    "/social",
    "/connect",
    "/impressum",
    "/kontakt"
  ].map((path) => sameOriginUrl(path, finalUrl)).filter(Boolean);
  return unique([...linked, ...commonPaths].map((url) => url.href))
    .filter((href) => href !== finalUrl.href)
    .slice(0, 4)
    .map((href) => new URL(href));
}

async function fetchPublicHtml(url, timeoutMs = 4500) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "MATLeadsAIProX-AuditBot/1.0",
        "Range": "bytes=0-262144"
      }
    });
    if (!response.ok) return null;
    const finalUrl = new URL(response.url || url.href);
    if (finalUrl.origin !== url.origin) return null;
    const contentType = response.headers.get("content-type") || "";
    if (contentType && !contentType.includes("text/html") && !contentType.includes("application/xhtml")) return null;
    const rawHtml = (await response.text()).slice(0, 262144);
    return { rawHtml, finalUrl };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function discoverMorePublicProfilePages(homeHtml, finalUrl, currentProfile, { limit = 4, timeoutMs = 4500 } = {}) {
  if (Object.keys(currentProfile.socialLinks || {}).length >= 2) return [];
  const discovered = [];
  for (const pageUrl of socialDiscoveryPageUrls(homeHtml, finalUrl)) {
    if (discovered.length >= limit) break;
    const page = await fetchPublicHtml(pageUrl, timeoutMs);
    if (!page) continue;
    discovered.push(profileFromHtml(page.rawHtml, page.finalUrl, "official_business_website_linked_page"));
    const merged = mergePublicProfiles([currentProfile, ...discovered]);
    if (Object.keys(merged.socialLinks || {}).length >= 2 && merged.emails.length && merged.phones.length) break;
  }
  return discovered;
}

function extractMetadata(html) {
  const title = /<title[^>]*>([^<]{1,180})<\/title>/i.exec(html)?.[1];
  const description = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']{1,320})["']/i.exec(html)?.[1]
    || /<meta[^>]+content=["']([^"']{1,320})["'][^>]+name=["']description["']/i.exec(html)?.[1];
  return compactObject({
    title: title ? decodeHtml(title).replace(/\s+/g, " ").trim() : "",
    description: description ? decodeHtml(description).replace(/\s+/g, " ").trim() : ""
  });
}

function categorize(score) {
  if (score >= 80) return "Very High Opportunity";
  if (score >= 55) return "High Opportunity";
  if (score >= 30) return "Medium Opportunity";
  return "Low Opportunity";
}

function computeScore(checks, elapsedMs) {
  let score = 0;
  if (!checks.websiteExists) score += 50;
  if (!checks.mobileFriendly) score += 20;
  if (!checks.seoMetadata) score += 20;
  if (!checks.https) score += 10;
  if (elapsedMs > 2500) score += 15;
  if (checks.outdatedDesign) score += 20;
  if (!checks.contactForm) score += 10;
  if (!checks.bookingSystem) score += 15;
  return Math.min(score, 100);
}

export class WebsiteAuditService {
  fallbackAudit(reason = "") {
    const checks = {
      websiteExists: false,
      https: false,
      mobileFriendly: false,
      seoMetadata: false,
      contactForm: false,
      socialLinksFound: false,
      businessEmailDetected: false,
      bookingSystem: false,
      outdatedDesign: true
    };
    return { score: computeScore(checks, 0), category: categorize(computeScore(checks, 0)), checks, elapsedMs: 0, error: reason || undefined };
  }

  async audit(lead, { timeoutMs = 8000, discoverProfiles = true, profilePageLimit = 4, profilePageTimeoutMs = 4500 } = {}) {
    try {
      if (!lead.websiteUrl) {
        return this.fallbackAudit("");
      }

      let url;
      try {
        url = normalizeWebsiteUrl(lead.websiteUrl);
      } catch {
        return this.fallbackAudit("Invalid website URL");
      }
      try {
        await assertPublicHostname(url);
      } catch {
        return this.fallbackAudit("Website host blocked");
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const started = performance.now();

      try {
        const response = await fetch(url, {
          redirect: "follow",
          signal: controller.signal,
          headers: {
            "User-Agent": "MATLeadsAIProX-AuditBot/1.0",
            "Range": "bytes=0-524288"
          }
        });
      const elapsedMs = Math.round(performance.now() - started);
      const rawHtml = (await response.text()).slice(0, 524288);
      const html = rawHtml.toLowerCase();
      const finalUrl = new URL(response.url || url.href);
      const homeProfile = profileFromHtml(rawHtml, finalUrl);
      const discoveredProfiles = discoverProfiles
        ? await discoverMorePublicProfilePages(rawHtml, finalUrl, homeProfile, { limit: profilePageLimit, timeoutMs: profilePageTimeoutMs })
        : [];
      const publicProfile = mergePublicProfiles([homeProfile, ...discoveredProfiles]);
      const title = hasPattern(html, /<title[^>]*>[^<]{8,}<\/title>/i);
      const description = hasPattern(html, /<meta[^>]+name=["']description["'][^>]+content=["'][^"']{40,}/i);
      const checks = {
        websiteExists: response.ok,
        https: finalUrl.protocol === "https:",
        mobileFriendly: hasPattern(html, /<meta[^>]+name=["']viewport["']/i),
        seoMetadata: title && description,
        contactForm: hasPattern(html, /<form[\s>]/i) && hasPattern(html, /(contact|email|phone|message|name)/i),
        socialLinksFound: Object.keys(publicProfile.socialLinks).length > 0,
        businessEmailDetected: publicProfile.emails.length > 0,
        bookingSystem: hasPattern(html, /(book now|appointment|reservation|calendly|opentable|resy|acuityscheduling|mindbody|squareup)/i),
        outdatedDesign: !hasPattern(html, /(viewport|srcset|webp|avif|application\/ld\+json|module)/i)
      };
      const score = computeScore(checks, elapsedMs);
      return { score, category: categorize(score), checks, elapsedMs, status: response.status, publicProfile };
      } catch {
        clearTimeout(timeout);
        return this.fallbackAudit("Website audit timed out");
      } finally {
        clearTimeout(timeout);
      }
    } catch {
      return this.fallbackAudit("Website audit failed");
    }
  }
}
