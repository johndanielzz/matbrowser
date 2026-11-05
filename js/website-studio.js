import { apiFetch, byId, getCurrentUser, isProUser, requireAuth } from "./api.js";
import { inspectWebsiteHtml, qualityMarkup } from "./site-quality.js";

const SAVED_LEADS_KEY = "mat_local_saved_leads_v1";

let websiteId = "";
let shareToken = "";
let shareUrl = "";
let currentHtml = "";

// Conversation state machine: pages -> business -> building -> ready (refine).
let stage = "pages";
let chosenPages = 0;
let typedBusiness = "";
let selectedLead = null;
let savedLeads = [];
let busy = false;

function syncStage(next = stage) {
  const active = next === "pages" || next === "business" ? "brief" : next === "building" ? "build" : next === "ready" ? "review" : next === "published" ? "publish" : "brief";
  document.querySelectorAll("[data-wsx-stage]").forEach((node) => {
    const keys = ["brief", "build", "review", "publish"];
    node.classList.toggle("is-active", node.dataset.wsxStage === active);
    node.classList.toggle("is-complete", keys.indexOf(node.dataset.wsxStage) < keys.indexOf(active));
  });
}

// ---------- small helpers ----------
function abs(url) {
  try { return new URL(url, window.location.origin).href; } catch { return url; }
}

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setStatus(message) {
  const node = byId("studioStatus");
  if (node) {
    const title = node.querySelector("strong");
    const body = node.querySelector("span");
    if (title && body) body.textContent = message;
    else node.textContent = message;
  }
}

function setStatusLine(message) {
  const node = byId("studioStatusLine");
  if (node) node.textContent = message;
}

function setBriefValue(id, value, { overwrite = false } = {}) {
  const node = byId(id);
  if (!node || (node.value && !overwrite)) return;
  node.value = String(value || "");
}

function listHttpUrls(value, limit = 6) {
  return String(value || "").split(/\r?\n|,/).map((item) => item.trim()).filter((item) => {
    try {
      const parsed = new URL(item);
      return parsed.protocol === "https:" || parsed.protocol === "http:";
    } catch { return false; }
  }).slice(0, limit);
}

function readBrief() {
  const pages = Math.min(4, Math.max(1, Number(byId("wsxPages")?.value || chosenPages || 1)));
  const hero = listHttpUrls(byId("wsxHeroImage")?.value, 1)[0] || "";
  return {
    businessName: String(byId("wsxBusinessName")?.value || businessIdentity() || "").trim().slice(0, 160),
    businessType: String(byId("wsxBusinessType")?.value || "").trim().slice(0, 120),
    location: String(byId("wsxLocation")?.value || "").trim().slice(0, 160),
    targetAudience: String(byId("wsxAudience")?.value || "").trim().slice(0, 400),
    primaryGoal: String(byId("wsxGoal")?.value || "enquiries"),
    pages,
    style: String(byId("wsxStyle")?.value || "modern"),
    palette: String(byId("wsxPalette")?.value || "blue"),
    tone: String(byId("wsxTone")?.value || "professional"),
    language: String(byId("wsxLanguage")?.value || "English").trim().slice(0, 40),
    cta: String(byId("wsxCta")?.value || "").trim().slice(0, 160),
    services: String(byId("wsxServices")?.value || "").trim().slice(0, 1200),
    about: String(byId("wsxAbout")?.value || "").trim().slice(0, 1200),
    followBrief: Boolean(byId("wsxFollowBrief")?.checked),
    images: { hero, gallery: listHttpUrls(byId("wsxGalleryImages")?.value, 6) },
  };
}

