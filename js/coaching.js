import { byId, requireAuth } from "./api.js";
import { mountMoneyStudio } from "./tool-engine.js";

const P = "Plain text, no markdown symbols. Keep it copy-paste ready.";

// Offline high-ticket price calculator.
function rateRun(v, out) {
  const goal = parseFloat(v.goal) || 0;
  const clients = parseFloat(v.clients) || 0;
  const weeks = parseFloat(v.weeks) || 0;
  const per = clients > 0 ? goal / clients : 0;
  const perWeek = clients > 0 ? clients / (weeks || 1) : 0;
  out.textContent =
    `High-Ticket Price Calculator\n` +
    `Income goal: $${goal.toFixed(2)}\n` +
    `Clients per program: ${clients}\n` +
    `Program length: ${weeks} weeks\n\n` +
    `Charge per client to hit goal: $${per.toFixed(2)}\n` +
    `That is about ${perWeek.toFixed(1)} clients per week to sign.\n\n` +
    (per >= 1000 ? "Strong high-ticket price. Lead with transformation, not hours." : per >= 300 ? "Solid mid-ticket. Raise the price by adding a bigger result or guarantee." : "Price feels low. Package the outcome and add bonuses to charge more.");
}

const tools = [
  { id: "offer", label: "Design Offer", title: "Design A High-Ticket Offer", hint: "A premium package clients happily pay for.",
    fields: [{ id: "expertise", label: "Your expertise", placeholder: "e.g. fitness for busy dads" }, { id: "result", label: "Result you deliver", placeholder: "e.g. lose 10kg in 12 weeks" }, { id: "who", label: "Ideal client", placeholder: "e.g. dads 30-45", wide: true }],
    build: (v) => `You are a high-ticket offer designer. Build a premium coaching/consulting offer.\nExpertise: ${v.expertise}\nResult: ${v.result}\nIdeal client: ${v.who}\n\nGive: a punchy offer name, the promise, what's included (3 deliverables), a fair price, and a guarantee that lowers risk. ${P}` },
  { id: "call", label: "Discovery Call", title: "Run A Discovery Call", hint: "A call script that qualifies and closes clients.",
    fields: [{ id: "service", label: "Your service", placeholder: "e.g. 1:1 business coaching" }, { id: "price", label: "Your price", placeholder: "e.g. $2000" }, { id: "doubt", label: "Common doubt", placeholder: "e.g. will it work for me", wide: true }],
    build: (v) => `You are a sales coach. Write a discovery-call script.\nService: ${v.service}\nPrice: ${v.price}\nCommon doubt: ${v.doubt}\n\nGive: opening questions, how to find their pain, the pitch, how to handle the doubt, and the close. Keep it conversational. ${P}` },
  { id: "curriculum", label: "Curriculum", title: "Build A Client Curriculum", hint: "A clear program so clients get results and stay.",
    fields: [{ id: "topic", label: "Program topic", placeholder: "e.g. launch a podcast" }, { id: "weeks", label: "Length", placeholder: "e.g. 6 weeks" }, { id: "result", label: "End result", placeholder: "e.g. 5 live episodes", wide: true }],
    build: (v) => `You are a program designer. Build a coaching curriculum.\nTopic: ${v.topic}\nLength: ${v.weeks}\nEnd result: ${v.result}\n\nGive: week-by-week milestones, one action per week, and a measurable win at the end. ${P}` },
  { id: "onboard", label: "Client Onboarding", title: "Onboard A New Client", hint: "A smooth start that prevents refunds and churn.",
    fields: [{ id: "service", label: "Service sold", placeholder: "e.g. 12-week coaching" }, { id: "client", label: "Client type", placeholder: "e.g. new business owner" }, { id: "need", label: "What they need first", placeholder: "e.g. clarity on goals", wide: true }],
    build: (v) => `You are a client-success expert. Write an onboarding flow.\nService: ${v.service}\nClient: ${v.client}\nFirst need: ${v.need}\n\nGive: a welcome message, what to send, the first-week agenda, and how to set expectations for a great result. ${P}` },
  { id: "rate", label: "Price Calculator", title: "High-Ticket Price Calculator", hint: "Set your price from your income goal.",
    run: rateRun,
    fields: [{ id: "goal", label: "Income goal ($)", value: "5000", type: "number" }, { id: "clients", label: "Clients per program", value: "5", type: "number" }, { id: "weeks", label: "Program weeks", value: "6", type: "number" }] },
  { id: "upsell", label: "Upsell", title: "Upsell To A Bigger Package", hint: "Turn one sale into a bigger one.",
    fields: [{ id: "base", label: "What they bought", placeholder: "e.g. a single session" }, { id: "next", label: "Bigger offer", placeholder: "e.g. 3-month package" }, { id: "why", label: "Why it helps", placeholder: "e.g. faster results", wide: true }],
    build: (v) => `You are an upsell specialist. Write an upsell message after a first sale.\nThey bought: ${v.base}\nBigger offer: ${v.next}\nWhy it helps: ${v.why}\n\nGive: a short thank-you + upsell message (under 80 words) that feels like help, not pressure. ${P}` }
];

document.addEventListener("DOMContentLoaded", () => {
  if (!requireAuth()) return;
  mountMoneyStudio(byId("studio"), tools);
});
