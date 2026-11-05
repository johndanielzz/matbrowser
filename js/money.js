import { apiFetch, byId, formatCurrency, requireAuth } from "./api.js";

let lastText = "";

const TOOLS = {
  ads: {
    title: "Ad Copy Generator",
    hint: "High-converting Facebook / Google ad copy you can charge a business for.",
    audienceLabel: "Target audience",
    build: (b, a, g) => `You are a direct-response copywriter. Write 3 high-converting paid ad variants (Facebook + Google) for this business.\nBusiness/niche: ${b}\nAudience: ${a}\nGoal/offer: ${g}\n\nFor each variant give: Headline, Primary text (under 60 words), Call-to-action button text, and a one-line targeting tip. End with the single best-performing variant marked WINNER. Plain text, no markdown symbols.`
  },
  social: {
    title: "Social Media Content Pack",
    hint: "A week of ready-to-post content a business will pay you to manage.",
    audienceLabel: "Brand voice",
    build: (b, a, g) => `You are a social media manager. Create a 7-day content pack for this business.\nBusiness/niche: ${b}\nBrand voice: ${a}\nGoal: ${g}\n\nFor each day give: Day number, post idea, ready-to-post caption with emojis, and 5 relevant hashtags. Plain text, no markdown symbols.`
  },
  email: {
    title: "Cold Email Sequence",
    hint: "A 3-email cold sequence that books calls and sells services.",
    audienceLabel: "Prospect type",
    build: (b, a, g) => `You are a B2B cold email expert. Write a 3-email cold outreach sequence.\nWhat I'm selling / my service: ${b}\nProspect type: ${a}\nDesired outcome: ${g}\n\nEmail 1 = intro + value, Email 2 = proof/case, Email 3 = breakup + soft CTA. Give each a subject line and body (under 120 words). Plain text, no markdown symbols.`
  },
  gig: {
    title: "Freelance Gig & Profile",
    hint: "A sellable Fiverr/Upwork gig title, description and price to start earning today.",
    audienceLabel: "Your skill",
    build: (b, a, g) => `You are a freelance coach helping students and adults earn online. Build a ready-to-post freelance gig.\nService idea / niche: ${b}\nMy skill/experience: ${a}\nTarget buyer: ${g}\n\nGive: 1 punchy gig title, a 150-word gig description, 3 package tiers with prices (Basic/Standard/Premium in USD), and 5 buyer-search tags. Plain text, no markdown symbols.`
  },
  pricing: {
    title: "Pricing Advice",
    hint: "Exactly what to charge a client so you never underprice again.",
    audienceLabel: "Client / market",
    build: (b, a, g) => `You are a pricing strategist. Tell me what to charge.\nMy service / deliverable: ${b}\nClient or market: ${a}\nConstraints / goal: ${g}\n\nGive: a recommended setup price range, a monthly retainer range, the exact number to quote first, one anchoring script line, and one objection reply for "that's too expensive". Plain text, no markdown symbols.`
  }
};

function calc() {
  const price = Number(byId("calcPrice").value) || 0;
  const hours = Number(byId("calcHours").value) || 0;
  const hourCost = Number(byId("calcHourCost").value) || 0;
  const fixed = Number(byId("calcFixed").value) || 0;
  const clients = Number(byId("calcClients").value) || 0;
  const goal = Number(byId("calcGoal").value) || 0;

  const jobCost = hours * hourCost;
  const profitPerJob = price - jobCost;
  const revenue = price * clients;
  const totalCost = jobCost * clients + fixed;
  const netProfit = revenue - totalCost;
  const margin = revenue > 0 ? Math.max(0, Math.round((netProfit / revenue) * 100)) : 0;
  const hourly = hours > 0 ? Math.round(profitPerJob / hours) : 0;
  const clientsNeeded = profitPerJob > 0 ? Math.ceil((goal + fixed) / profitPerJob) : 0;

  byId("calcOut").innerHTML = [
    ["Profit / job", formatCurrency(profitPerJob)],
    ["Effective / hour", formatCurrency(hourly)],
    ["Monthly revenue", formatCurrency(revenue)],
    ["Monthly costs", formatCurrency(totalCost)],
    ["Net profit / month", formatCurrency(netProfit)],
    ["Profit margin", `${margin}%`],
    ["Clients to hit goal", `${clientsNeeded} / month`]
  ].map(([k, v]) => `<div class="card"><span>${k}</span><strong>${v}</strong></div>`).join("");
}

function selectTool(tool) {
  document.querySelectorAll("#moneyTabs [data-tool]").forEach((b) => b.classList.toggle("is-active", b.dataset.tool === tool));
  const isCalc = tool === "calc";
  byId("calcPanel").hidden = !isCalc;
  byId("moneyForm").style.display = isCalc ? "none" : "";
  if (isCalc) { byId("moneyOut").textContent = "Use the calculator below — it updates instantly as you type."; calc(); return; }
  const t = TOOLS[tool];
  byId("moneyTitle").textContent = t.title;
  byId("moneyHint").textContent = t.hint;
  byId("moneyAudienceLabel").textContent = t.audienceLabel;
  byId("moneyOut").textContent = `${t.title} ready. Fill the fields and Generate.`;
}

document.addEventListener("DOMContentLoaded", async () => {
  if (!requireAuth()) return;
  selectTool("ads");

  byId("moneyTabs").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-tool]");
    if (btn) selectTool(btn.dataset.tool);
  });

  ["calcPrice", "calcHours", "calcHourCost", "calcFixed", "calcClients", "calcGoal"].forEach((id) => {
    byId(id)?.addEventListener("input", calc);
  });

  byId("moneyForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const active = document.querySelector("#moneyTabs [data-tool].is-active")?.dataset.tool || "ads";
    const tool = TOOLS[active];
    const business = byId("moneyBusiness").value.trim();
    const audience = byId("moneyAudience").value.trim();
    const goal = byId("moneyGoal").value.trim();
    if (!business) { byId("moneyOut").textContent = "Add the business / niche first."; return; }
    const btn = byId("moneySubmit");
    btn.disabled = true; const old = btn.textContent; btn.textContent = "Generating...";
    byId("moneyOut").textContent = "AI is writing your money asset (fast mode: max 12s)...";
    try {
      const r = await apiFetch("/api/ai/chat", { method: "POST", body: JSON.stringify({ prompt: tool.build(business, audience || "general audience", goal || "get more customers") }) });
      lastText = r.content || "";
      byId("moneyOut").textContent = lastText || "AI returned nothing — try again.";
    } catch (err) {
      byId("moneyOut").textContent = `${err?.message || "Request failed"} — try again; cached answers reply instantly.`;
    } finally { btn.disabled = false; btn.textContent = old; }
  });

  byId("moneyCopy").addEventListener("click", async () => {
    if (!lastText) return;
    await navigator.clipboard.writeText(lastText);
    byId("moneyOut").textContent = lastText + "\n\n(Copied — paste anywhere)";
  });

  byId("moneyWhats").addEventListener("click", () => {
    if (!lastText) return;
    window.open(`https://wa.me/?text=${encodeURIComponent(lastText.slice(0, 1500))}`, "_blank");
  });
});