function applyBrief(brief = {}) {
  if (!brief || typeof brief !== "object") return;
  setBriefValue("wsxBusinessName", brief.businessName, { overwrite: true });
  setBriefValue("wsxBusinessType", brief.businessType, { overwrite: true });
  setBriefValue("wsxLocation", brief.location, { overwrite: true });
  setBriefValue("wsxAudience", brief.targetAudience, { overwrite: true });
  setBriefValue("wsxGoal", brief.primaryGoal || "enquiries", { overwrite: true });
  setBriefValue("wsxPages", String(brief.pages || 1), { overwrite: true });
  setBriefValue("wsxStyle", brief.style || "modern", { overwrite: true });
  setBriefValue("wsxPalette", brief.palette || "blue", { overwrite: true });
  setBriefValue("wsxTone", brief.tone || "professional", { overwrite: true });
  setBriefValue("wsxLanguage", brief.language || "English", { overwrite: true });
  setBriefValue("wsxCta", brief.cta, { overwrite: true });
  setBriefValue("wsxServices", brief.services, { overwrite: true });
  setBriefValue("wsxAbout", brief.about, { overwrite: true });
  setBriefValue("wsxHeroImage", brief.images?.hero, { overwrite: true });
  setBriefValue("wsxGalleryImages", Array.isArray(brief.images?.gallery) ? brief.images.gallery.join("\n") : "", { overwrite: true });
  const follow = byId("wsxFollowBrief");
  if (follow) follow.checked = brief.followBrief !== false;
}

function syncBuildBriefButton() {
  const button = byId("wsxBuildBrief");
  if (button) button.disabled = busy;
}

function updateQuality() {
  const panel = byId("studioQuality");
  const body = byId("studioQualityBody");
  if (!panel || !body) return;
  if (!currentHtml) {
    panel.hidden = true;
    body.innerHTML = "";
    return;
  }
  panel.hidden = false;
  body.innerHTML = qualityMarkup(inspectWebsiteHtml(currentHtml));
}

// Same ID scheme as js/leads.js — every saved lead carries an ML-XXXXXX id.
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

// ---------- chat rendering (ChatGPT-style thread) ----------
function scrollLog() {
  const log = byId("chatLog");
  if (log) log.scrollTop = log.scrollHeight;
}

function addMessage(role, text, options = {}) {
  const log = byId("chatLog");
  if (!log) return null;
  const wrap = document.createElement("div");
  wrap.className = `wsx-msg wsx-msg--${role}`;
  if (role === "ai") {
    const who = document.createElement("span");
    who.className = "wsx-msg-role";
    who.textContent = "MAT Studio AI";
    wrap.append(who);
  }
  const body = document.createElement("div");
  body.className = "wsx-msg-body";
  wrap.append(body);
  log.append(wrap);
  scrollLog();
  if (options.html) body.innerHTML = text;
  else body.textContent = text;
  return body;
}

// Typewriter reveal, tuned so long messages still appear in under a second.
function typeAi(text) {
  const body = addMessage("ai", "");
  if (!body) return;
  const full = String(text || "");
  if (full.length > 600) {
    body.textContent = full;
    scrollLog();
    return;
  }
  const totalTicks = 50;
  const perTick = Math.max(1, Math.ceil(full.length / totalTicks));
  const step = Math.max(8, Math.min(16, Math.round(750 / totalTicks)));
  let index = 0;
  const tick = () => {
    index = Math.min(full.length, index + perTick);
    body.textContent = full.slice(0, index);
    scrollLog();
    if (index < full.length) setTimeout(tick, step);
  };
  tick();
}

function addUser(text) {
  addMessage("user", text);
}

// A quiet system line (build notes, loaded-site info) — styled apart from the
// user bubbles so the thread still reads like a normal conversation.
function addNote(text) {
  const wrap = document.createElement("div");
  wrap.className = "wsx-note";
  wrap.textContent = text;
  const log = byId("chatLog");
  if (!log) return;
  log.append(wrap);
  scrollLog();
}

function addTypingIndicator() {
  const log = byId("chatLog");
  if (!log) return null;
  const wrap = document.createElement("div");
  wrap.className = "wsx-msg wsx-msg--ai wsx-typing-ind";
  wrap.innerHTML = '<span class="wsx-msg-role">MAT Studio AI</span><div class="wsx-dots"><span></span><span></span><span></span></div>';
  log.append(wrap);
  scrollLog();
  return wrap;
}

