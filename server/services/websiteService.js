import crypto from "node:crypto";
import { env } from "../config/env.js";
import { FirestoreRepository } from "../repositories/firestoreRepository.js";
import { NvidiaService } from "./nvidiaService.js";
import { PollinationsService } from "./pollinationsService.js";
import { AppError } from "../utils/errors.js";
import { hasRichVisibleContent } from "../utils/siteContent.js";
import { preparePublishedWebsiteHtml } from "../utils/websiteHtml.js";

const memoryWebsites = new Map();
const memoryByToken = new Map();

export function fallbackWebsiteHtml(lead = {}, plan = {}) {
  const name = String(lead.name || plan.businessName || "Your Business");
  const category = String(lead.businessType || lead.category || "Local Business");
  const address = String(lead.address || "");
  const phone = String(lead.phone || "");
  const email = String(lead.email || "");
  const e = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const accent = "#2563eb";
  const seed = String(lead.businessType || lead.category || name || "business").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24) || "business";
  const heroImg = String(plan.images?.hero || "").trim() || `https://picsum.photos/seed/${encodeURIComponent(seed)}/1600/900`;
  const galRaw = Array.isArray(plan.images?.gallery) ? plan.images.gallery.map((g) => String(g || "").trim()).filter(Boolean).slice(0, 3) : [];
  const gallery = galRaw.length ? galRaw : [1, 2, 3].map((n) => `https://picsum.photos/seed/${encodeURIComponent(seed + "-" + n)}/800/600`);
  const cta = String(plan.cta || (phone ? "Call us" : "Get in touch")).slice(0, 100);
  const ctaHref = phone ? `tel:${phone}` : "#contact";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(name)} | ${e(category)}</title><meta name="description" content="Learn about ${e(name)}, a ${e(category)} business."><style>*{box-sizing:border-box}body{margin:0;font-family:Inter,system-ui,Arial,sans-serif;color:#10203a;background:#f7f9fc;line-height:1.6}.hero{background:#10203a;color:#fff}.hero-inner,.wrap{max-width:1120px;margin:0 auto;padding:28px 22px}.hero-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:28px;align-items:center}.eyebrow{letter-spacing:.13em;text-transform:uppercase;font-size:.74rem;font-weight:800;color:#93c5fd}.hero h1{font-size:clamp(2.25rem,5vw,4.2rem);letter-spacing:-.045em;line-height:1.03;margin:.25em 0}.hero img{width:100%;min-height:280px;max-height:470px;object-fit:cover;border-radius:18px}.btn{display:inline-block;padding:13px 19px;border-radius:10px;font-weight:800;text-decoration:none}.btn-p{background:${accent};color:#fff}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}.card{background:#fff;border:1px solid #dbe4f0;border-radius:14px;padding:20px}.card h2,.card h3{margin-top:0}.gallery img{width:100%;height:200px;object-fit:cover;border-radius:12px}form{display:grid;gap:10px;max-width:560px}input,textarea{padding:12px;border:1px solid #b9c8dc;border-radius:10px;font:inherit}footer{padding:26px 22px;background:#10203a;color:#d9e3f1;text-align:center}@media(max-width:720px){.hero-grid{grid-template-columns:1fr}.hero-inner,.wrap{padding:22px 16px}}</style></head><body><header class="hero"><div class="hero-inner hero-grid"><div><p class="eyebrow">${e(category)}</p><h1>${e(name)}</h1><p>A clear, mobile-ready online home for people who want to learn about this business and take the next step.</p><a class="btn btn-p" href="${e(ctaHref)}">${e(cta)}</a></div><img src="${e(heroImg)}" alt="${e(name)}"></div></header><main><section class="wrap"><div class="grid"><article class="card"><h2>Services and details</h2><p>Add verified services, availability, and pricing information so visitors can make an informed choice.</p></article><article class="card"><h2>Clear next steps</h2><p>Give customers a simple way to call, email, request information, or book when a verified channel is configured.</p></article><article class="card"><h2>Business information</h2><p>Keep contact information, service areas, credentials, and customer proof accurate as the business grows.</p></article></div></section><section class="wrap"><h2>Images</h2><div class="grid gallery">${gallery.map((g) => `<img src="${e(g)}" alt="${e(name)}">`).join("")}</div></section><section class="wrap" id="contact"><article class="card"><h2>Get in touch</h2>${phone ? `<p>Phone: <a href="tel:${e(phone)}">${e(phone)}</a></p>` : ""}${email ? `<p>Email: <a href="mailto:${e(email)}">${e(email)}</a></p>` : ""}${address ? `<p>${e(address)}</p>` : ""}<form><label>Your name<input name="name" autocomplete="name" required></label><label>Email<input type="email" name="email" autocomplete="email" required></label><label>Message<textarea name="message" rows="4"></textarea></label><button class="btn btn-p" type="submit">Send enquiry</button></form></article></section></main><footer>© ${new Date().getFullYear()} ${e(name)}. All rights reserved.</footer></body></html>`;
}

