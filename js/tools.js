import { byId, requireAuth } from "./api.js";

const DRAFTS_KEY = "mat_business_tool_drafts_v1";
const compact = (value, fallback = "Not provided") => String(value || "").trim() || fallback;
const number = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const money = (value) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(number(value));
const slug = (value) => String(value || "business-tool").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "business-tool";

const fields = {
  business: { label: "Business or client", placeholder: "Lakeside Dental", required: true },
  service: { label: "Service", placeholder: "Website and booking setup", required: true },
  audience: { label: "Ideal customer", placeholder: "Local families needing a dentist", required: true },
  outcome: { label: "Desired outcome", placeholder: "More booked appointments", required: true },
  price: { label: "Price in USD", type: "number", min: 0, step: 1, placeholder: "999" },
  cost: { label: "Your costs in USD", type: "number", min: 0, step: 1, placeholder: "180" },
  hours: { label: "Estimated hours", type: "number", min: 0, step: 0.5, placeholder: "12" },
  monthlyGoal: { label: "Monthly income goal", type: "number", min: 0, step: 1, placeholder: "3000" },
  revenueGoal: { label: "Revenue target in USD", type: "number", min: 0, step: 1, placeholder: "500" },
  billableHours: { label: "Billable hours each month", type: "number", min: 1, step: 1, placeholder: "60" },
  client: { label: "Client name", placeholder: "Jordan", required: true },
  pain: { label: "Client problem", placeholder: "Their website does not generate enquiries", required: true, textarea: true },
  proof: { label: "Proof or observation", placeholder: "Their booking button is missing on mobile", required: true, textarea: true },
  channel: { label: "Channel", placeholder: "email or WhatsApp" },
  offer: { label: "Your offer", placeholder: "A paid website and booking audit", required: true },
  deadline: { label: "Deadline or next step", placeholder: "a 15 minute call this week" },
  niche: { label: "Niche", placeholder: "salon", required: true },
  topic: { label: "Topic", placeholder: "why online booking saves time", required: true },
  location: { label: "Location or market", placeholder: "Austin, Texas" },
  goal: { label: "Business goal", placeholder: "Book 3 paid audits", required: true },
  objection: { label: "Common objection", placeholder: "We cannot afford it right now" },
  deliverables: { label: "Deliverables", placeholder: "Five-page site, booking form, analytics", required: true, textarea: true },
  startDate: { label: "Start date", type: "date" },
  reviewLink: { label: "Review link or platform", placeholder: "Google Business Profile" }
};

