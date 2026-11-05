import { apiFetch, byId } from "./api.js";

// Shared money-tool studio engine. A page passes a list of tools; the engine
// renders tabs, a dynamic form, Generate (AI via /api/ai/chat) or live run
// (offline calculators), plus Copy + WhatsApp share. Reused by every money page.

function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

export function mountMoneyStudio(root, tools) {
  if (!root || !Array.isArray(tools) || !tools.length) return;
  let current = tools[0];
  let lastText = "";

  root.innerHTML = `
    <div class="toolbar" id="mtTabs" role="tablist" style="flex-wrap:wrap;gap:8px;margin-bottom:14px;"></div>
    <section class="detail-layout">
      <article class="panel">
        <h2 id="mtTitle"></h2>
        <p class="muted-value" id="mtHint"></p>
        <form id="mtForm" class="form-grid compact"></form>
        <div class="toolbar" style="margin-top:12px;">
          <button class="btn btn-secondary" type="button" id="mtCopy">Copy</button>
          <button class="btn btn-secondary" type="button" id="mtWhats">Share to WhatsApp</button>
        </div>
      </article>
      <article class="panel">
        <h2>Result</h2>
        <div id="mtOut" class="notice">Pick a tool, fill the fields, and Generate.</div>
      </article>
    </section>`;

  const tabs = byId("mtTabs");
  const form = byId("mtForm");
  const out = byId("mtOut");

  function renderTabs() {
    tabs.innerHTML = tools.map((t) => `<button class="btn btn-secondary ${t.id === current.id ? "is-active" : ""}" type="button" data-tool="${esc(t.id)}">${esc(t.label)}</button>`).join("");
  }

  function renderForm() {
    byId("mtTitle").textContent = current.title;
    byId("mtHint").textContent = current.hint;
    out.textContent = `${current.title} ready.`;
    if (current.run) {
      form.innerHTML = current.fields.map((f) => `<div class="field"><label for="f_${esc(f.id)}">${esc(f.label)}</label><input id="f_${esc(f.id)}" type="${f.type || "text"}" value="${esc(f.value ?? "")}" placeholder="${esc(f.placeholder || "")}"></div>`).join("");
      const runLive = () => current.run(readValues(), out);
      current.fields.forEach((f) => byId(`f_${f.id}`)?.addEventListener("input", runLive));
      runLive();
    } else {
      form.innerHTML = current.fields.map((f) => `<div class="field" style="${f.wide ? "grid-column:1 / -1;" : ""}"><label for="f_${esc(f.id)}">${esc(f.label)}</label>${f.textarea ? `<textarea id="f_${esc(f.id)}" rows="${f.rows || 3}" placeholder="${esc(f.placeholder || "")}"></textarea>` : `<input id="f_${esc(f.id)}" placeholder="${esc(f.placeholder || "")}">`}</div>`).join("")
        + `<button class="btn btn-primary" type="submit" id="mtGo">Generate</button>`;
    }
  }

  function readValues() {
    const v = {};
    current.fields.forEach((f) => { v[f.id] = (byId(`f_${f.id}`)?.value || "").trim(); });
    return v;
  }

  function select(tool) {
    current = tool; lastText = "";
    renderTabs(); renderForm();
  }

  tabs.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-tool]");
    const tool = tools.find((t) => t.id === btn?.dataset.tool);
    if (tool) select(tool);
  });

  form.addEventListener("submit", async (e) => {
    if (e.target.id !== "mtForm") return;
    e.preventDefault();
    const v = readValues();
    const btn = byId("mtGo");
    btn.disabled = true; const old = btn.textContent; btn.textContent = "Generating...";
    out.innerHTML = `<div class="loading-row"><div class="spinner" role="status" aria-label="Loading"></div><span class="muted-value">AI is writing your money asset (fast mode: max 12s)...</span></div>`;
    try {
      const r = await apiFetch("/api/ai/chat", { method: "POST", body: JSON.stringify({ prompt: current.build(v) }) });
      lastText = r.content || "";
      out.textContent = lastText || "AI returned nothing — try again.";
    } catch (err) {
      out.textContent = `${err?.message || "Request failed"} — try again; cached answers reply instantly.`;
    } finally { btn.disabled = false; btn.textContent = old; }
  });

  byId("mtCopy").addEventListener("click", async () => {
    if (!lastText) return;
    await navigator.clipboard.writeText(lastText);
    out.textContent = lastText + "\n\n(Copied — paste anywhere)";
  });
  byId("mtWhats").addEventListener("click", () => {
    if (!lastText) return;
    window.open(`https://wa.me/?text=${encodeURIComponent(lastText.slice(0, 1500))}`, "_blank");
  });

  select(current);
}