function addErrorBubble(message, retryLabel, onRetry) {
  const body = addMessage("ai", "");
  if (!body) return;
  body.className = "wsx-msg-body wsx-err";
  body.textContent = message;
  if (retryLabel && typeof onRetry === "function") {
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "wsx-retry";
    retry.textContent = retryLabel;
    retry.addEventListener("click", () => {
      const bubble = retry.closest(".wsx-msg");
      bubble?.remove();
      onRetry();
    });
    body.append(document.createElement("br"), retry);
  }
  scrollLog();
}

function renderChips(chips = []) {
  const row = byId("wsxChips");
  if (!row) return;
  row.innerHTML = "";
  for (const chip of chips) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "wsx-chip";
    btn.textContent = chip.label;
    btn.addEventListener("click", () => {
      clearChips();
      if (typeof chip.onPick === "function") chip.onPick();
    });
    row.append(btn);
  }
}

function clearChips() {
  const row = byId("wsxChips");
  if (row) row.innerHTML = "";
}

// ---------- saved leads picker ----------
function readSavedLeads() {
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVED_LEADS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter((lead) => lead && lead.name) : [];
  } catch {
    return [];
  }
}

function writeSavedLeads(leads) {
  try { localStorage.setItem(SAVED_LEADS_KEY, JSON.stringify(leads.slice(0, 500))); } catch {}
}

function loadLeadPicker() {
  savedLeads = readSavedLeads();
  let changed = false;
  for (const lead of savedLeads) {
    if (!lead.leadId) {
      lead.leadId = makeLeadId();
      changed = true;
    }
  }
  if (changed) writeSavedLeads(savedLeads);

  const select = byId("wsxLeadSelect");
  if (!select) return;
  const placeholder = '<option value="">— Type a business name in the chat —</option>';
  const options = savedLeads.map((lead) =>
    `<option value="${esc(lead.leadId || lead.id || "")}">${esc(lead.leadId || "—")} — ${esc(lead.name)}</option>`
  );
  select.innerHTML = placeholder + options.join("");

  // Lead handed over from the Leads page (sessionStorage hand-off).
  try {
    const handoff = JSON.parse(sessionStorage.getItem("mat_studio_lead") || "null");
    if (!handoff?.name) return;
    const match = savedLeads.find((lead) =>
      (handoff.leadId && lead.leadId === handoff.leadId) ||
      (handoff.id && lead.id === handoff.id) ||
      (!handoff.leadId && !handoff.id && lead.name === handoff.name)
    );
    if (match) {
      select.value = match.leadId || match.id || "";
      applySelectedLead(match);
      return;
    }
    if (handoff.leadId) {
      // Live search lead that is not stored locally — still offer it.
      savedLeads.unshift(handoff);
      select.insertAdjacentHTML("afterbegin", `<option value="${esc(handoff.leadId)}">${esc(handoff.leadId)} — ${esc(handoff.name)}</option>`);
      select.value = handoff.leadId;
      applySelectedLead(handoff);
      return;
    }
    typedBusiness = String(handoff.name || "");
    setBriefValue("wsxBusinessName", typedBusiness, { overwrite: true });
  } catch {}
}

function applySelectedLead(lead) {
  selectedLead = lead || null;
  const card = byId("wsxLeadCard");
  if (!card) return;
  if (!lead) {
    card.hidden = true;
    return;
  }
  card.hidden = false;
  setBriefValue("wsxBusinessName", lead.name, { overwrite: true });
  setBriefValue("wsxBusinessType", lead.businessType || lead.category);
  setBriefValue("wsxLocation", lead.address || [lead.city, lead.state, lead.country].filter(Boolean).join(", "));
  setBriefValue("wsxCta", lead.phone ? "Call us" : "Get in touch");
  setBriefValue("wsxAudience", lead.businessType || lead.category ? `People looking for ${lead.businessType || lead.category} services` : "");
  setBriefValue("wsxServices", Array.isArray(lead.services) ? lead.services.join("\n") : lead.services || "");
  byId("wsxLeadName").textContent = lead.name || "Business";
  byId("wsxLeadId").textContent = lead.leadId || lead.id || "no id";
  byId("wsxLeadMeta").textContent = [lead.phone, lead.address].filter(Boolean).join(" • ");
}