const tools = [
  {
    id: "offer-builder", category: "Sales", title: "Offer Builder", description: "Turn a service into a clear client offer.", fields: ["business", "service", "audience", "outcome", "price", "deadline"],
    build: (d) => `OFFER FOR ${compact(d.business).toUpperCase()}\n\nService: ${compact(d.service)}\nBest for: ${compact(d.audience)}\nOutcome: ${compact(d.outcome)}\nInvestment: ${d.price ? money(d.price) : "Custom quote after a short audit"}\nNext step: ${compact(d.deadline, "Book a short discovery call")}\n\nSimple pitch:\nI help ${compact(d.audience)} get ${compact(d.outcome)} through ${compact(d.service)}. I can show you the plan first, then we decide whether it is a fit.`
  },
  {
    id: "service-pricing", category: "Pricing", title: "Service Price Calculator", description: "Set a price with a real margin and a clear client quote.", fields: ["service", "cost", "hours", "price"],
    build: (d) => {
      const price = number(d.price); const cost = number(d.cost); const hours = number(d.hours);
      const profit = price - cost; const margin = price > 0 ? Math.round((profit / price) * 100) : 0;
      return `SERVICE PRICING\n\nService: ${compact(d.service)}\nClient quote: ${money(price)}\nDelivery costs: ${money(cost)}\nGross profit: ${money(profit)}\nGross margin: ${margin}%\nEffective hourly revenue: ${hours ? money(price / hours) : "Add estimated hours"}\n\nClient line:\nThe investment for this scope is ${money(price)}. It includes the agreed deliverables, implementation and a handover review.`;
    }
  },
  {
    id: "profit-calculator", category: "Pricing", title: "Profit Calculator", description: "See profit, margin and revenue needed for a target.", fields: ["price", "cost", "monthlyGoal"],
    build: (d) => {
      const price = number(d.price); const cost = number(d.cost); const goal = number(d.monthlyGoal); const profit = price - cost;
      const projects = profit > 0 ? Math.ceil(goal / profit) : 0;
      return `PROFIT SNAPSHOT\n\nSale price: ${money(price)}\nCost per project: ${money(cost)}\nProfit per project: ${money(profit)}\nMargin: ${price ? Math.round((profit / price) * 100) : 0}%\nProjects needed for ${money(goal)} profit: ${projects || "Set a price above your cost"}\n\nDecision: ${profit > 0 ? `Each sale contributes ${money(profit)} toward your goal.` : "Raise the price or lower delivery costs before selling this offer."}`;
    }
  },
  {
    id: "hourly-rate", category: "Pricing", title: "Hourly Rate Planner", description: "Calculate a sustainable minimum rate for freelance work.", fields: ["monthlyGoal", "billableHours", "cost"],
    build: (d) => {
      const goal = number(d.monthlyGoal); const hours = number(d.billableHours, 1); const costs = number(d.cost);
      const rate = (goal + costs) / Math.max(hours, 1);
      return `HOURLY RATE PLAN\n\nIncome goal: ${money(goal)} per month\nMonthly business costs: ${money(costs)}\nBillable hours available: ${hours}\nMinimum rate: ${money(rate)} per hour\nSuggested quoted rate: ${money(Math.ceil(rate / 5) * 5)} per hour\n\nUse project pricing when possible. This is the floor that protects your time.`;
    }
  },
  {
    id: "proposal-scope", category: "Client Delivery", title: "Proposal Scope Builder", description: "Create clear scope, timeline and approval language.", fields: ["client", "service", "deliverables", "price", "deadline"],
    build: (d) => `PROJECT SCOPE FOR ${compact(d.client).toUpperCase()}\n\nProject: ${compact(d.service)}\nDeliverables:\n${compact(d.deliverables)}\nInvestment: ${d.price ? money(d.price) : "To be agreed"}\nTimeline: ${compact(d.deadline, "Confirmed after approval")}\n\nWorking agreement:\nWork starts after written approval and the agreed deposit. Requests outside this scope are quoted separately. Final files and access are handed over after final payment.`
  },
  {
    id: "cold-email", category: "Outreach", title: "Cold Email Writer", description: "Write a concise first email from a real observation.", fields: ["client", "business", "proof", "offer", "deadline"],
    build: (d) => `Subject: A quick idea for ${compact(d.business)}\n\nHi ${compact(d.client)},\n\nI noticed ${compact(d.proof).toLowerCase()}. That can make it harder for ready-to-buy customers to take the next step.\n\nI help businesses like ${compact(d.business)} with ${compact(d.offer)} so they can turn more visits into enquiries.\n\nWould you be open to ${compact(d.deadline, "a 15 minute call this week")} to see the opportunity?\n\nBest,\n[Your name]`
  },
  {
    id: "whatsapp-opener", category: "Outreach", title: "WhatsApp Opener", description: "Create a short, respectful WhatsApp first message.", fields: ["client", "business", "proof", "offer"],
    build: (d) => `Hi ${compact(d.client)}, I came across ${compact(d.business)} and noticed ${compact(d.proof).toLowerCase()}. I help local businesses improve this with ${compact(d.offer)}. I made a quick idea for you - would you like me to send it over?`
  },
  {
    id: "follow-up", category: "Outreach", title: "Follow-up Planner", description: "Get a calm, value-led follow-up sequence.", fields: ["client", "business", "offer", "objection"],
    build: (d) => `FOLLOW-UP SEQUENCE\n\nDay 2\nHi ${compact(d.client)}, just checking this reached you. I can send a quick example of how ${compact(d.offer)} could work for ${compact(d.business)}.\n\nDay 5\nHi ${compact(d.client)}, the main opportunity I see is a simpler path from visitor to enquiry. Would a 10 minute walkthrough be useful?\n\nDay 9\nHi ${compact(d.client)}, I will close the loop after this. If ${compact(d.objection, "timing or budget")} is the issue, I can suggest a smaller first step. Should I send it?`
  },
  {
    id: "discovery-questions", category: "Sales", title: "Discovery Questions", description: "Prepare the questions that uncover value before you quote.", fields: ["business", "service", "goal"],
    build: (d) => `DISCOVERY QUESTIONS FOR ${compact(d.business).toUpperCase()}\n\n1. What result would make ${compact(d.service)} feel worth it?\n2. How do customers find you today?\n3. Where do leads drop off before buying or booking?\n4. What does one new customer mean to the business?\n5. What have you tried already?\n6. Who needs to approve this?\n7. What is the cost of waiting another three months?\n8. If we achieve ${compact(d.goal)}, what changes for the business?\n\nClose with: Based on that, would you like a recommended first step and price?`
  },
  {
    id: "meeting-agenda", category: "Client Delivery", title: "Client Meeting Agenda", description: "Run a focused meeting that ends in a decision.", fields: ["client", "service", "goal", "deadline"],
    build: (d) => `MEETING AGENDA - ${compact(d.client)}\n\n1. Desired outcome: ${compact(d.goal)}\n2. Current situation and blockers\n3. Recommended ${compact(d.service)} plan\n4. Scope, timeline and responsibilities\n5. Investment and payment milestones\n6. Decision and next step by ${compact(d.deadline, "the end of the meeting")}\n\nBefore the call: bring one proof point, one recommendation and one clear next step.`
  },
  {
    id: "project-brief", category: "Client Delivery", title: "Project Brief Builder", description: "Turn a conversation into a delivery-ready brief.", fields: ["client", "business", "service", "audience", "outcome", "deliverables", "startDate"],
    build: (d) => `PROJECT BRIEF\n\nClient: ${compact(d.client)}\nBusiness: ${compact(d.business)}\nProject: ${compact(d.service)}\nAudience: ${compact(d.audience)}\nSuccess outcome: ${compact(d.outcome)}\nDeliverables: ${compact(d.deliverables)}\nTarget start: ${compact(d.startDate, "To be confirmed")}\n\nOpen questions:\n- What must be approved before launch?\n- Who supplies copy, images and access?\n- What is the single most important conversion action?`
  },
  {
    id: "invoice-description", category: "Client Delivery", title: "Invoice Description", description: "Create a professional invoice line and payment note.", fields: ["client", "service", "deliverables", "price", "deadline"],
    build: (d) => `INVOICE DESCRIPTION\n\nClient: ${compact(d.client)}\nService: ${compact(d.service)}\nIncludes: ${compact(d.deliverables)}\nAmount due: ${d.price ? money(d.price) : "Add amount"}\nDue date: ${compact(d.deadline, "Due on receipt")}\n\nPayment note: Thank you for your business. Work begins or continues according to the agreed payment milestone.`
  },
  {
    id: "onboarding-checklist", category: "Client Delivery", title: "Client Onboarding Checklist", description: "Create a clean first-week handoff list.", fields: ["client", "service", "startDate"],
    build: (d) => `ONBOARDING CHECKLIST - ${compact(d.client).toUpperCase()}\n\n[ ] Agreement and payment confirmed\n[ ] Project goal for ${compact(d.service)} agreed\n[ ] Main contact and approval process confirmed\n[ ] Brand assets, logins and access received\n[ ] Content and image owners assigned\n[ ] Kickoff date: ${compact(d.startDate, "To be confirmed")}\n[ ] Progress update date scheduled\n[ ] Launch and handover criteria agreed`
  },
  {
    id: "content-calendar", category: "Marketing", title: "7-Day Content Calendar", description: "Plan one week of business content around a real offer.", fields: ["business", "niche", "offer", "goal"],
    build: (d) => `7-DAY CONTENT CALENDAR FOR ${compact(d.business).toUpperCase()}\n\nDay 1: Problem post - the biggest ${compact(d.niche)} mistake that blocks ${compact(d.goal)}.\nDay 2: Before and after - show the outcome of ${compact(d.offer)}.\nDay 3: FAQ - answer the most common buying question.\nDay 4: Proof - share a result, observation or mini case study.\nDay 5: Behind the scenes - explain your process.\nDay 6: Objection post - address price, time or trust concerns.\nDay 7: Direct offer - invite people to ask about ${compact(d.offer)}.\n\nUse one direct call to action on every post.`
  },
  {
    id: "social-caption", category: "Marketing", title: "Social Caption Writer", description: "Write a direct caption with a business call to action.", fields: ["business", "topic", "audience", "offer"],
    build: (d) => `${compact(d.topic)} is not just a nice extra. For ${compact(d.audience)}, it can be the difference between scrolling past and taking action.\n\nAt ${compact(d.business)}, we focus on simple improvements that make it easier to choose you.\n\nWant help with ${compact(d.offer)}? Send us a message and we will show you the first step.`
  },
  {
    id: "hashtag-pack", category: "Marketing", title: "Hashtag Pack", description: "Create a clean set of niche and local discoverability tags.", fields: ["niche", "location", "business"],
    build: (d) => `HASHTAG PACK\n\n#${slug(d.business)} #${slug(d.niche)} #${slug(d.location)} #smallbusiness #localbusiness #supportlocal #businessgrowth #customerexperience #digitalmarketing #entrepreneurlife #businessowner #onlinebusiness\n\nUse 5 to 10 relevant tags per post. Remove any that do not describe the post honestly.`
  },
  {
    id: "cta-generator", category: "Marketing", title: "CTA Generator", description: "Create calls to action for pages, posts and messages.", fields: ["offer", "outcome", "deadline"],
    build: (d) => `CALLS TO ACTION\n\n1. Get your ${compact(d.outcome)} plan\n2. Ask for a free first look\n3. Book your ${compact(d.offer)} call\n4. See what is blocking your growth\n5. Get a clear price and timeline\n6. Start before ${compact(d.deadline, "this week's slots fill")}\n\nBest short CTA: Get the plan\nBest direct CTA: Book a 15 minute call`
  },
  {
    id: "testimonial-request", category: "Retention", title: "Testimonial Request", description: "Ask for a useful review without sounding awkward.", fields: ["client", "service", "reviewLink"],
    build: (d) => `Hi ${compact(d.client)}, thank you again for trusting me with ${compact(d.service)}. If the work has been helpful, would you be willing to share a short review?\n\nA useful review mentions the problem you had, what we worked on and the result so far.\n\n${d.reviewLink ? `You can leave it here: ${d.reviewLink}` : "Reply here and I can turn your feedback into a short testimonial draft."}\n\nThank you - it helps other businesses feel confident choosing us.`
  },
  {
    id: "competitor-review", category: "Research", title: "Competitor Review Checklist", description: "Assess competitors before you make a sales recommendation.", fields: ["business", "niche", "location"],
    build: (d) => `COMPETITOR REVIEW - ${compact(d.business).toUpperCase()}\n\nMarket: ${compact(d.niche)} in ${compact(d.location)}\n\n[ ] Google rating and review volume\n[ ] Website speed and mobile clarity\n[ ] Clear service and pricing information\n[ ] Booking, enquiry or checkout flow\n[ ] Google Business Profile completeness\n[ ] Recent social content and response speed\n[ ] Proof: case studies, testimonials, photos\n[ ] Offer, guarantee or differentiator\n\nOpportunity: choose the one weak point customers feel before they contact a competitor.`
  },
  {
    id: "daily-revenue-plan", category: "Planning", title: "Daily Revenue Plan", description: "Turn one revenue target into actions for today.", fields: ["revenueGoal", "price", "offer", "hours"],
    build: (d) => {
      const goal = number(d.revenueGoal); const price = number(d.price); const hours = number(d.hours, 2); const sales = price > 0 ? Math.ceil(goal / price) : 1;
      return `DAILY REVENUE PLAN\n\nTarget: ${money(goal)}\nOffer: ${compact(d.offer)}\nPrice per sale: ${money(price)}\nSales needed: ${sales}\nFocused work time: ${hours} hours\n\n1. Build a list of 20 qualified businesses.\n2. Send 10 personalized first messages.\n3. Follow up with 10 warm leads.\n4. Ask 3 people for a 15 minute call.\n5. Send one proposal or pay link before the day ends.\n\nScore the day by conversations started and proposals sent, not only by instant sales.`;
    }
  }
];

