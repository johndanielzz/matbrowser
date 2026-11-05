import { apiFetch, byId, getCurrentUser, isProUser, requireAuth } from "./api.js";

import { inspectWebsiteHtml, qualityMarkup, qualityText } from "./site-quality.js";

// The editor works on a parsed copy of the site's HTML, applies the user's
// edits to that DOM, and writes it back. Nothing here needs a build step or a
// code editor â€” every control maps to a visible change in the preview.

let websiteId = "";
let shareToken = "";
let shareUrl = "";
let originalHtml = "";
let workingHtml = "";
let busy = false;
let activePageIndex = 0;
let dirty = false;

// The editable model: everything the panel can change.
const model = {
  businessName: "",
  headline: "",
  intro: "",
  ctaLabel: "",
  ctaUrl: "",
  phone: "",
  email: "",
  address: "",
  heroImage: "",
  services: [],
  faq: [],
  pages: [],
  nav: [],
  style: {
    preset: "custom",
    accent: "#0f172a",
    background: "#f4f6fb",
    text: "#16233a",
    font: "'Segoe UI',Inter,system-ui,Arial,sans-serif",
    headingScale: 100,
    rounded: true,
    shadows: false
  },
  seo: {
    title: "",
    description: "",
    keywords: ""
  }
};

const STYLE_PRESETS = {
  modern: { accent: "#2563eb", background: "#f6f8fc", text: "#14213d", font: "'Segoe UI',Inter,system-ui,Arial,sans-serif", rounded: true, shadows: true },
  editorial: { accent: "#b45309", background: "#fffaf2", text: "#2b2118", font: "Georgia,'Times New Roman',serif", rounded: false, shadows: false },
  warm: { accent: "#c2410c", background: "#fff7ed", text: "#431407", font: "'Trebuchet MS',Arial,sans-serif", rounded: true, shadows: true },
  contrast: { accent: "#111827", background: "#ffffff", text: "#111111", font: "'Segoe UI',Inter,system-ui,Arial,sans-serif", rounded: false, shadows: false },
};

const undoStack = [];
// Snapshot of the HTML from before the current edit burst. A burst is the
// run of "input" events between two "change" events (typing, dragging a
// slider, picking a colour). We snapshot on the first input of the burst so
// Undo always steps back to the state *before* the edit, not after it.
let pendingUndo = null;

// ---------- helpers ----------
function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setStatus(message, state = "info") {
  const node = byId("wedStatus");
  if (!node) return;
  node.textContent = message;
  node.classList.toggle("error", state === "error");
  node.classList.toggle("success", state === "success");
}

function setDirty(nextDirty) {
  dirty = Boolean(nextDirty);
  const node = byId("wedDirty");
  if (!node) return;
  node.textContent = dirty ? "Unsaved changes" : "Saved";
  node.classList.toggle("is-dirty", dirty);
}