function savedBrief(options = {}) {
  return {
    businessName: String(options.businessName || "").slice(0, 160),
    style: String(options.style || "modern").slice(0, 80),
    palette: String(options.palette || "").slice(0, 80),
    pages: Math.min(4, Math.max(1, Number(options.pages) || 1)),
    design: String(options.design || "").slice(0, 80),
    tone: String(options.tone || "").slice(0, 80),
    targetAudience: String(options.targetAudience || "").slice(0, 400),
    primaryGoal: String(options.primaryGoal || "").slice(0, 40),
    location: String(options.location || "").slice(0, 160),
    services: String(options.services || "").slice(0, 1200),
    cta: String(options.cta || "").slice(0, 160),
    about: String(options.about || "").slice(0, 1200),
    language: String(options.language || "").slice(0, 40),
    followBrief: options.followBrief !== false,
    images: {
      hero: String(options.images?.hero || "").slice(0, 2000),
      gallery: Array.isArray(options.images?.gallery) ? options.images.gallery.map((image) => String(image || "").slice(0, 2000)).filter(Boolean).slice(0, 6) : [],
    },
  };
}

function preparedRecord(record) {
  if (!record?.html) return record || null;
  const html = preparePublishedWebsiteHtml(record.html);
  return html === record.html ? record : { ...record, html };
}