let selectedTool = tools[0];
let drafts = loadDrafts();
let lastOutput = "";

function loadDrafts() {
  try {
    const value = JSON.parse(localStorage.getItem(DRAFTS_KEY) || "{}");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

function saveDrafts() {
  localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function selectedValues() {
  const form = byId("toolForm");
  return Object.fromEntries(new FormData(form).entries());
}

function renderTools(query = "") {
  const normalized = query.trim().toLowerCase();
  const matches = tools.filter((tool) => !normalized || `${tool.title} ${tool.category} ${tool.description}`.toLowerCase().includes(normalized));
  const grid = byId("toolGrid");
  if (!matches.length) {
    grid.innerHTML = '<div class="empty-state">No tools match that search.</div>';
    return;
  }
  grid.innerHTML = matches.map((tool) => `
    <button class="tool-card ${tool.id === selectedTool.id ? "active" : ""}" type="button" data-tool-id="${tool.id}" aria-pressed="${tool.id === selectedTool.id}">
      <span class="tool-card__category">${escapeHtml(tool.category)}</span>
      <strong>${escapeHtml(tool.title)}</strong>
      <span>${escapeHtml(tool.description)}</span>
    </button>
  `).join("");
}

function fieldMarkup(name) {
  const field = fields[name];
  const id = `tool-${name}`;
  const control = field.textarea
    ? `<textarea id="${id}" name="${name}" rows="3" ${field.required ? "required" : ""} placeholder="${escapeHtml(field.placeholder || "")}"></textarea>`
    : `<input id="${id}" name="${name}" type="${field.type || "text"}" ${field.min !== undefined ? `min="${field.min}"` : ""} ${field.step !== undefined ? `step="${field.step}"` : ""} ${field.required ? "required" : ""} placeholder="${escapeHtml(field.placeholder || "")}">`;
  return `<div class="field" ${field.textarea || name === "business" ? 'style="grid-column:1 / -1;"' : ""}><label for="${id}">${escapeHtml(field.label)}</label>${control}</div>`;
}

function renderWorkspace() {
  byId("toolCategory").textContent = selectedTool.category;
  byId("toolTitle").textContent = selectedTool.title;
  byId("toolDescription").textContent = selectedTool.description;
  const form = byId("toolForm");
  form.innerHTML = selectedTool.fields.map(fieldMarkup).join("");
  const draft = drafts[selectedTool.id]?.values || {};
  selectedTool.fields.forEach((name) => {
    const control = form.elements.namedItem(name);
    if (control && draft[name] !== undefined) control.value = draft[name];
  });
  lastOutput = drafts[selectedTool.id]?.output || "";
  byId("toolOutput").textContent = lastOutput || "Add your details, then select Create Result.";
  renderTools(byId("toolSearch").value);
}

function selectTool(id, updateAddress = true) {
  const next = tools.find((tool) => tool.id === id);
  if (!next) return;
  selectedTool = next;
  if (updateAddress) {
    const url = new URL(window.location.href);
    url.searchParams.set("tool", selectedTool.id);
    history.replaceState(null, "", url);
  }
  renderWorkspace();
}

function createOutput() {
  const form = byId("toolForm");
  if (!form.reportValidity()) return;
  const values = selectedValues();
  lastOutput = selectedTool.build(values);
  byId("toolOutput").textContent = lastOutput;
  drafts[selectedTool.id] = { values, output: lastOutput, updatedAt: new Date().toISOString() };
  saveDrafts();
}

async function copyOutput() {
  if (!lastOutput) return;
  try {
    await navigator.clipboard.writeText(lastOutput);
    flashButton("toolCopy", "Copied");
  } catch {
    byId("toolOutput").focus();
  }
}

function downloadOutput() {
  if (!lastOutput) return;
  const blob = new Blob([lastOutput], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${selectedTool.id}-${new Date().toISOString().slice(0, 10)}.txt`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function saveCurrentDraft() {
  drafts[selectedTool.id] = { values: selectedValues(), output: lastOutput, updatedAt: new Date().toISOString() };
  saveDrafts();
  flashButton("toolSave", "Saved");
}

function flashButton(id, label) {
  const button = byId(id);
  const original = button.textContent;
  button.textContent = label;
  setTimeout(() => { button.textContent = original; }, 1200);
}

document.addEventListener("DOMContentLoaded", () => {
  if (!requireAuth()) return;
  const requestedTool = new URLSearchParams(window.location.search).get("tool");
  if (requestedTool && tools.some((tool) => tool.id === requestedTool)) selectedTool = tools.find((tool) => tool.id === requestedTool);
  renderWorkspace();

  byId("toolSearch").addEventListener("input", (event) => renderTools(event.target.value));
  byId("toolGrid").addEventListener("click", (event) => {
    const card = event.target.closest("[data-tool-id]");
    if (card) selectTool(card.dataset.toolId);
  });
  byId("toolForm").addEventListener("submit", (event) => { event.preventDefault(); createOutput(); });
  byId("toolCopy").addEventListener("click", copyOutput);
  byId("toolDownload").addEventListener("click", downloadOutput);
  byId("toolSave").addEventListener("click", saveCurrentDraft);
});