function safeClientUrl(value, { image = false } = {}) {
  const raw = String(value || "").trim();
  if (!raw) return image ? "" : "#contact";
  if (/^(javascript|vbscript|file|filesystem):/i.test(raw.replace(/[\u0000-\u001f\s]/g, ""))) return image ? "" : "#contact";
  if (image && /^data:image\/(?:avif|gif|jpeg|jpg|png|svg\+xml|webp);/i.test(raw)) return raw;
  if (/^(https?:|mailto:|tel:|#|\/|\.\/|\.\.\/)/i.test(raw)) return raw;
  return image ? "" : "#contact";
}

function refreshQuality() {
  const target = byId("wedQuality");
  if (target) target.innerHTML = qualityMarkup(inspectWebsiteHtml(workingHtml || originalHtml));
}

function abs(url) {
  try { return new URL(url, window.location.origin).href; } catch { return url; }
}

function debounce(fn, wait = 260) {
  let timer = null;
  return (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

// Parse the site into a detached document so we can query and edit it safely.
function parseSite(html) {
  const parser = new DOMParser();
  return parser.parseFromString(String(html || ""), "text/html");
}

function serialize(doc) {
  return `<!doctype html>\n${doc.documentElement.outerHTML}`;
}

function pushUndo() {
  undoStack.push(workingHtml);
  if (undoStack.length > 40) undoStack.shift();
  pendingUndo = null;
  const btn = byId("wedUndo");
  if (btn) btn.disabled = undoStack.length === 0;
  setDirty(true);
}

// Called on the first "input" of an edit burst: remember the HTML as it was
// before the user touched anything, so Undo can restore it.
function captureUndo() {
  if (pendingUndo === null) {
    pendingUndo = workingHtml;
    undoStack.push(pendingUndo);
    if (undoStack.length > 40) undoStack.shift();
  }
  const btn = byId("wedUndo");
  if (btn) btn.disabled = undoStack.length === 0;
  setDirty(true);
}

function undo() {
  const previous = undoStack.pop();
  pendingUndo = null;
  if (!previous) return;
  workingHtml = previous;
  hydrateFromHtml();
  render();
  setStatus("Undid the last change.");
  const btn = byId("wedUndo");
  if (btn) btn.disabled = undoStack.length === 0;
  setDirty(workingHtml !== originalHtml);
}


// ---------- reading the site into the model ----------
function textOf(doc, selector) {
  const node = doc.querySelector(selector);
  return node ? String(node.textContent || "").trim() : "";
}

function readPages(doc) {
  const sections = [...doc.querySelectorAll("section.pg")];
  if (!sections.length) {
    // Single-page site: treat the body as the one page.
    const body = doc.querySelector("body");
    return [{
      title: textOf(doc, ".nav .brand") || "Home",
      headline: textOf(doc, "h1"),
      body: body ? String(body.textContent || "").trim().slice(0, 4000) : ""
    }];
  }
  const navTitles = [...doc.querySelectorAll(".nav .nav-a")].map((a) => String(a.textContent || "").trim());
  return sections.map((section, index) => ({
    title: navTitles[index] || `Page ${index + 1}`,
    headline: String(section.querySelector("h1,h2")?.textContent || "").trim(),
    body: pageBodyText(section)
  }));
}

// The editable body copy of a page. Only the paragraph the editor itself
// writes (.wed-pagebody) counts — reading the whole section would capture the
// headline, nav and service cards too, and then duplicate them on save.
function pageBodyText(section) {
  const node = section.querySelector(".wed-pagebody");
  return String(node?.textContent || "").trim().slice(0, 6000);
}

function readNav(doc) {
  const links = [...doc.querySelectorAll(".nav .nav-a")];
  if (!links.length) {
    const sections = [...doc.querySelectorAll("section.pg")];
    return sections.map((section, index) => ({
      label: String(section.querySelector("h1,h2")?.textContent || `Page ${index + 1}`).trim().slice(0, 40),
      target: index
    }));
  }
  return links.map((a, index) => ({
    label: String(a.textContent || "").trim(),
    target: index
  }));
}

function hydrateFromHtml() {
  const doc = parseSite(workingHtml || originalHtml);
  model.businessName = textOf(doc, ".nav .brand") || textOf(doc, "title") || "";
  model.headline = textOf(doc, "h1");
  model.intro = textOf(doc, "h1 + p") || textOf(doc, ".pg p");
  model.ctaLabel = textOf(doc, ".pg a.btn, .pg a[class*='btn']");
  model.ctaUrl = doc.querySelector(".pg a.btn, .pg a[class*='btn']")?.getAttribute("href") || "";
  model.phone = String(doc.body?.textContent || "").match(/\+?[\d][\d\s().-]{6,}\d/)?.[0] || "";
  model.email = String(doc.body?.textContent || "").match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0] || "";
  model.address = "";
  model.heroImage = doc.querySelector("img")?.getAttribute("src") || "";

  // Services: the first group of card-like headings on the home page.
  model.services = [...doc.querySelectorAll(".pg h3")]
    .map((n) => String(n.textContent || "").trim())
    .filter(Boolean)
    .slice(0, 8);

  // FAQ: headings that read like questions.
  model.faq = [...doc.querySelectorAll(".pg h3, .pg h4, .pg summary, .pg .faq-q")]
    .map((n) => String(n.textContent || "").trim())
    .filter((t) => t.length > 12 && t.includes("?"))
    .slice(0, 8);

  model.pages = readPages(doc);
  model.nav = readNav(doc);

  model.seo.title = doc.title || "";
  model.seo.description = doc.querySelector('meta[name="description"]')?.getAttribute("content") || "";
  model.seo.keywords = doc.querySelector('meta[name="keywords"]')?.getAttribute("content") || "";

  // Preserve visual editor settings after a save/reload when the editor's own
  // style override is present in the published HTML.
  const editorStyle = String(doc.querySelector("style[data-wed-style]")?.textContent || "");
  const cssValue = (pattern) => editorStyle.match(pattern)?.[1]?.trim() || "";
  model.style.accent = cssValue(/--wed-accent:([^;}]+)/i) || model.style.accent;
  model.style.background = cssValue(/--wed-bg:([^;}]+)/i) || model.style.background;
  model.style.text = cssValue(/--wed-text:([^;}]+)/i) || model.style.text;
  model.style.font = cssValue(/font-family:([^!;}]+)/i) || model.style.font;
  const headingScale = Number(cssValue(/h1,h2\{font-size:calc\(1em \* ([\d.]+)/i));
  if (Number.isFinite(headingScale) && headingScale > 0) model.style.headingScale = Math.round(headingScale * 100);
  model.style.rounded = !/border-radius:0!important/i.test(editorStyle);
  model.style.shadows = /box-shadow:(?!none)/i.test(editorStyle);
}


// ---------- writing the model back into the site ----------
function setMeta(doc, name, content) {
  let tag = doc.querySelector(`meta[name="${name}"]`);
  if (!tag) {
    tag = doc.createElement("meta");
    tag.setAttribute("name", name);
    doc.head.append(tag);
  }
  tag.setAttribute("content", String(content || ""));
}

function applyStyleOverrides(doc) {
  const style = model.style;
  let tag = doc.querySelector("style[data-wed-style]");
  if (!tag) {
    tag = doc.createElement("style");
    tag.setAttribute("data-wed-style", "1");
    doc.head.append(tag);
  }
  const radius = style.rounded ? "14px" : "0";
  const shadow = style.shadows ? "0 10px 30px rgba(15,23,42,.12)" : "none";
  tag.textContent = [
    `:root{--wed-accent:${style.accent};--wed-bg:${style.background};--wed-text:${style.text}}`,
    `body{background:${style.background}!important;color:${style.text}!important;font-family:${style.font}!important}`,
    `h1,h2{font-size:calc(1em * ${(style.headingScale / 100).toFixed(2)})}`,
    `.pg h3,.pg h4,.pg .card,.pg [class*="card"]{border-radius:${radius}!important;box-shadow:${shadow}!important}`,
    `a[class*="btn"],.btn{background:${style.accent}!important}`,
    `nav .nav-a.active,nav .nav-a:hover{background:${style.accent}!important}`
  ].join("");
}

function buildPageSection(page) {
  const e = esc;
  const ctaHref = safeClientUrl(model.ctaUrl);
  const heroImage = safeClientUrl(model.heroImage, { image: true });
  const services = model.services
    .map((s) => `<div class="wed-card" style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:20px"><h3 style="margin:.1em 0 .3em">${e(s)}</h3><p style="margin:0;color:#475569">${e(`Professional ${s.toLowerCase()} delivered with care and clear pricing.`)}</p></div>`)
    .join("");
  const faq = model.faq
    .map((q) => `<div class="wed-card" style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:20px"><h3 style="margin:.1em 0 .3em">${e(q)}</h3><p style="margin:0;color:#475569">${e("We keep the answer simple and honest - message us and we will walk you through it.")}</p></div>`)
    .join("");
  const contact = [
    model.phone ? `<p>${e(model.phone)}</p>` : "",
    model.email ? `<p>${e(model.email)}</p>` : "",
    model.address ? `<p>${e(model.address)}</p>` : ""
  ].filter(Boolean).join("");
  return [
    `<div class="wrap" style="text-align:center">`,
    `<p style="letter-spacing:3px;text-transform:uppercase;font-size:12px;color:#64748b;margin:18px 0 0;font-weight:700">${e(model.businessName || "Local Business")}</p>`,
    `<h1 style="font-size:clamp(2rem,5.4vw,3.4rem);margin:.2em 0;color:${e(model.style.text)}">${e(page.headline || model.headline || model.businessName || "Welcome")}</h1>`,
    model.intro ? `<p style="max-width:660px;margin:0 auto;color:#475569;font-size:1.08rem;line-height:1.6">${e(model.intro)}</p>` : "",
    page.body ? `<p class="wed-pagebody" style="max-width:660px;margin:14px auto 0;color:#475569;line-height:1.6">${e(page.body)}</p>` : "",
    `<div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;margin-top:18px">`,
    model.ctaLabel ? `<a href="${e(ctaHref)}" style="padding:14px 28px;border-radius:12px;background:${e(model.style.accent)};color:#fff;font-weight:700;text-decoration:none">${e(model.ctaLabel)}</a>` : "",
    `</div></div>`,
    heroImage ? `<img src="${e(heroImage)}" alt="${e(model.businessName || "Business")}" style="width:100%;max-height:440px;object-fit:cover;display:block;margin-top:20px">` : "",
    services ? `<div class="wrap"><h2>What we do</h2><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:16px;margin-top:16px">${services}</div></div>` : "",
    faq ? `<div class="wrap"><h2>Questions</h2><div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px;margin-top:16px">${faq}</div></div>` : "",
    contact ? `<div class="wrap" id="contact"><h2>Get in touch</h2><div style="display:grid;gap:6px;margin-top:10px">${contact}</div></div>` : ""
  ].filter(Boolean).join("");
}


function applyModelToHtml() {
  const doc = parseSite(workingHtml || originalHtml);
  const e = esc;

  // Business name - nav brand and document title.
  if (model.businessName) {
    const brand = doc.querySelector(".nav .brand");
    if (brand) brand.textContent = model.businessName;
    doc.title = model.seo.title || `${model.businessName} | Official Website`;
  }

  // Headline / intro / CTA on the first page.
  const firstPage = doc.querySelector("section.pg");
  if (firstPage) {
    const h1 = firstPage.querySelector("h1");
    if (h1 && model.headline) h1.textContent = model.headline;
    const introNode = h1?.nextElementSibling?.tagName === "P" ? h1.nextElementSibling : firstPage.querySelector("p");
    if (introNode && model.intro) introNode.textContent = model.intro;
    const cta = firstPage.querySelector("a.btn, a[class*='btn']");
    if (cta) {
      if (model.ctaLabel) cta.textContent = model.ctaLabel;
      if (model.ctaUrl) cta.setAttribute("href", safeClientUrl(model.ctaUrl));
    }
  }

  // Per-page headline and title - written into every page section so the
  // Pages tab changes are actually visible in the preview.
  const pageSections = [...doc.querySelectorAll("section.pg")];
  model.pages.forEach((page, index) => {
    const section = pageSections[index];
    if (!section) return;
    // The first page's headline is owned by the global "Headline" field, so
    // that field always wins there; other pages use their own value.
    const headline = index === 0 ? (model.headline || page.headline) : page.headline;
    if (headline) {
      const heading = section.querySelector("h1, h2");
      if (heading) heading.textContent = headline;
    }
    if (page.title) {
      const heading = section.querySelector("h1, h2");
      if (heading) {
        const eyebrow = heading.previousElementSibling;
        // The generated layout puts a small uppercase business label above the
        // heading - use it to show the page title when there is one.
        if (eyebrow && eyebrow.tagName === "P" && /text-transform:\s*uppercase/i.test(eyebrow.getAttribute("style") || "")) {
          eyebrow.textContent = page.title;
        }
      }
    }
    if (page.body) {
      let bodyNode = section.querySelector(".wed-pagebody");
      if (!bodyNode) {
        const heading = section.querySelector("h1, h2");
        bodyNode = doc.createElement("p");
        bodyNode.className = "wed-pagebody";
        bodyNode.setAttribute("style", "max-width:660px;margin:14px auto 0;color:#475569;line-height:1.6");
        if (heading && heading.parentNode) heading.parentNode.insertBefore(bodyNode, heading.nextElementSibling);
        else section.append(bodyNode);
      }
      bodyNode.textContent = page.body;
    }
  });

  // Contact details - rewrite the contact block when the model has any.
  const contact = doc.querySelector("#contact, [id*='contact']");
  if (contact) {
    const rows = [
      model.phone ? `<p>${e(model.phone)}</p>` : "",
      model.email ? `<p>${e(model.email)}</p>` : "",
      model.address ? `<p>${e(model.address)}</p>` : ""
    ].filter(Boolean);
    if (rows.length) {
      const holder = contact.querySelector("div") || contact;
      holder.innerHTML = rows.join("");
    }
  }

  // Hero image - swap the first <img> when one exists.
  if (model.heroImage) {
    const img = doc.querySelector("img");
    const heroImage = safeClientUrl(model.heroImage, { image: true });
    if (img && heroImage) img.setAttribute("src", heroImage);
  }

  // Services - replace the first card group.
  if (model.services.length) {
    const grid = doc.querySelector(".pg [style*='grid-template-columns']");
    if (grid) {
      grid.innerHTML = model.services
        .map((s) => `<div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:20px"><h3 style="margin:.1em 0 .3em">${e(s)}</h3><p style="margin:0;color:#475569">${e(`Professional ${s.toLowerCase()} delivered with care.`)}</p></div>`)
        .join("");
    }
  }

  // FAQ - replace question-like headings.
  if (model.faq.length) {
    const questions = [...doc.querySelectorAll(".pg h3, .pg h4")].filter((n) => String(n.textContent || "").includes("?"));
    questions.slice(0, model.faq.length).forEach((node, index) => { node.textContent = model.faq[index]; });
  }

  // Pages - rebuild the section list when the page set changed.
  const existing = [...doc.querySelectorAll("section.pg")];
  if (model.pages.length !== existing.length) {
    existing.forEach((section) => section.remove());
    const nav = doc.querySelector(".nav");
    const anchor = nav ? nav.nextElementSibling : null;
    model.pages.forEach((page, index) => {
      const section = doc.createElement("section");
      section.className = "pg";
      section.id = `pg-${index}`;
      if (index !== 0) section.setAttribute("style", "display:none");
      section.innerHTML = buildPageSection(page);
      if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(section, anchor);
      else doc.body.append(section);
    });
  }

  // Navigation - rebuild the menu links from the model.
  const navEl = doc.querySelector(".nav");
  if (navEl && model.nav.length) {
    navEl.querySelectorAll(".nav-a").forEach((a) => a.remove());
    model.nav.forEach((item, index) => {
      const a = doc.createElement("a");
      const pageIndex = Math.min(Math.max(0, Number(item.target ?? index)), Math.max(0, model.pages.length - 1));
      a.href = `#pg-${pageIndex}`;
      a.className = `nav-a${index === 0 ? " active" : ""}`;
      a.textContent = item.label || `Page ${index + 1}`;
      navEl.append(a);
    });
  }

  // SEO.
  if (model.seo.title) doc.title = model.seo.title;
  setMeta(doc, "description", model.seo.description);
  setMeta(doc, "keywords", model.seo.keywords);
  if (model.seo.description) {
    let og = doc.querySelector('meta[property="og:description"]');
    if (!og) { og = doc.createElement("meta"); og.setAttribute("property", "og:description"); doc.head.append(og); }
    og.setAttribute("content", model.seo.description);
  }

  applyStyleOverrides(doc);
  return serialize(doc);
}


// ---------- rendering ----------
function renderPreview() {
  const frame = byId("wedPreviewFrame");
  if (!frame) return;
  frame.setAttribute("sandbox", "allow-scripts allow-forms allow-popups");
  frame.srcdoc = workingHtml || originalHtml || "";
}

function render() {
  workingHtml = applyModelToHtml();
  renderPreview();
  refreshQuality();
}

function fillField(id, value) {
  const node = byId(id);
  if (node && document.activeElement !== node) node.value = value ?? "";
}

function renderPanel() {
  fillField("wedBusinessName", model.businessName);
  fillField("wedHeadline", model.headline);
  fillField("wedIntro", model.intro);
  fillField("wedCtaLabel", model.ctaLabel);
  fillField("wedCtaUrl", model.ctaUrl);
  fillField("wedPhone", model.phone);
  fillField("wedEmail", model.email);
  fillField("wedAddress", model.address);
  fillField("wedHeroImage", model.heroImage);
  fillField("wedServices", model.services.join("\n"));
  fillField("wedFaq", model.faq.join("\n"));
  fillField("wedSeoTitle", model.seo.title);
  fillField("wedSeoDescription", model.seo.description);
  fillField("wedSeoKeywords", model.seo.keywords);
  fillField("wedShareUrl", shareUrl ? abs(shareUrl) : "");

  fillField("wedAccent", model.style.accent);
  fillField("wedBackground", model.style.background);
  fillField("wedTextColor", model.style.text);
  fillField("wedFont", model.style.font);
  fillField("wedStylePreset", model.style.preset || "custom");
  fillField("wedHeadingScale", String(model.style.headingScale));
  const rounded = byId("wedRounded");
  if (rounded) rounded.checked = model.style.rounded;
  const shadows = byId("wedShadows");
  if (shadows) shadows.checked = model.style.shadows;

  renderPageSelect();
  renderNavList();
}

function renderPageSelect() {
  const select = byId("wedPageSelect");
  if (!select) return;
  select.innerHTML = model.pages
    .map((page, index) => `<option value="${index}">${esc(page.title || `Page ${index + 1}`)}</option>`)
    .join("");
  if (activePageIndex >= 0 && activePageIndex < model.pages.length) select.value = String(activePageIndex);
  renderPageFields();
}

function renderPageFields() {
  const page = model.pages[activePageIndex];
  if (!page) return;
  fillField("wedPageTitle", page.title);
  fillField("wedPageHeadline", page.headline);
  fillField("wedPageBody", page.body);
}

function renderNavList() {
  const list = byId("wedNavList");
  if (!list) return;
  if (!model.nav.length) {
    list.innerHTML = '<p class="wed-hint">No menu items yet - add one below.</p>';
    return;
  }
  list.innerHTML = model.nav.map((item, index) => `
    <div class="wed-navrow" data-nav-index="${index}">
      <input type="text" class="wed-navlabel" data-nav-index="${index}" value="${esc(item.label)}" placeholder="Menu label">
      <select class="wed-navtarget" data-nav-index="${index}" aria-label="Target page">
        ${model.pages.map((page, pIndex) => `<option value="${pIndex}"${pIndex === (item.target ?? index) ? " selected" : ""}>${esc(page.title || `Page ${pIndex + 1}`)}</option>`).join("")}
      </select>
      <button type="button" class="wed-navdel" data-nav-remove="${index}" aria-label="Remove menu item">X</button>
    </div>`).join("");
}


// ---------- editing actions ----------
const applyChange = debounce(() => {
  render();
}, 300);

// An "input" event starts an edit burst: snapshot the pre-edit HTML once,
// then re-render the preview. A "change" event ends the burst and finalises
// the model so Undo steps back to the state before the burst.
function commitChange() {
  pendingUndo = null;
  render();
  setDirty(true);
}

function bindTextFields() {
  const textFields = [
    ["wedBusinessName", "businessName"],
    ["wedHeadline", "headline"],
    ["wedIntro", "intro"],
    ["wedCtaLabel", "ctaLabel"],
    ["wedCtaUrl", "ctaUrl"],
    ["wedPhone", "phone"],
    ["wedEmail", "email"],
    ["wedAddress", "address"],
    ["wedHeroImage", "heroImage"]
  ];
  for (const [id, key] of textFields) {
    const node = byId(id);
    if (!node) continue;
    node.addEventListener("input", () => {
      captureUndo();
      model[key] = node.value;
      applyChange();
    });
    node.addEventListener("change", () => { model[key] = node.value; commitChange(); });
  }

  const lines = [
    ["wedServices", "services"],
    ["wedFaq", "faq"]
  ];
  for (const [id, key] of lines) {
    const node = byId(id);
    if (!node) continue;
    node.addEventListener("input", () => {
      captureUndo();
      model[key] = node.value.split("\n").map((s) => s.trim()).filter(Boolean);
      applyChange();
    });
    node.addEventListener("change", () => {
      model[key] = node.value.split("\n").map((s) => s.trim()).filter(Boolean);
      commitChange();
    });
  }

  const seoFields = [
    ["wedSeoTitle", "title"],
    ["wedSeoDescription", "description"],
    ["wedSeoKeywords", "keywords"]
  ];
  for (const [id, key] of seoFields) {
    const node = byId(id);
    if (!node) continue;
    node.addEventListener("input", () => {
      captureUndo();
      model.seo[key] = node.value;
      applyChange();
    });
    node.addEventListener("change", () => { model.seo[key] = node.value; commitChange(); });
  }
}

function bindStyleControls() {
  const colours = [
    ["wedAccent", "accent"],
    ["wedBackground", "background"],
    ["wedTextColor", "text"]
  ];
  for (const [id, key] of colours) {
    const node = byId(id);
    if (!node) continue;
    node.addEventListener("input", () => { captureUndo(); model.style[key] = node.value; model.style.preset = "custom"; fillField("wedStylePreset", "custom"); applyChange(); });
    node.addEventListener("change", () => { model.style[key] = node.value; model.style.preset = "custom"; fillField("wedStylePreset", "custom"); commitChange(); });
  }

  const font = byId("wedFont");
  font?.addEventListener("change", () => { captureUndo(); model.style.font = font.value; model.style.preset = "custom"; fillField("wedStylePreset", "custom"); commitChange(); });

  const preset = byId("wedStylePreset");
  preset?.addEventListener("change", () => {
    captureUndo();
    const picked = STYLE_PRESETS[preset.value];
    model.style.preset = picked ? preset.value : "custom";
    if (picked) Object.assign(model.style, picked);
    renderPanel();
    commitChange();
  });

  const scale = byId("wedHeadingScale");
  scale?.addEventListener("input", () => { captureUndo(); model.style.headingScale = Number(scale.value || 100); model.style.preset = "custom"; fillField("wedStylePreset", "custom"); applyChange(); });
  scale?.addEventListener("change", () => { model.style.headingScale = Number(scale.value || 100); model.style.preset = "custom"; fillField("wedStylePreset", "custom"); commitChange(); });

  const rounded = byId("wedRounded");
  rounded?.addEventListener("change", () => { captureUndo(); model.style.rounded = rounded.checked; model.style.preset = "custom"; fillField("wedStylePreset", "custom"); commitChange(); });

  const shadows = byId("wedShadows");
  shadows?.addEventListener("change", () => { captureUndo(); model.style.shadows = shadows.checked; model.style.preset = "custom"; fillField("wedStylePreset", "custom"); commitChange(); });
}


function bindPageControls() {
  const select = byId("wedPageSelect");
  select?.addEventListener("change", () => {
    activePageIndex = Number(select.value || 0);
    renderPageFields();
  });

  const title = byId("wedPageTitle");
  title?.addEventListener("input", () => {
    const page = model.pages[activePageIndex];
    if (!page) return;
    captureUndo();
    page.title = title.value;
    applyChange();
  });
  title?.addEventListener("change", () => {
    const page = model.pages[activePageIndex];
    if (!page) return;
    page.title = title.value;
    commitChange();
    renderPageSelect();
  });

  const headline = byId("wedPageHeadline");
  headline?.addEventListener("input", () => {
    const page = model.pages[activePageIndex];
    if (!page) return;
    captureUndo();
    page.headline = headline.value;
    applyChange();
  });
  headline?.addEventListener("change", () => {
    const page = model.pages[activePageIndex];
    if (!page) return;
    page.headline = headline.value;
    commitChange();
  });

  const body = byId("wedPageBody");
  body?.addEventListener("input", () => {
    const page = model.pages[activePageIndex];
    if (!page) return;
    captureUndo();
    page.body = body.value;
    applyChange();
  });
  body?.addEventListener("change", () => {
    const page = model.pages[activePageIndex];
    if (!page) return;
    page.body = body.value;
    commitChange();
  });

  byId("wedAddPage")?.addEventListener("click", () => {
    pushUndo();
    model.pages.push({ title: `Page ${model.pages.length + 1}`, headline: "", body: "" });
    activePageIndex = model.pages.length - 1;
    render();
    renderPanel();
    setStatus("Page added. Give it a title and content.");
  });

  byId("wedRemovePage")?.addEventListener("click", () => {
    if (model.pages.length <= 1) {
      setStatus("A site needs at least one page.", "error");
      return;
    }
    pushUndo();
    model.pages.splice(activePageIndex, 1);
    model.nav = model.nav.filter((item) => (item.target ?? 0) !== activePageIndex);
    model.nav.forEach((item) => { if ((item.target ?? 0) > activePageIndex) item.target -= 1; });
    activePageIndex = Math.max(0, activePageIndex - 1);
    render();
    renderPanel();
    setStatus("Page removed.");
  });
}

function bindNavControls() {
  const list = byId("wedNavList");
  list?.addEventListener("input", (event) => {
    const labelInput = event.target.closest(".wed-navlabel");
    const targetSelect = event.target.closest(".wed-navtarget");
    if (labelInput) {
      const index = Number(labelInput.dataset.navIndex);
      captureUndo();
      if (model.nav[index]) model.nav[index].label = labelInput.value;
      applyChange();
      return;
    }
    if (targetSelect) {
      const index = Number(targetSelect.dataset.navIndex);
      captureUndo();
      if (model.nav[index]) model.nav[index].target = Number(targetSelect.value || 0);
      applyChange();
    }
  });
  list?.addEventListener("change", () => { commitChange(); });
  list?.addEventListener("click", (event) => {
    const remove = event.target.closest("[data-nav-remove]");
    if (!remove) return;
    pushUndo();
    model.nav.splice(Number(remove.dataset.navRemove), 1);
    render();
    renderPanel();
    setStatus("Menu item removed.");
  });

  byId("wedAddNav")?.addEventListener("click", () => {
    pushUndo();
    model.nav.push({ label: `Page ${model.pages.length + 1}`, target: Math.max(0, model.pages.length - 1) });
    render();
    renderPanel();
    setStatus("Menu item added.");
  });
}

function bindTabs() {
  const tabs = [...document.querySelectorAll("[data-wed-tab]")];
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.toggle("on", t === tab));
      const name = tab.dataset.wedTab;
      document.querySelectorAll("[data-wed-pane]").forEach((pane) => {
        pane.classList.toggle("on", pane.dataset.wedPane === name);
      });
    });
  });
}