function businessIdentity() {
  if (selectedLead?.name) return selectedLead.name;
  if (typedBusiness) return typedBusiness;
  return "";
}

// ---------- conversation flow ----------
function askPageCount() {
  stage = "pages";
  syncStage(stage);
  chosenPages = 0;
  typeAi("Hi! I'm MAT Studio AI 👋\nI'll design a professional website for your business.\nFirst — how many pages do you need?");
  renderChips([1, 2, 3, 4].map((n) => ({
    label: n === 1 ? "1 page" : `${n} pages`,
    onPick: () => pickPageCount(n)
  })));
  setStatus("Waiting for your page count…");
  setStatusLine("How many pages?");
}

function pickPageCount(count, silent = false) {
  chosenPages = count;
  syncStage("business");
  setBriefValue("wsxPages", String(count), { overwrite: true });
  if (!silent) addUser(count === 1 ? "1 page" : `${count} pages`);
  if (businessIdentity()) {
    beginBuild();
    return;
  }
  stage = "business";
  typeAi("Which business is it for?\nPick one of your saved leads above — or type the business name right here in the chat.");
  setStatus("Waiting for the business…");
  setStatusLine("Which business?");
}

function beginBuild() {
  if (busy) return;
  const brief = readBrief();
  const businessName = brief.businessName || businessIdentity();
  chosenPages = brief.pages || chosenPages;
  if (!chosenPages || !businessName) {
    if (!chosenPages) {
      askPageCount();
    } else {
      stage = "business";
      typeAi("Which business is it for? Pick a saved lead above, or type the business name here.");
      renderChips([]);
    }
    return;
  }
  stage = "building";
  syncStage(stage);
  const leadTag = selectedLead?.leadId ? ` (lead ${selectedLead.leadId})` : "";
  addNote(`Building for ${businessName}${leadTag}`);
  typeAi(`Building your ${chosenPages}-page website for ${businessName} now — hero, services, gallery, FAQ and contact. This takes about 30–50 seconds…`);
  renderChips([]);
  runBuild(businessName);
}

async function runBuild(businessName) {
  busy = true;
  syncBuildBriefButton();
  const send = byId("wsxSend");
  if (send) send.disabled = true;
  showOverlay(true);
  setStatusLine("Designing your site…");
  setStatus(`Building a ${chosenPages}-page site for ${businessName}…`);
  try {
    const brief = readBrief();
    const lead = { ...(selectedLead || {}) };
    lead.name = lead.name || businessName;
    lead.businessType = lead.businessType || lead.category || brief.businessType;
    lead.category = lead.category || brief.businessType;
    lead.address = lead.address || brief.location;
    const payload = {
      leadId: selectedLead?.leadId || selectedLead?.id || "",
      lead,
      businessName,
      pages: chosenPages,
      style: brief.style,
      palette: brief.palette,
      design: brief.style,
      tone: brief.tone,
      targetAudience: brief.targetAudience,
      primaryGoal: brief.primaryGoal,
      location: brief.location,
      services: brief.services,
      cta: brief.cta,
      about: brief.about,
      language: brief.language,
      followBrief: brief.followBrief,
      images: brief.images,
    };
    const r = await apiFetch("/api/ai/websites", { method: "POST", body: JSON.stringify(payload) });
    websiteId = r.websiteId;
    shareToken = r.shareToken;
    shareUrl = r.shareUrl || "";
    setPreview(r.website.html);
    enablePreviewActions(true);
    const pageLabel = r.website.pageCount && r.website.pageCount > 1 ? ` • ${r.website.pageCount} pages` : "";
    byId("studioMeta").textContent = `${r.website.businessName || businessName} • ${r.website.model || "site"}${pageLabel}`;
    const aiNote = r.website.aiError ? `\nNote: ${r.website.aiError}` : "";
    typeAi(`Done ✅ ${r.website.businessName || businessName} is live in the preview — ${r.website.pageCount || 1} page(s).\nUse Desktop / Mobile to check it, Copy link to share, or open Edit in builder for pixel-perfect changes.\nTell me any change in plain words — e.g. “make the hero darker” or “change the phone number”.${aiNote}`);
    setStatus(r.website.aiError ? `Built with a fallback: ${r.website.aiError}` : "Ready — chat to refine, or edit in the builder.");
    setStatusLine("Site ready — refine below");
    stage = "ready";
    syncStage(stage);
    loadHistory();
    try { history.replaceState(null, "", `/website-studio.html?id=${encodeURIComponent(websiteId)}`); } catch {}
  } catch (err) {
    const msg = String(err?.message || "The build didn't finish.");
    const upgrade = /pro plan|402|PRO_REQUIRED/i.test(msg);
    stage = "error";
    syncStage("brief");
    if (upgrade) {
      addErrorBubble(msg);
      renderChips([{ label: "Upgrade to Pro", onPick: () => { window.location.href = "/pricing.html?upgrade=pro"; } }]);
    } else {
      addErrorBubble(`The build didn't finish: ${msg}`, "Retry build", () => {
        stage = "building";
        runBuild(businessName);
      });
      renderChips([{ label: "Retry build", onPick: () => { stage = "building"; runBuild(businessName); } }]);
    }
    setStatus(msg);
    setStatusLine("Build failed — retry anytime");
  } finally {
    busy = false;
    showOverlay(false);
    if (send) send.disabled = false;
    syncBuildBriefButton();
  }
}

