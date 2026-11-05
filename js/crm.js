import { apiFetch, byId, formatCurrency, requireAuth } from "./api.js";

const stages = ["New", "Contacted", "Follow Up", "Proposal Sent", "Meeting Scheduled", "Negotiation", "Won", "Lost"];

function renderPipeline(leads) {
  const target = byId("pipeline");
  if (!target) return;

  target.innerHTML = stages.map((stage) => {
    const stageLeads = leads.filter((lead) => (lead.stage || "New") === stage);
    return `
      <section class="pipeline-column">
        <h2>${stage} <span class="tag">${stageLeads.length}</span></h2>
        ${stageLeads.map((lead) => `
          <article class="deal-card">
            <strong>${lead.name}</strong>
            <span>${lead.category || "Local business"}</span>
            <span>${formatCurrency(lead.estimatedValue || 4500)}</span>
            <select data-stage="${lead.id}" aria-label="Move ${lead.name}">
              ${stages.map((option) => `<option ${option === stage ? "selected" : ""}>${option}</option>`).join("")}
            </select>
          </article>
        `).join("") || `<div class="empty-state">No leads</div>`}
      </section>
    `;
  }).join("");
}

async function loadCrm() {
  const target = byId("pipeline");
  if (!target) return;
  if (!requireAuth()) return;
  target.innerHTML = `<div class="skeleton">Loading CRM...</div>`;

  try {
    const result = await apiFetch("/api/crm/leads");
    renderPipeline(result.leads || []);
  } catch (error) {
    target.innerHTML = `<div class="error-state">${error.message}</div>`;
  }
}

function initStageUpdates() {
  document.addEventListener("change", async (event) => {
    const select = event.target.closest("[data-stage]");
    if (!select) return;
    if (!requireAuth()) return;

    await apiFetch(`/api/crm/leads/${encodeURIComponent(select.dataset.stage)}/stage`, {
      method: "PATCH",
      body: JSON.stringify({ stage: select.value })
    });
    loadCrm();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  loadCrm();
  initStageUpdates();
});