// ---------- device toggle, upload, save ----------
function setDevice(device) {
  byId("wedPreviewFrame")?.classList.toggle("mobile", device === "mobile");
  byId("wedDesktop")?.classList.toggle("on", device === "desktop");
  byId("wedMobile")?.classList.toggle("on", device === "mobile");
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read that image file."));
    reader.readAsDataURL(file);
  });
}

function bindImageUpload() {
  const input = byId("wedFileInput");
  byId("wedUploadHero")?.addEventListener("click", () => input?.click());
  input?.addEventListener("change", async () => {
    const file = input.files?.[0];
    if (!file) return;
    const message = byId("wedUploadMsg");
    if (message) message.textContent = "Reading image...";
    try {
      const dataUrl = await readFileAsDataUrl(file);
      captureUndo();
      model.heroImage = dataUrl;
      commitChange();
      fillField("wedHeroImage", "");
      if (message) message.textContent = "Image added to the hero.";
      setStatus("Hero image updated.");
    } catch (error) {
      if (message) message.textContent = error.message;
      setStatus(error.message, "error");
    } finally {
      input.value = "";
    }
  });
}

async function saveSite() {
  if (busy) return;
  if (!websiteId) {
    setStatus("No site loaded - open the editor from Website Studio.", "error");
    return;
  }
  busy = true;
  const btn = byId("wedSave");
  const original = btn?.textContent;
  if (btn) { btn.disabled = true; btn.textContent = "Saving..."; }
  setStatus("Saving your changes...");
  try {
    workingHtml = applyModelToHtml();
    const result = await apiFetch(`/api/ai/websites/${encodeURIComponent(websiteId)}/html`, {
      method: "POST",
      body: JSON.stringify({ html: workingHtml })
    });
    if (result.website) {
      originalHtml = result.website.html;
      workingHtml = result.website.html;
      hydrateFromHtml();
      renderPanel();
      renderPreview();
      refreshQuality();
    }
    if (result.shareUrl) shareUrl = result.shareUrl;
    fillField("wedShareUrl", shareUrl ? abs(shareUrl) : "");
    setStatus("Saved and published. Your share link now shows these changes.", "success");
    setDirty(false);
  } catch (error) {
    setStatus(error.message || "We couldn't save your changes. Please try again.", "error");
  } finally {
    busy = false;
    if (btn) { btn.disabled = false; btn.textContent = original || "Save & publish"; }
  }
}

