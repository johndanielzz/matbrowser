import { apiFetch, byId } from "./api.js";

const form = byId("leadSearchForm");
const savedForm = byId("savedSearchForm");
const list = byId("savedSearchList");
const status = byId("savedSearchStatus");

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function readValue(id) {
  const node = byId(id);
  if (!node) return "";
  if (node.multiple) return [...node.selectedOptions].map((option) => option.value);
  if (node.type === "checkbox") return node.checked;
  return node.value;
}

function currentConfig() {
  const config = {};
  ["mapLink", "state", "city", "zip", "industry", "keyword", "radiusMeters", "searchDepth", "leadQuality", "sortBy", "minOpportunityScore", "limit", "requireContact", "missingWebsiteOnly"].forEach((id) => { config[id] = readValue(id); });
  config.countries = readValue("country");
  config.businessTypes = readValue("businessTypes");
  return config;
}

function applyConfig(config = {}) {
  Object.entries(config).forEach(([id, value]) => {
    const node = byId(id === "countries" ? "country" : id === "businessTypes" ? "businessTypes" : id);
    if (!node) return;
    if (node.multiple && Array.isArray(value)) [...node.options].forEach((option) => { option.selected = value.includes(option.value); });
    else if (node.type === "checkbox") node.checked = Boolean(value);
    else node.value = value ?? "";
    node.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function markRun(id) {
  try { await apiFetch(`/api/saved-searches/${encodeURIComponent(id)}/run`, { method: "POST" }); } catch { /* search itself remains usable if analytics storage is unavailable */ }
}

function render(searches) {
  if (!searches.length) {
    list.innerHTML = '<span class="muted-value">No saved searches yet. Save the filters above to build your reusable search library.</span>';
    return;
  }
  list.innerHTML = searches.map((search) => `<article class="saved-search-item"><div><strong>${esc(search.name)}</strong><span class="muted-value">${Number(search.runCount || 0)} run(s)${search.lastRunAt ? ` · last run ${esc(new Date(search.lastRunAt).toLocaleString())}` : ""}</span></div><div class="toolbar"><button class="btn btn-ghost" type="button" data-run-saved-search="${esc(search.id)}">Run</button><button class="btn btn-ghost" type="button" data-delete-saved-search="${esc(search.id)}">Delete</button></div></article>`).join("");
  list.querySelectorAll("[data-run-saved-search]").forEach((button) => button.addEventListener("click", async () => {
    const search = searches.find((item) => item.id === button.dataset.runSavedSearch);
    if (!search || !form) return;
    applyConfig(search.config);
    await markRun(search.id);
    status.textContent = `Loaded “${search.name}”. Starting search…`;
    form.requestSubmit();
  }));
  list.querySelectorAll("[data-delete-saved-search]").forEach((button) => button.addEventListener("click", async () => {
    if (!window.confirm("Delete this saved search?")) return;
    try { await apiFetch(`/api/saved-searches/${encodeURIComponent(button.dataset.deleteSavedSearch)}`, { method: "DELETE" }); await load(); }
    catch (error) { status.textContent = error.message || "Saved search could not be deleted."; }
  }));
}

async function load() {
  try { const result = await apiFetch("/api/saved-searches"); render(Array.isArray(result.searches) ? result.searches : []); }
  catch (error) { list.innerHTML = `<span class="muted-value">${esc(error.message || "Sign in to sync saved searches.")}</span>`; }
}

savedForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = byId("savedSearchName")?.value.trim();
  if (!name) return;
  status.textContent = "Saving…";
  try {
    await apiFetch("/api/saved-searches", { method: "POST", body: JSON.stringify({ name, config: currentConfig() }) });
    byId("savedSearchName").value = "";
    status.textContent = "Saved. You can rerun this search anytime.";
    await load();
  } catch (error) { status.textContent = error.message || "Saved search could not be saved."; }
});

load();