async function runRefine(instruction) {
  if (busy || !websiteId) return;
  busy = true;
  const indicator = addTypingIndicator();
  setStatus("Applying your change…");
  setStatusLine("Applying change…");
  try {
    const r = await apiFetch(`/api/ai/websites/${encodeURIComponent(websiteId)}`, {
      method: "PATCH",
      body: JSON.stringify({ instruction })
    });
    indicator?.remove();
    setPreview(r.website.html);
    const pageLabel = r.website.pageCount > 1 ? ` • ${r.website.pageCount} pages` : "";
    byId("studioMeta").textContent = `${r.website.businessName || ""} • rev ${r.website.revisions}${pageLabel}`.replace(/^ • /, "");
    addMessage("ai", `Applied ✅ (revision ${r.website.revisions}). Anything else you want to change?`);
    setStatus("Change applied.");
    setStatusLine("Site ready — refine below");
  } catch (err) {
    indicator?.remove();
    const msg = String(err?.message || "That change didn't apply.");
    const upgrade = /pro plan|402|PRO_REQUIRED/i.test(msg);
    addErrorBubble(msg, upgrade ? null : "Try again", upgrade ? null : () => runRefine(instruction));
    if (upgrade) {
      renderChips([{ label: "Upgrade to Pro", onPick: () => { window.location.href = "/pricing.html?upgrade=pro"; } }]);
    }
    setStatus(msg);
    setStatusLine("Site ready — refine below");
  } finally {
    busy = false;
  }
}

// ---------- preview ----------
function setPreview(html) {
  currentHtml = html || "";
  const frame = byId("studioPreview");
  if (frame) {
    frame.setAttribute("sandbox", "allow-scripts allow-forms allow-popups");
    frame.srcdoc = currentHtml;
  }
  updateQuality();
}

function showOverlay(show) {
  const overlay = byId("genOverlay");
  if (overlay) overlay.style.display = show ? "block" : "none";
}

function enablePreviewActions(enabled) {
  ["studioOpenPreview", "studioDownload", "studioCopyLink", "studioEditManual"].forEach((id) => {
    const btn = byId(id);
    if (btn) btn.disabled = !enabled;
  });
}

function setDevice(device) {
  byId("studioPreview")?.classList.toggle("mobile", device === "mobile");
  byId("viewDesktop")?.classList.toggle("on", device === "desktop");
  byId("viewMobile")?.classList.toggle("on", device === "mobile");
}

