import { apiFetch, byId, requireAuth } from "./api.js";
document.addEventListener("DOMContentLoaded", async () => {
  if (!requireAuth()) return;
  async function load() {
    try {
      const r = await apiFetch("/api/gigs");
      byId("gigList").innerHTML = r.gigs.map((g) => `<div class="audit-item"><span><strong>${g.title}</strong> • $${(g.payCents / 100).toFixed(0)} • ${g.level} • ${g.status}<br>${g.description || ""}</span><strong>${g.status === "open" ? `<button class="btn btn-secondary" data-claim="${g.id}">Claim</button>` : g.status}</strong></div>`).join("") || `<div class="empty-state">No gigs yet — post the first one.</div>`;
    } catch (e) { byId("gigList").textContent = e.message; }
  }
  await load();
  byId("gigForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await apiFetch("/api/gigs", { method: "POST", body: JSON.stringify({ title: byId("gigTitle").value, payUsd: Number(byId("gigPay").value), level: byId("gigLevel").value, description: byId("gigDesc").value }) });
      byId("gigMsg").textContent = "Gig posted.";
      await load();
    } catch (err) { byId("gigMsg").textContent = err.message; }
  });
  document.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-claim]");
    if (!b) return;
    try {
      const r = await apiFetch(`/api/gigs/${encodeURIComponent(b.dataset.claim)}/claim`, { method: "POST", body: "{}" });
      alert(`Claimed. Invoice pay link: ${r.invoice?.payLink || "see Earn Hub"}`);
      await load();
    } catch (err) { alert(err.message); }
  });
});