function downloadSite() {
  const html = workingHtml || originalHtml;
  if (!html) return;
  const slug = String(model.businessName || "website").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "website";
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${slug}.html`;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  setStatus("Downloaded the current draft. Publish separately when you are ready.", "success");
}

function resetDraft() {
  if (!dirty) {
    setStatus("There are no unsaved changes to reset.");
    return;
  }
  if (!window.confirm("Discard unsaved visual edits and restore the last published version?")) return;
  workingHtml = originalHtml;
  undoStack.length = 0;
  pendingUndo = null;
  activePageIndex = 0;
  hydrateFromHtml();
  render();
  renderPanel();
  const undoButton = byId("wedUndo");
  if (undoButton) undoButton.disabled = true;
  setDirty(false);
  setStatus("Restored the last published version.");
}

async function applyAiUpdate() {
  if (busy || !websiteId) return;
  const instructionNode = byId("wedAiInstruction");
  const instruction = String(instructionNode?.value || "").trim();
  if (!instruction) {
    setStatus("Describe the edit you want the AI to make.", "error");
    instructionNode?.focus();
    return;
  }
  if (dirty) {
    setStatus("Save or reset your visual edits before applying an AI update so no work is lost.", "error");
    return;
  }
  busy = true;
  const button = byId("wedAiApply");
  const originalLabel = button?.textContent;
  if (button) { button.disabled = true; button.textContent = "Applying AI update..."; }
  setStatus("Requesting the configured AI provider. This may take a moment...");
  try {
    const result = await apiFetch(`/api/ai/websites/${encodeURIComponent(websiteId)}`, {
      method: "PATCH",
      body: JSON.stringify({ instruction }),
    });
    if (!result.website?.html) throw new Error("The AI did not return a usable website update. Your published site was not changed.");
    originalHtml = result.website.html;
    workingHtml = result.website.html;
    shareUrl = result.shareUrl || shareUrl;
    hydrateFromHtml();
    render();
    renderPanel();
    undoStack.length = 0;
    pendingUndo = null;
    const undoButton = byId("wedUndo");
    if (undoButton) undoButton.disabled = true;
    if (instructionNode) instructionNode.value = "";
    byId("wedSiteName").textContent = `${result.website.businessName || result.website.leadName || "Your website"} - rev ${result.website.revisions || 1}`;
    setDirty(false);
    setStatus(`AI update applied and published (revision ${result.website.revisions || "new"}). Review the preview before sharing.`, "success");
  } catch (error) {
    setStatus(error.message || "The AI update could not be applied. Your current website was not changed.", "error");
  } finally {
    busy = false;
    if (button) { button.disabled = false; button.textContent = originalLabel || "Apply AI update"; }
  }
}

function bindQualityControls() {
  byId("wedRunQuality")?.addEventListener("click", () => {
    refreshQuality();
    setStatus("Markup readiness review refreshed.");
  });
  byId("wedCopyQuality")?.addEventListener("click", async () => {
    const report = qualityText(inspectWebsiteHtml(workingHtml || originalHtml));
    try {
      await navigator.clipboard.writeText(report);
      setStatus("Quality review copied.", "success");
    } catch {
      setStatus("Could not access the clipboard. Select the review text manually.", "error");
    }
  });
}

function bindAiControls() {
  document.querySelectorAll("[data-wed-ai-suggestion]").forEach((button) => {
    button.addEventListener("click", () => {
      const instruction = byId("wedAiInstruction");
      if (instruction) {
        instruction.value = String(button.dataset.wedAiSuggestion || "");
        instruction.focus();
      }
    });
  });
  byId("wedAiApply")?.addEventListener("click", applyAiUpdate);
}

function bindPreviewSelection() {
  window.addEventListener("message", (event) => {
    const frame = byId("wedPreviewFrame");
    if (!frame || event.source !== frame.contentWindow || event.data?.type !== "mat-site-selection") return;
    const data = event.data;
    const note = byId("wedSelectionNote");
    if (note) {
      note.hidden = false;
      note.textContent = data.text ? `Selected ${data.tagName}: ${String(data.text).slice(0, 90)}` : "Selected an element in the preview.";
    }
    const focusField = data.tagName === "h1" ? "wedHeadline" : (data.tagName === "a" || data.tagName === "button" ? "wedCtaLabel" : "");
    if (focusField) {
      document.querySelector('[data-wed-tab="content"]')?.click();
      window.setTimeout(() => byId(focusField)?.focus(), 0);
    }
  });
}

function openFullPreview() {
  const publishedUrl = !dirty && shareUrl ? abs(shareUrl) : "";
  const w = window.open(publishedUrl || "", "_blank");
  if (!w) {
    setStatus("Pop-up blocked - allow pop-ups for this site, then click Preview again.", "error");
    return;
  }
  if (!publishedUrl) {
    w.document.open();
    w.document.write(workingHtml || originalHtml);
    w.document.close();
  } else {
    try { w.opener = null; } catch {}
  }
}

function paintPlanBadge() {
  const pill = byId("wedPlan");
  if (!pill) return;
  const user = getCurrentUser();
  if (!user) { pill.textContent = "Sign in"; return; }
  if (String(user.role || "").toLowerCase() === "admin" || user.entitlements?.unlimitedAccess) {
    pill.textContent = "Admin - all features";
    return;
  }
  pill.textContent = isProUser(user) ? `${user.planName || user.subscription || "Pro"} plan` : "Pro required";
}


// ---------- initialization ----------
async function initEditor() {
  if (!requireAuth()) return;
  paintPlanBadge();

  const user = getCurrentUser();
  const isAdmin = String(user?.role || "").toLowerCase() === "admin" || user?.entitlements?.unlimitedAccess;
  if (!isAdmin && !isProUser(user)) {
    setStatus("The Website Editor unlocks on the Professional plan.", "error");
    window.location.href = "/pricing.html?upgrade=pro";
    return;
  }

  const params = new URLSearchParams(window.location.search);
  websiteId = params.get("id") || "";
  if (!websiteId) {
    setStatus("No website selected. Open the editor from Website Studio.", "error");
    return;
  }

  bindTabs();
  bindTextFields();
  bindStyleControls();
  bindPageControls();
  bindNavControls();
  bindImageUpload();
  bindAiControls();
  bindQualityControls();
  bindPreviewSelection();

  byId("wedDesktop")?.addEventListener("click", () => setDevice("desktop"));
  byId("wedMobile")?.addEventListener("click", () => setDevice("mobile"));
  byId("wedUndo")?.addEventListener("click", undo);
  byId("wedSave")?.addEventListener("click", saveSite);
  byId("wedPreview")?.addEventListener("click", openFullPreview);
  byId("wedDownload")?.addEventListener("click", downloadSite);
  byId("wedReset")?.addEventListener("click", resetDraft);
  byId("wedCopyLink")?.addEventListener("click", async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(abs(shareUrl));
      setStatus("Share link copied.", "success");
    } catch {
      setStatus(`Copy this link: ${abs(shareUrl)}`);
    }
  });

  setStatus("Loading your site...");
  try {
    const result = await apiFetch(`/api/ai/websites/${encodeURIComponent(websiteId)}`);
    originalHtml = result.website.html || "";
    workingHtml = originalHtml;
    shareToken = result.website.shareToken || "";
    shareUrl = result.shareUrl || "";
    byId("wedSiteName").textContent = `${result.website.businessName || result.website.leadName || "Your website"} - rev ${result.website.revisions || 1}`;
    hydrateFromHtml();
    render();
    renderPanel();
    const undoBtn = byId("wedUndo");
    if (undoBtn) undoBtn.disabled = true;
    setDirty(false);
    setStatus("Ready. Edit anything on the left - the preview updates as you type.", "success");
  } catch (error) {
    setStatus(error.message || "We couldn't open that website.", "error");
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initEditor);
} else {
  initEditor();
}