function openPreviewWindow() {
  if (!currentHtml) return;
  const target = shareUrl ? abs(shareUrl) : "";
  const w = window.open(target || "", "_blank");
  if (!w) {
    setStatus("Pop-up blocked — allow pop-ups for this site, then click Open again.");
    return;
  }
  if (!target) {
    w.document.open();
    w.document.write(currentHtml);
    w.document.close();
  } else {
    try { w.opener = null; } catch {}
  }
}

async function loadFromQuery() {
  const q = new URLSearchParams(window.location.search);
  const id = q.get("id") || "";
  if (!id) return false;
  setStatus("Loading website…");
  try {
    const r = await apiFetch(`/api/ai/websites/${encodeURIComponent(id)}`);
    websiteId = r.website.id;
    shareToken = r.website.shareToken || "";
    shareUrl = r.shareUrl || "";
    setPreview(r.website.html);
    applyBrief(r.website.brief || { businessName: r.website.businessName, pages: r.website.pageCount || 1 });
    chosenPages = chosenPages || Number(r.website.pageCount || 1);
    const pageLabel = r.website.pageCount > 1 ? ` • ${r.website.pageCount} pages` : "";
    byId("studioMeta").textContent = `${r.website.businessName || r.website.leadName || "Website"} • rev ${r.website.revisions}${pageLabel}`;
    enablePreviewActions(true);
    stage = "ready";
    addMessage("ai", `Loaded your site — ${r.website.businessName || r.website.leadName || "your business"}. Tell me what to change, or open Edit in builder.`);
    setStatus("Loaded — chat to refine.");
    setStatusLine("Site ready — refine below");
    return true;
  } catch (error) {
    addErrorBubble(`Couldn't load that website: ${error.message}`);
    setStatus(error.message);
    return false;
  }
}

// ---------- message router ----------
function handleUserMessage(raw) {
  const text = String(raw || "").trim();
  if (!text) return;
  addUser(text);

  if (stage === "pages") {
    const digits = text.match(/\b([1-4])\b/);
    if (digits) {
      pickPageCount(Number(digits[1]), true);
      return;
    }
    typeAi("Pick a page count with the chips below (1–4 pages) — that's the first thing I need 🙂");
    renderChips([1, 2, 3, 4].map((n) => ({
      label: n === 1 ? "1 page" : `${n} pages`,
      onPick: () => pickPageCount(n)
    })));
    return;
  }

  if (stage === "locked") {
    typeAi("The Studio unlocks on the Professional plan. Use the chip above to upgrade — everything else in your account keeps working.");
    return;
  }

  if (stage === "business") {
    typedBusiness = text.slice(0, 120);
    setBriefValue("wsxBusinessName", typedBusiness, { overwrite: true });
    beginBuild();
    return;
  }

  if (stage === "building") {
    typeAi("I'm still building your site — hang tight, one moment ✨");
    return;
  }

  if (stage === "error") {
    if (chosenPages && businessIdentity()) {
      stage = "building";
      runBuild(businessIdentity());
    } else {
      askPageCount();
    }
    return;
  }

  if (stage === "ready" && websiteId) {
    runRefine(text.slice(0, 2000));
    return;
  }

  askPageCount();
}