export class WebsiteService {
  constructor() {
    this.websites = new FirestoreRepository("aiWebsites");
    this.nvidia = new NvidiaService();
    this.pollinations = new PollinationsService();
  }
  websiteKey(user, leadId) {
    return `${user?.uid || "anon"}:${leadId || "lead"}`;
  }
  async build({ lead, options = {}, user }) {
    const { randomUUID } = await import("node:crypto");
    const id = randomUUID();
    const shareToken = randomUUID().replace(/-/g, "").slice(0, 24);
    const createdAt = new Date().toISOString();
    let html = "";
    let provider = "template";
    let model = "builtin-template-v1";
    let aiError = "";
    let pageCount = parseInt(options.pages, 10) || 1;
    // AI rule: Pollinations builds the site (cheap/free tier, no per-model activation).
    // NVIDIA stays available as an opt-in override via options.provider === "nvidia" only.
    const preferNvidia = String(options.provider || "").toLowerCase() === "nvidia";
    const builders = preferNvidia
      ? [{ name: "nvidia", run: () => this.nvidia.buildWebsite(lead, options) }]
      : [
        { name: "pollinations", run: () => this.pollinations.buildWebsite(lead, options) },
        ...(this.nvidia.configured() ? [{ name: "nvidia", run: () => this.nvidia.buildWebsite(lead, options) }] : []),
      ];
    const reasons = [];
    let built = null;
    for (const builder of builders) {
      try {
        const result = await builder.run();
        if (result.pageCount) pageCount = result.pageCount;
        // Require complete markup AND enough visible text that a CSS-only shell
        // (long but unreadable) can never be accepted as a finished site.
        const publishedHtml = preparePublishedWebsiteHtml(result.html || "");
        if (result.html && /<\/html>/i.test(result.html) && result.html.length > 800 && hasRichVisibleContent(publishedHtml)) {
          html = publishedHtml;
          provider = result.provider || builder.name;
          model = result.model;
          built = result;
          break;
        }
        if (result.html && /<\/html>/i.test(result.html) && result.html.length > 800 && !hasRichVisibleContent(result.html)) {
          reasons.push(`${builder.name}: AI build produced markup with too little readable content — asking the next provider.`);
        } else {
          reasons.push(`${builder.name}: AI build was incomplete — asking the next provider.`);
        }
      } catch (e) {
        reasons.push(`${builder.name}: ${String(e?.message || "AI request failed").slice(0, 220)}`);
      }
    }
    if (!built) {
      html = preparePublishedWebsiteHtml(fallbackWebsiteHtml(lead, options));
      // Give the REAL, actionable reason — never a misleading "check API key" for a timeout.
      const raw = reasons.join(" ").slice(0, 900) || "AI build failed on every provider";
      let reason;
      if (/timed out/i.test(raw)) {
        reason = "The AI model was slow to answer this time. This is NOT an API key problem — just click Generate again to retry.";
      } else if (/Missing or invalid|POLLINATIONS_NOT_CONFIGURED|NVIDIA_NOT_CONFIGURED/i.test(raw)) {
        reason = "No AI key is set yet. Add POLLINATIONS_API_KEY in .env (get one at enter.pollinations.ai/keys), then restart.";
      } else if (/authorization failed|403|missing or invalid/i.test(raw)) {
        reason = raw.slice(0, 320) + " Add or replace POLLINATIONS_API_KEY in .env, then restart.";
      } else if (/POLLINATIONS_MODEL_DENIED|Pollinations key cannot use|Pollinations key is not allowed to use any of|model allow-list|isn.t allowed to use|allow it for this key/i.test(raw)) {
        const grantMatch = raw.match(/https:\/\/enter\.pollinations\.ai\/grant\?[^\s)\]">]+/);
        reason = "Pollinations key is blocked from the AI model (its model allow-list is empty). Owner fix: log in at enter.pollinations.ai and open " + (grantMatch ? grantMatch[0] : "https://enter.pollinations.ai/keys") + " to allow the text category - or set a full-access secret (sk_) key as POLLINATIONS_API_KEY. Then click Generate again.";
      } else {
        reason = `${raw.slice(0, 320)}. Click Generate again to retry; if it repeats, check POLLINATIONS_API_KEY.`;
      }
      aiError = `${reason} Used premium template so you still have a working site.`;
    }
    const record = { id, shareToken, ownerId: user?.uid || "anon", leadId: lead?.leadId || lead?.id || "", leadName: lead?.name || options.businessName || "Business", businessType: lead?.businessType || lead?.category || "", address: lead?.address || "", phone: lead?.phone || "", email: lead?.email || "", businessName: options.businessName || lead?.name || "Business", style: options.style || "modern", brief: savedBrief(options), html, provider, model, pageCount: pageCount, aiError, revisions: 1, history: [{ at: createdAt, instruction: "Initial AI website build" }], createdAt, updatedAt: createdAt };
    try { await this.websites.upsert(id, record); } catch {}
    memoryWebsites.set(id, record);
    memoryByToken.set(shareToken, id);
    return { website: record };
  }
  async refine({ id, instruction, user, provider }) {
    let record = null;
    try { record = await this.websites.findById(id); } catch {}
    record = record || memoryWebsites.get(id);
    if (!record) { const err = new Error("Website not found. Generate it first."); err.status = 404; err.code = "WEBSITE_NOT_FOUND"; throw err; }
    if (String(record.ownerId || "") !== String(user?.uid || "") && String(user?.role || "").toLowerCase() !== "admin") {
      const err = new Error("You can only refine your own websites."); err.status = 403; err.code = "FORBIDDEN"; throw err;
    }
    let result = null; try { result = await this.pollinations.refineWebsite(record.html, instruction, record); } catch (e) { if (this.nvidia.configured()) { result = await this.nvidia.refineWebsite(record.html, instruction, record); } else { throw e; } }
    if (!result.html || result.html.length <= 500) {
      throw new AppError("AI returned an incomplete website update. Your current site was not changed; please try again.", 503, "AI_REFINER_EMPTY");
    }
    const html = preparePublishedWebsiteHtml(result.html);
    if (!hasRichVisibleContent(html, { minWords: 20 })) {
      throw new AppError("AI returned an unsafe or empty website update. Your current site was not changed; please try again.", 503, "AI_REFINER_UNSAFE_OUTPUT");
    }
    const updated = { ...record, html, revisions: Number(record.revisions || 1) + 1, history: [...(record.history || []), { at: new Date().toISOString(), instruction }], updatedAt: new Date().toISOString() };
    try { await this.websites.upsert(id, updated); } catch {}
    memoryWebsites.set(id, updated);
    return { website: updated };
  }
  async getById(id) {
    try { const f = await this.websites.findById(id); if (f) return preparedRecord(f); } catch {}
    return preparedRecord(memoryWebsites.get(id));
  }
  // Every site the signed-in account owns, newest first — powers the Studio's
  // "Your websites" list. Admins see their own sites only, not everyone's.
  async listForUser(user) {
    const uid = String(user?.uid || "");
    let rows = [];
    try {
      rows = await this.websites.list({ limit: 200, where: [{ field: "ownerId", op: "==", value: uid }] });
    } catch {
      rows = [...memoryWebsites.values()].filter((w) => String(w.ownerId || "") === uid);
    }
    const merged = [...rows, ...[...memoryWebsites.values()].filter((w) => String(w.ownerId || "") === uid && !rows.find((r) => r.id === w.id))];
    return merged
      .map((w) => ({
        id: w.id,
        businessName: w.businessName || w.leadName || "Website",
        pageCount: Number(w.pageCount || 1),
        revisions: Number(w.revisions || 1),
        provider: w.provider || "",
        shareToken: w.shareToken || "",
        shareUrl: `/s/${w.shareToken}`,
        createdAt: w.createdAt || "",
        updatedAt: w.updatedAt || w.createdAt || ""
      }))
      .sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
  }
  async saveHtml(id, html, user) {
    let record = await this.getById(id);
    if (!record) { const e = new Error("Website not found."); e.status = 404; e.code = "WEBSITE_NOT_FOUND"; throw e; }
    if (String(record.ownerId || "") !== String(user?.uid || "") && String(user?.role || "").toLowerCase() !== "admin") {
      const e = new Error("You can only edit your own websites."); e.status = 403; e.code = "FORBIDDEN"; throw e;
    }
    const safeHtml = preparePublishedWebsiteHtml(html);
    if (!/<body\b/i.test(safeHtml) || safeHtml.length < 100) {
      throw new AppError("The edited website did not contain publishable HTML. Nothing was changed.", 400, "WEBSITE_HTML_INVALID");
    }
    const updated = { ...record, html: safeHtml, updatedAt: new Date().toISOString(), history: [...(record.history || []), { at: new Date().toISOString(), instruction: "Manual visual edit (no code)" }] };
    try { await this.websites.upsert(id, updated); } catch {}
    memoryWebsites.set(id, updated);
    return { website: updated, shareUrl: `/s/${updated.shareToken}` };
  }
  async getByToken(token) {
    const id = memoryByToken.get(token);
    if (id && memoryWebsites.get(id)) return preparedRecord(memoryWebsites.get(id));
    try { const all = await this.websites.list({ limit: 200 }); const f = all.find((w) => w.shareToken === token); if (f) return preparedRecord(f); } catch {}
    return null;
  }
}