// ---------- output controls ----------
function downloadSite() {
  if (!currentHtml) return;
  const slug = (byId("studioMeta")?.textContent || "website")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "website";
  const blob = new Blob([currentHtml], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${slug}.html`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  setStatus("Downloaded. Open the file in any browser or host it anywhere.");
}

async function copyShareLink() {
  if (!shareUrl) {
    setStatus("No share link yet — build the site first.");
    return;
  }
  const link = abs(shareUrl);
  try {
    await navigator.clipboard.writeText(link);
    setStatus("Share link copied to your clipboard.");
  } catch {
    setStatus(`Copy this link: ${link}`);
  }
}

function openBuilder() {
  if (!websiteId) {
    setStatus("Build the site first, then open the editor.");
    return;
  }
  window.location.href = `/website-editor.html?id=${encodeURIComponent(websiteId)}`;
}

// ---------- composer ----------
function submitMessage(text) {
  const message = String(text ?? byId("wsxInput")?.value ?? "").trim();
  if (!message || busy) return;
  const input = byId("wsxInput");
  if (input) {
    input.value = "";
    input.style.height = "auto";
  }
  handleUserMessage(message);
}

function autoGrow(textarea) {
  if (!textarea) return;
  textarea.style.height = "auto";
  textarea.style.height = `${Math.min(160, textarea.scrollHeight)}px`;
}

function bindComposer() {
  const form = byId("wsxComposer");
  const input = byId("wsxInput");
  if (!form || !input) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    submitMessage();
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submitMessage();
    }
  });
  input.addEventListener("input", () => autoGrow(input));
}

function bindPreviewControls() {
  byId("viewDesktop")?.addEventListener("click", () => setDevice("desktop"));
  byId("viewMobile")?.addEventListener("click", () => setDevice("mobile"));
  byId("studioOpenPreview")?.addEventListener("click", openPreviewWindow);
  byId("studioDownload")?.addEventListener("click", downloadSite);
  byId("studioCopyLink")?.addEventListener("click", copyShareLink);
  byId("studioEditManual")?.addEventListener("click", openBuilder);
}

function bindLeadPicker() {
  const select = byId("wsxLeadSelect");
  if (!select) return;
  select.addEventListener("change", () => {
    const lead = savedLeads.find((item) => String(item.leadId || item.id || "") === select.value);
    if (lead) {
      applySelectedLead(lead);
      if (stage === "business") beginBuild();
    } else applySelectedLead(null);
  });
}

function buildFromBrief() {
  if (busy) return;
  const brief = readBrief();
  if (!brief.businessName) {
    setStatus("Add a business name before building the website.", "error");
    byId("wsxBusinessName")?.focus();
    return;
  }
  chosenPages = brief.pages;
  typedBusiness = brief.businessName;
  addUser(`Build brief: ${brief.businessName} · ${brief.pages} page${brief.pages === 1 ? "" : "s"} · ${brief.primaryGoal}`);
  beginBuild();
}

function bindBrief() {
  byId("wsxPages")?.addEventListener("change", () => {
    chosenPages = Number(byId("wsxPages")?.value || 1);
  });
  byId("wsxBuildBrief")?.addEventListener("click", buildFromBrief);
}

// ---------- your websites list ----------
async function loadHistory() {
  const list = byId("wsxHistory");
  if (!list) return;
  try {
    const result = await apiFetch("/api/ai/websites");
    const rows = Array.isArray(result.websites) ? result.websites : [];
    if (!rows.length) {
      list.innerHTML = '<p class="wsx-history-empty">No websites yet — your builds will appear here.</p>';
      return;
    }
    list.innerHTML = rows.map((row) => `
      <button type="button" class="wsx-history-item" data-site-id="${esc(row.id)}">
        <b>${esc(row.businessName || "Website")}</b>
        <small>${row.pageCount > 1 ? `${row.pageCount} pages` : "1 page"} • rev ${row.revisions || 1}</small>
      </button>`).join("");
  } catch {
    list.innerHTML = '<p class="wsx-history-empty">Could not load your websites right now.</p>';
  }
}

function bindHistory() {
  const list = byId("wsxHistory");
  list?.addEventListener("click", (event) => {
    const item = event.target.closest("[data-site-id]");
    if (!item) return;
    window.location.href = `/website-studio.html?id=${encodeURIComponent(item.dataset.siteId)}`;
  });
}

// "New chat" resets the thread but keeps the account and the saved leads.
function resetConversation() {
  const log = byId("chatLog");
  if (log) log.innerHTML = "";
  clearChips();
  websiteId = "";
  shareToken = "";
  shareUrl = "";
  currentHtml = "";
  stage = "pages";
  chosenPages = 0;
  typedBusiness = "";
  selectedLead = null;
  busy = false;
  enablePreviewActions(false);
  setPreview("");
  byId("studioMeta").textContent = "AI";
  applySelectedLead(null);
  ["wsxBusinessName", "wsxBusinessType", "wsxLocation", "wsxAudience", "wsxCta", "wsxServices", "wsxAbout", "wsxHeroImage", "wsxGalleryImages"].forEach((id) => setBriefValue(id, "", { overwrite: true }));
  setBriefValue("wsxGoal", "enquiries", { overwrite: true });
  setBriefValue("wsxPages", "1", { overwrite: true });
  setBriefValue("wsxStyle", "modern", { overwrite: true });
  setBriefValue("wsxPalette", "blue", { overwrite: true });
  setBriefValue("wsxTone", "professional", { overwrite: true });
  setBriefValue("wsxLanguage", "English", { overwrite: true });
  const follow = byId("wsxFollowBrief");
  if (follow) follow.checked = true;
  try { history.replaceState(null, "", "/website-studio.html"); } catch {}
  askPageCount();
}

// ---------- plan badge ----------
function paintPlanBadge() {
  const pill = byId("studioPlan");
  if (!pill) return;
  const user = getCurrentUser();
  if (!user) {
    pill.textContent = "Sign in to build";
    return;
  }
  if (String(user.role || "").toLowerCase() === "admin" || user.entitlements?.unlimitedAccess) {
    pill.textContent = "Admin — all features";
    return;
  }
  if (isProUser(user)) {
    pill.textContent = `${user.planName || user.subscription || "Pro"} — Studio unlocked`;
    return;
  }
  pill.textContent = "Pro required for Studio";
}

// ---------- initialization ----------
async function initStudio() {
  if (!requireAuth()) return;
  paintPlanBadge();

  bindComposer();
  bindPreviewControls();
  bindLeadPicker();
  bindBrief();
  bindHistory();
  loadLeadPicker();

  byId("wsxNewChat")?.addEventListener("click", resetConversation);

  // The Studio is a Pro feature — everyone else gets a clear upgrade path
  // instead of a failed build.
  const user = getCurrentUser();
  const isAdmin = String(user?.role || "").toLowerCase() === "admin" || user?.entitlements?.unlimitedAccess;
  if (!isAdmin && !isProUser(user)) {
    stage = "locked";
    typeAi("Website Studio is part of the Professional plan. Upgrade to unlock AI site generation, the visual builder and shareable client links.");
    renderChips([
      { label: "Upgrade to Pro", onPick: () => { window.location.href = "/pricing.html?upgrade=pro"; } },
      { label: "See pricing", onPick: () => { window.location.href = "/pricing.html"; } }
    ]);
    setStatus("Upgrade to Professional to use the Studio.");
    setStatusLine("Pro plan required");
    return;
  }

  // Deep link from the Leads page: ?leadId=…&business=…
  const params = new URLSearchParams(window.location.search);
  const leadId = params.get("leadId") || "";
  const business = params.get("business") || "";
  const siteId = params.get("id") || "";

  // Always show the owned-sites list, whatever the entry point.
  loadHistory();

  if (siteId) {
    const loaded = await loadFromQuery();
    if (loaded) return;
  }

  if (leadId) {
    let lead = savedLeads.find((item) => String(item.leadId || item.id || "") === String(leadId));
    if (!lead) {
      try {
        const result = await apiFetch(`/api/leads/${encodeURIComponent(leadId)}/report`);
        lead = result.lead;
      } catch {}
    }
    if (lead) {
      applySelectedLead(lead);
      const select = byId("wsxLeadSelect");
      if (select && ![...select.options].some((o) => o.value === String(lead.leadId || lead.id || ""))) {
        select.insertAdjacentHTML("afterbegin", `<option value="${esc(lead.leadId || lead.id || "")}">${esc(lead.leadId || "—")} — ${esc(lead.name)}</option>`);
      }
      if (select) select.value = String(lead.leadId || lead.id || "");
    } else if (business) {
      typedBusiness = business;
      setBriefValue("wsxBusinessName", business, { overwrite: true });
    }
  } else if (business) {
    typedBusiness = business;
    setBriefValue("wsxBusinessName", business, { overwrite: true });
  }

  askPageCount();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initStudio);
} else {
  initStudio();
}



